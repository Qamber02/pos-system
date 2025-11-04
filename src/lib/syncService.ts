import { supabase } from '@/integrations/supabase/client';
import { db } from './db';
import { toast } from 'sonner';

class SyncService {
  private syncInProgress = false;
  private syncInterval: number | null = null;

  async startAutoSync(intervalMs: number = 30000) {
    if (this.syncInterval) return;
    this.syncInterval = window.setInterval(() => this.syncAll(), intervalMs);
    await this.syncAll();
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async syncAll() {
    if (this.syncInProgress) return;
    this.syncInProgress = true;
    console.log('Starting sync attempt...');

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        console.log('Sync skipped: Auth error (likely offline).', authError.message);
        this.syncInProgress = false;
        return;
      }
      if (!user) {
        console.log('Sync skipped: User not logged in.');
        this.syncInProgress = false;
        return;
      }

      // 1. PUSH local changes (uploads) FIRST
      await this.processSyncQueue();
      
      // 2. PULL remote changes (downloads) SECOND
      await this.syncProducts(user.id);
      await this.syncCategories(user.id);
      await this.syncCustomers(user.id); // Add this
      await this.syncSettings(user.id);   // Add this
      
      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  // --- DELTA SYNC FUNCTIONS ---

  private async syncProducts(userId: string) {
    try {
      const lastLocal = await db.products.orderBy('lastModified').last();
      const lastModifiedTime = lastLocal ? lastLocal.lastModified : 0;
      
      const { data, error } = await supabase
        .from('products')
        .select('id, name, retail_price, cost_price, stock_quantity, low_stock_threshold, category_id, user_id, updated_at')
        .eq('user_id', userId)
        .gt('updated_at', new Date(lastModifiedTime).toISOString());

      if (error) throw error;
      if (data && data.length > 0) {
        console.log(`Syncing ${data.length} new/updated products...`);
        await db.products.bulkPut(
          data.map(p => ({
            ...p,
            lastModified: new Date(p.updated_at).getTime(),
            synced: true,
          }))
        );
      }
    } catch (error) { console.error('Failed to sync products:', error); }
  }

  private async syncCategories(userId: string) {
    try {
      const lastLocal = await db.categories.orderBy('lastModified').last();
      const lastModifiedTime = lastLocal ? lastLocal.lastModified : 0;
      
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, description, color, user_id, updated_at')
        .eq('user_id', userId)
        .gt('updated_at', new Date(lastModifiedTime).toISOString());

      if (error) throw error;
      if (data && data.length > 0) {
        console.log(`Syncing ${data.length} new/updated categories...`);
        await db.categories.bulkPut(
          data.map(c => ({
            ...c,
            lastModified: new Date(c.updated_at).getTime(),
            synced: true,
          }))
        );
      }
    } catch (error) { console.error('Failed to sync categories:', error); }
  }

  private async syncCustomers(userId: string) {
    try {
      const lastLocal = await db.customers.orderBy('lastModified').last();
      const lastModifiedTime = lastLocal ? lastLocal.lastModified : 0;
      
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, email, phone, address, user_id, updated_at')
        .eq('user_id', userId)
        .gt('updated_at', new Date(lastModifiedTime).toISOString());

      if (error) throw error;
      if (data && data.length > 0) {
        console.log(`Syncing ${data.length} new/updated customers...`);
        await db.customers.bulkPut(
          data.map(c => ({
            ...c,
            lastModified: new Date(c.updated_at).getTime(),
            synced: true,
          }))
        );
      }
    } catch (error) { console.error('Failed to sync customers:', error); }
  }

  private async syncSettings(userId: string) {
    try {
      const lastLocal = await db.settings.get(userId);
      const lastModifiedTime = lastLocal ? lastLocal.lastModified : 0;
      
      const { data, error } = await supabase
        .from('settings')
        .select('user_id, business_name, logo_url, tax_rate, receipt_footer, updated_at')
        .eq('user_id', userId)
        .gt('updated_at', new Date(lastModifiedTime).toISOString())
        .single(); // Settings is just one row per user

      if (error) throw error;
      if (data) {
        console.log('Syncing settings...');
        await db.settings.put({
          ...data,
          id: data.user_id, // Use user_id as primary key
          lastModified: new Date(data.updated_at).getTime(),
          synced: true,
        });
      }
    } catch (error) { console.error('Failed to sync settings:', error); }
  }

  // --- SYNC QUEUE PROCESSING ---

  private async processSyncQueue() {
    const queue = await db.syncQueue.orderBy('timestamp').toArray();
    if (queue.length === 0) return;

    console.log(`Processing ${queue.length} items from sync queue...`);
    
    for (const item of queue) {
      try {
        await this.syncItem(item);
        await db.syncQueue.delete(item.id!);
      } catch (error: any) {
        console.error('Failed to sync item:', item, error);
        if (item.retryCount >= 3) {
          await db.syncQueue.delete(item.id!);
          toast.error('Failed to sync an item after 3 retries.');
        } else {
          await db.syncQueue.update(item.id!, { retryCount: item.retryCount + 1 });
        }
      }
    }
  }

  private async syncItem(item: any) {
    const { table, operation, data } = item;
    let { error } = { error: null };
    const { synced, lastModified, updated_at, ...dataForSupabase } = data;

    switch (operation) {
      case 'insert':
        ({ error } = await supabase.from(table).insert(dataForSupabase));
        break;
      case 'update':
        ({ error } = await supabase.from(table).update(dataForSupabase).eq('id', data.id));
        break;
      case 'delete':
        ({ error } = await supabase.from(table).delete().eq('id', data.id));
        break;
    }
    if (error) throw error;
  }

  async queueOperation(table: string, operation: 'insert' | 'update' | 'delete', data: any) {
    const operationData = {
      ...data,
      lastModified: Date.now(),
      synced: false,
    };

    // Update local DB immediately
    if (operation === 'insert') {
      await db.table(table).add(operationData);
    } else if (operation === 'update') {
      await db.table(table).update(data.id, operationData);
    } else if (operation === 'delete') {
      await db.table(table).delete(data.id);
    }
    
    // Add to sync queue
    await db.syncQueue.add({
      table,
      operation,
      data: operationData,
      timestamp: Date.now(),
      retryCount: 0
    });

    this.syncAll(); // Attempt to sync immediately
  }
}

export const syncService = new SyncService();