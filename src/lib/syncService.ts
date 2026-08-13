import { supabase } from '@/integrations/supabase/client';
import { db } from './db';
import { toast } from 'sonner';

class SyncService {
  private syncInProgress = false;
  private syncInterval: number | null = null;

  async startAutoSync(intervalMs: number = 30000) {
    if (this.syncInterval) return;

    // RESET FAILED ITEMS ON STARTUP
    // This ensures that if we fixed a bug (like dependency order), 
    // failed items get a chance to retry.
    await db.syncQueue
      .where('status').equals('failed')
      .modify({ status: 'pending', retryCount: 0 });

    this.syncInterval = window.setInterval(() => this.syncAll(), intervalMs);

    // Run one-time repair for any malformed queue items (Variant ID in product_id field)
    await this.repairQueueItems();

    await this.syncAll();
  }

  // Fixes old queue items where product_id was incorrectly set to variant_id
  private async repairQueueItems() {
    const pendingSaleItems = await db.syncQueue
      .where('table')
      .equals('saleItems')
      .filter(item => item.status === 'pending' || item.status === 'failed')
      .toArray();

    if (pendingSaleItems.length === 0) return;

    console.log(`Checking ${pendingSaleItems.length} pending sale items for repairs...`);

    for (const item of pendingSaleItems) {
      const currentProductId = item.data.product_id;

      // Check if this ID exists in productVariants table
      const variant = await db.productVariants.get(currentProductId);

      if (variant) {
        console.log(`Reparing malformed sale_item ${item.data.id}: Replacing Variant ID ${currentProductId} with Parent ID ${variant.product_id}`);

        // Update the queue item with the correct parent product ID
        const updatedData = {
          ...item.data,
          product_id: variant.product_id
        };

        await db.syncQueue.update(item.id!, {
          data: updatedData,
          status: 'pending', // Reset status to pending so it retries
          retryCount: 0
        });
      }
    }
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async syncAll(force: boolean = false) {
    if (this.syncInProgress) return;
    this.syncInProgress = true;
    console.log('Starting sync attempt...');

    try {
      // Reset any previously failed items to give them a chance to retry
      await db.syncQueue
        .where('status').equals('failed')
        .modify({ status: 'pending', retryCount: 0 });

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

      // 2. PULL remote changes (downloads) SECOND - Throttled Sequential Execution to avoid 429 Rate Limits
      const pullTasks = [
        () => this.syncProducts(user.id, force),
        () => this.syncCategories(user.id, force),
        () => this.syncCustomers(user.id, force),
        () => this.syncSettings(user.id, force),
        () => this.syncProductVariants(user.id, force),
        () => this.syncLoans(user.id, force),
        () => this.syncDeviceIdentifiers(user.id, force),
        () => this.syncPartCompatibility(user.id, force),
        () => this.syncRepairTickets(user.id, force),
        () => this.syncRepairTicketHistory(user.id, force),
        () => this.syncTechnicians(user.id, force),
        () => this.syncRepairTicketParts(user.id, force)
      ];

      for (const task of pullTasks) {
        await task();
        await new Promise(r => setTimeout(r, 100)); // 100ms throttle between table pulls
      }

      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  // --- DELTA SYNC FUNCTIONS ---

  private async syncProducts(userId: string, force: boolean) {
    try {
      const lastLocal = await db.products.orderBy('lastModified').last();
      const lastModifiedTime = force ? 0 : (lastLocal ? lastLocal.lastModified + 1 : 0);

      const { data, error } = await supabase
        .from('products')
        .select('id, name, description, barcode, retail_price, cost_price, stock_quantity, low_stock_threshold, category_id, is_serialized, condition_grade, is_repair_part, user_id, updated_at')
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
        if (data.length > 0 && force) toast.success(`Synced ${data.length} products from cloud`);
      }
    } catch (error) { console.error('Failed to sync products:', error); }
  }

  private async syncCategories(userId: string, force: boolean) {
    try {
      const lastLocal = await db.categories.orderBy('lastModified').last();
      const lastModifiedTime = force ? 0 : (lastLocal ? lastLocal.lastModified + 1 : 0);

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

  private async syncCustomers(userId: string, force: boolean) {
    try {
      const lastLocal = await db.customers.orderBy('lastModified').last();
      const lastModifiedTime = force ? 0 : (lastLocal ? lastLocal.lastModified + 1 : 0);

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

  private async syncSettings(userId: string, force: boolean) {
    try {
      const lastLocal = await db.settings.get(userId);
      const lastModifiedTime = force ? 0 : (lastLocal ? lastLocal.lastModified + 1 : 0);

      const { data, error } = await supabase
        .from('settings')
        .select('user_id, business_name, logo_url, tax_rate, currency_symbol, receipt_footer, updated_at')
        .eq('user_id', userId)
        .gt('updated_at', new Date(lastModifiedTime).toISOString())
        .maybeSingle(); // Use maybeSingle to avoid error if no settings exist

      if (error) throw error;

      if (data) {
        console.log('Syncing settings...');
        await db.settings.put({
          ...data,
          id: data.user_id, // Use user_id as primary key
          lastModified: new Date(data.updated_at).getTime(),
          synced: true,
        });
      } else if (!lastLocal) {
        // If no remote settings AND no local settings, create default
        console.log('No settings found, creating defaults...');
        const defaultSettings = {
          user_id: userId,
          business_name: 'My Store',
          logo_url: '',
          tax_rate: 0,
          currency_symbol: '$',
          receipt_footer: 'Thank you for your business!',
          updated_at: new Date().toISOString()
        };

        await db.settings.put({
          ...defaultSettings,
          id: userId,
          lastModified: Date.now(),
          synced: false // Mark as not synced so it pushes to cloud
        });
      }
    } catch (error) { console.error('Failed to sync settings:', error); }
  }

  private async syncProductVariants(userId: string, force: boolean) {
    try {
      const lastLocal = await db.productVariants.orderBy('lastModified').last();
      const lastModifiedTime = force ? 0 : (lastLocal ? lastLocal.lastModified + 1 : 0);

      console.log(`Syncing variants... Last local modified: ${new Date(lastModifiedTime).toISOString()}`);

      let query = supabase
        .from('product_variants')
        .select('id, product_id, variant_name, sku, price_adjustment, stock_quantity, is_active, is_serialized, condition_grade, user_id, updated_at')
        .eq('user_id', userId);

      // Only filter by updated_at if we have local data
      if (lastModifiedTime > 0) {
        query = query.gt('updated_at', new Date(lastModifiedTime).toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        console.log(`Syncing ${data.length} new/updated product variants...`);
        await db.productVariants.bulkPut(
          data.map((v: any) => ({
            id: v.id,
            product_id: v.product_id,
            variant_name: v.variant_name,
            sku: v.sku,
            price_adjustment: v.price_adjustment,
            stock_quantity: v.stock_quantity,
            is_active: v.is_active,
            is_serialized: v.is_serialized,
            condition_grade: v.condition_grade,
            user_id: v.user_id,
            updated_at: v.updated_at,
            lastModified: new Date(v.updated_at).getTime(),
            synced: true,
          }))
        );
        console.log("Variants synced successfully.");
      } else {
        console.log("No new variants to sync.");
      }
    } catch (error) {
      console.error('Failed to sync product variants:', error);
    }
  }

  private async syncLoans(userId: string, force: boolean) {
    try {
      const lastLocal = await db.loans.orderBy('lastModified').last();
      const lastModifiedTime = force ? 0 : (lastLocal ? lastLocal.lastModified + 1 : 0);

      const { data, error } = await supabase
        .from('customer_loans')
        .select('id, customer_id, product_id, variant_id, loan_amount, amount_paid, remaining_balance, loan_date, due_date, status, notes, user_id, updated_at')
        .eq('user_id', userId)
        .gt('updated_at', new Date(lastModifiedTime).toISOString());

      if (error) throw error;
      if (data && data.length > 0) {
        console.log(`Syncing ${data.length} new/updated loans...`);
        await db.loans.bulkPut(
          data.map((l: any) => ({
            ...l,
            lastModified: new Date(l.updated_at).getTime(),
            synced: true,
          }))
        );
      }
    } catch (error) { console.error('Failed to sync loans:', error); }
  }

  private async syncDeviceIdentifiers(userId: string, force: boolean) {
    try {
      const lastLocal = await db.deviceIdentifiers.orderBy('lastModified').last();
      const lastModifiedTime = force ? 0 : (lastLocal ? lastLocal.lastModified + 1 : 0);

      const { data, error } = await supabase
        .from('device_identifiers')
        .select('id, user_id, imei, serial_number, product_id, product_variant_id, condition_grade, status, cost, sell_price, customer_id, notes, updated_at')
        .eq('user_id', userId)
        .gt('updated_at', new Date(lastModifiedTime).toISOString());

      if (error) throw error;
      if (data && data.length > 0) {
        console.log(`Syncing ${data.length} new/updated device identifiers...`);
        await db.deviceIdentifiers.bulkPut(
          data.map((d: any) => ({
            ...d,
            lastModified: new Date(d.updated_at).getTime(),
            synced: true,
          }))
        );
      }
    } catch (error) { console.error('Failed to sync device identifiers:', error); }
  }

  private async syncPartCompatibility(userId: string, force: boolean) {
    try {
      const lastLocal = await db.partCompatibility.orderBy('lastModified').last();
      const lastModifiedTime = force ? 0 : (lastLocal ? lastLocal.lastModified + 1 : 0);

      const { data, error } = await supabase
        .from('part_compatibility')
        .select('id, user_id, product_id, product_variant_id, device_model, notes, updated_at')
        .eq('user_id', userId)
        .gt('updated_at', new Date(lastModifiedTime).toISOString());

      if (error) throw error;
      if (data && data.length > 0) {
        console.log(`Syncing ${data.length} new/updated part compatibilities...`);
        await db.partCompatibility.bulkPut(
          data.map((pc: any) => ({
            ...pc,
            lastModified: new Date(pc.updated_at).getTime(),
            synced: true,
          }))
        );
      }
    } catch (error) { console.error('Failed to sync part compatibility:', error); }
  }

  private async syncRepairTickets(userId: string, force: boolean) {
    try {
      const lastLocal = await db.repairTickets.orderBy('lastModified').last();
      const lastModifiedTime = force ? 0 : (lastLocal ? lastLocal.lastModified + 1 : 0);

      const { data, error } = await supabase
        .from('repair_tickets')
        .select('id, user_id, ticket_number, customer_id, device_identifier_id, device_name, serial_or_imei, issue_description, estimated_cost, deposit_paid, status, assigned_tech_id, notes, created_at, updated_at')
        .eq('user_id', userId)
        .gt('updated_at', new Date(lastModifiedTime).toISOString());

      if (error) throw error;
      if (data && data.length > 0) {
        console.log(`Syncing ${data.length} new/updated repair tickets...`);
        await db.repairTickets.bulkPut(
          data.map((rt: any) => ({
            ...rt,
            lastModified: new Date(rt.updated_at).getTime(),
            synced: true,
          }))
        );
      }
    } catch (error) { console.error('Failed to sync repair tickets:', error); }
  }

  private async syncRepairTicketHistory(userId: string, force: boolean) {
    try {
      const lastLocal = await db.repairTicketHistory.orderBy('lastModified').last();
      const lastModifiedTime = force ? 0 : (lastLocal ? lastLocal.lastModified + 1 : 0);

      const { data, error } = await supabase
        .from('repair_ticket_status_history')
        .select('id, repair_ticket_id, user_id, previous_status, new_status, changed_by, notes, created_at')
        .eq('user_id', userId)
        .gt('created_at', new Date(lastModifiedTime).toISOString());

      if (error) throw error;
      if (data && data.length > 0) {
        console.log(`Syncing ${data.length} new/updated repair ticket history entries...`);
        await db.repairTicketHistory.bulkPut(
          data.map((rth: any) => ({
            ...rth,
            lastModified: new Date(rth.created_at).getTime(),
            synced: true,
          }))
        );
      }
    } catch (error) { console.error('Failed to sync repair ticket history:', error); }
  }

  private async syncTechnicians(userId: string, force: boolean) {
    try {
      const lastLocal = await db.technicians.orderBy('lastModified').last();
      const lastModifiedTime = force ? 0 : (lastLocal ? lastLocal.lastModified + 1 : 0);

      const { data, error } = await supabase
        .from('technicians')
        .select('id, user_id, name, email, phone, specialty, status, updated_at')
        .eq('user_id', userId)
        .gt('updated_at', new Date(lastModifiedTime).toISOString());

      if (error) throw error;
      if (data && data.length > 0) {
        console.log(`Syncing ${data.length} new/updated technicians...`);
        await db.technicians.bulkPut(
          data.map((tech: any) => ({
            ...tech,
            lastModified: new Date(tech.updated_at).getTime(),
            synced: true,
          }))
        );
      }
    } catch (error) { console.error('Failed to sync technicians:', error); }
  }

  private async syncRepairTicketParts(userId: string, force: boolean) {
    try {
      const lastLocal = await db.repairTicketParts.orderBy('lastModified').last();
      const lastModifiedTime = force ? 0 : (lastLocal ? lastLocal.lastModified + 1 : 0);

      const { data, error } = await supabase
        .from('repair_ticket_parts')
        .select('id, user_id, repair_ticket_id, product_id, product_variant_id, quantity, unit_cost, unit_price, status, updated_at')
        .eq('user_id', userId)
        .gt('updated_at', new Date(lastModifiedTime).toISOString());

      if (error) throw error;
      if (data && data.length > 0) {
        console.log(`Syncing ${data.length} new/updated repair ticket parts...`);
        await db.repairTicketParts.bulkPut(
          data.map((rtp: any) => ({
            ...rtp,
            lastModified: new Date(rtp.updated_at).getTime(),
            synced: true,
          }))
        );
      }
    } catch (error) { console.error('Failed to sync repair ticket parts:', error); }
  }

  // --- SYNC QUEUE PROCESSING ---

  private async processSyncQueue() {
    // Only process pending or syncing items (not failed ones unless manually retried)
    const queue = await db.syncQueue
      .where('status')
      .anyOf('pending', 'syncing') // Assuming 'pending' is default if undefined
      .or('retryCount')
      .below(3)
      .toArray();

    // Filter out items that are already failed but might have been picked up by the query above
    const pendingItems = queue.filter(item => item.status !== 'failed');

    if (pendingItems.length === 0) return;

    // SORT BY DEPENDENCY to avoid Foreign Key errors
    const priority = {
      'products': 1,
      'customers': 1,
      'categories': 1,
      'settings': 1,
      'technicians': 1,     // Independent
      'productVariants': 2, // Depends on products
      'deviceIdentifiers': 2, // Depends on products/customers
      'partCompatibility': 2, // Depends on products
      'repairTickets': 3,   // Depends on customers/deviceIdentifiers
      'sales': 3,           // Depends on customers
      'repairTicketHistory': 4, // Depends on repairTickets
      'repairTicketParts': 4,   // Depends on repairTickets AND products
      'saleItems': 4,       // Depends on sales AND products
      'loans': 4            // Depends on customers
    };

    pendingItems.sort((a, b) => {
      const pA = priority[a.table as keyof typeof priority] || 99;
      const pB = priority[b.table as keyof typeof priority] || 99;
      return pA - pB;
    });

    console.log(`Processing ${pendingItems.length} items from sync queue (Sorted by dependency)...`);

    for (const item of pendingItems) {
      try {
        // Mark as syncing
        await db.syncQueue.update(item.id!, { status: 'syncing' });

        await this.syncItem(item);

        // Remove from queue on success
        await db.syncQueue.delete(item.id!);
      } catch (error: any) {
        console.error('Failed to sync item:', item, error);

        const newRetryCount = (item.retryCount || 0) + 1;

        if (newRetryCount >= 3) {
          // Move to failed status instead of deleting
          await db.syncQueue.update(item.id!, {
            retryCount: newRetryCount,
            status: 'failed',
            errorMessage: error.message || 'Unknown error'
          });
          console.error(`Failed to sync ${item.table} item after 3 retries.`);
        } else {
          // Increment retry count and set back to pending
          await db.syncQueue.update(item.id!, {
            retryCount: newRetryCount,
            status: 'pending'
          });
        }
      }
    }
  }

  private getSupabaseTableName(dexieTableName: string): string {
    const mapping: Record<string, string> = {
      'productVariants': 'product_variants',
      'loans': 'customer_loans',
      'saleItems': 'sale_items',
      'deviceIdentifiers': 'device_identifiers',
      'partCompatibility': 'part_compatibility',
      'repairTickets': 'repair_tickets',
      'repairTicketHistory': 'repair_ticket_status_history',
      'technicians': 'technicians',
      'repairTicketParts': 'repair_ticket_parts',
    };
    return mapping[dexieTableName] || dexieTableName;
  }

  private async syncItem(item: any) {
    const { table, operation, data } = item;
    const supabaseTable = this.getSupabaseTableName(table);
    let { error } = { error: null };
    // Remove local-only fields before sending to Supabase
    const { synced, lastModified, updated_at, status, errorMessage, remaining_balance, ...dataForSupabase } = data;

    // Fix for sale_items schema mismatch
    if (supabaseTable === 'sale_items') {
      const priceToUse = dataForSupabase.total_price ?? dataForSupabase.subtotal ?? ((dataForSupabase.unit_price || 0) * (dataForSupabase.quantity || 1));
      dataForSupabase.subtotal = priceToUse;
      dataForSupabase.total_price = priceToUse;
      delete dataForSupabase.variant_name;
      delete dataForSupabase.user_id;
    }

    // Ensure user_id matches active authenticated user to pass RLS (auth.uid() = user_id)
    const { data: { user } } = await supabase.auth.getUser();
    if (user && supabaseTable !== 'profiles' && supabaseTable !== 'user_roles' && supabaseTable !== 'sale_items') {
      if (!dataForSupabase.user_id || dataForSupabase.user_id !== user.id) {
        console.log(`Setting user_id on ${supabaseTable} ${data.id} to active user ${user.id}`);
        dataForSupabase.user_id = user.id;
      }
    }

    console.log(`Syncing item: ${operation} on ${supabaseTable}`, data.id);

    try {
      switch (operation) {
        case 'insert':
          try {
            ({ error } = await supabase.from(supabaseTable as any).insert(dataForSupabase));
          } catch (insertErr: any) {
            // Handle unique constraint violation (23505) by trying to update instead
            if (insertErr?.code === '23505' || error?.code === '23505') {
              console.warn(`Duplicate key for ${supabaseTable} ${data.id}, trying update...`);
              ({ error } = await supabase.from(supabaseTable as any).update(dataForSupabase).eq('id', data.id));
            } else {
              throw insertErr;
            }
          }
          // Also check the returned error object from supabase
          if (error && (
            error.code === '23505' ||
            error.code === '409' ||
            error.message?.includes('duplicate key') ||
            error.details?.includes('already exists')
          )) {
            console.warn(`Duplicate key for ${supabaseTable} ${data.id}, trying update...`);
            const updateResult = await supabase.from(supabaseTable as any).update(dataForSupabase).eq('id', data.id);
            error = updateResult.error;

            // If the UPDATE failed with Foreign Key error (23503), we need to heal it here too
            if (error?.code === '23503' && supabaseTable === 'sale_items') {
              console.warn(`Update failed due to missing parent product for sale_item ${data.id}. Triggering self-healing...`);
              // The main error handler below will catch this 'error' variable and run the healing logic.
              // We just let it fall through.
            }
          }
          break;
        case 'update':
          if (supabaseTable === 'settings') {
            ({ error } = await supabase.from(supabaseTable as any).upsert(dataForSupabase, { onConflict: 'user_id' }));
          } else {
            ({ error } = await supabase.from(supabaseTable as any).update(dataForSupabase).eq('id', data.id));
          }
          break;
        case 'delete':
          ({ error } = await supabase.from(supabaseTable as any).delete().eq('id', data.id));
          break;
      }

      if (error) {
        // --- SELF-HEALING FOR MISSING DEPENDENCIES ---
        // If we get a Foreign Key error (23503) on sale_items, it means the Product is missing on Supabase.
        // This happens if the local DB thinks the product is synced, but Supabase doesn't have it.
        if (error.code === '23503' && supabaseTable === 'sale_items') {
          console.warn(`Parent product missing for sale_item ${data.id}. Re-queueing product...`);
          const productId = dataForSupabase.product_id;
          if (productId) {
            const product = await db.products.get(productId);
            if (product) {
              // Check if it's already in the queue
              const existing = await db.syncQueue
                .where('table')
                .equals('products')
                .filter(item => item.data.id === productId)
                .first();

              if (existing) {
                // If it's an UPDATE, convert it to INSERT because the product is missing remotely
                if (existing.operation === 'update') {
                  console.log(`Converting pending update to insert for missing product: ${product.name}`);
                  await db.syncQueue.update(existing.id!, {
                    operation: 'insert',
                    data: { ...product, synced: false }, // Ensure we have full data
                    status: 'pending',
                    retryCount: 0
                  });
                }
              } else {
                // If not in queue, add as INSERT
                console.log(`Re-queueing missing product: ${product.name}`);
                await db.syncQueue.add({
                  table: 'products',
                  operation: 'insert',
                  data: { ...product, synced: false },
                  timestamp: Date.now(),
                  retryCount: 0,
                  status: 'pending'
                });
              }
              toast.info(`Repaired sync for product: ${product.name}`);
            }
          }
        }

        console.error(`Supabase error during ${operation} on ${supabaseTable}:`, error);
        throw error;
      }
    } catch (err) {
      console.error(`Exception during syncItem (${operation} ${supabaseTable}):`, err);
      throw err;
    }
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
      retryCount: 0,
      status: 'pending' // Initialize status
    });

    this.syncAll(); // Attempt to sync immediately
  }
}

export const syncService = new SyncService();

// Expose to window for debugging (like db)
(window as any).syncService = syncService;