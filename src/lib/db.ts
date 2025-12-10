import Dexie, { Table } from 'dexie';

// --- INTERFACES ---

export interface CachedProduct {
  id: string;
  name: string;
  description?: string | null;
  barcode?: string | null;
  retail_price: number;
  cost_price?: number;
  stock_quantity: number;
  low_stock_threshold: number;
  category_id: string | null;
  user_id: string;
  synced: boolean;
  lastModified: number;
  updated_at?: string;
}
export interface CachedSale {
  id: string; // Use UUID generated locally
  user_id: string;
  customer_id?: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  amount_paid: number;
  change_amount: number;
  payment_method: string;
  receipt_number: string;
  notes?: string;
  created_at: string; // ISO String
  synced: boolean;
  lastModified: number;
}
export interface CachedCategory {
  id: string;
  name: string;
  description?: string;
  color: string;
  user_id: string;
  synced: boolean;
  lastModified: number;
  updated_at?: string;
}
export interface UserProfile {
  id: string;
  role: string;
  email?: string;
  avatar_url?: string;
}
export interface SyncQueue {
  id?: number;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: any;
  timestamp: number;
  retryCount: number;
  status?: 'pending' | 'syncing' | 'failed'; // Added status
  errorMessage?: string; // Added error message
}
export interface CachedCustomer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  user_id: string;
  synced: boolean;
  lastModified: number;
  updated_at?: string;
}
export interface CachedSaleItem {
  id: string; // Use UUID generated locally
  sale_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  variant_id?: string;
  variant_name?: string;
  synced: boolean;
  lastModified: number;
}
export interface AppSettings {
  id: string; // Should be the user_id
  user_id: string;
  business_name: string;
  logo_url: string;
  tax_rate: number;
  currency_symbol: string;
  receipt_footer: string;
  updated_at?: string;
  synced: boolean;
  lastModified: number;
}
export interface CachedHeldCart {
  id: string; // Use UUID generated locally
  user_id: string;
  cart_name: string;
  cart_data: any; // { items: CartItem[], discount: number }
  created_at: string; // ISO String
  synced: boolean;
  lastModified: number;
}

export interface CachedProductVariant {
  id: string;
  product_id: string;
  variant_name: string;
  sku?: string;
  price_adjustment: number;
  stock_quantity: number;
  is_active: boolean;
  user_id: string;
  synced: boolean;
  lastModified: number;
  updated_at?: string;
}

export interface CachedLoan {
  id: string;
  customer_id: string;
  product_id?: string;
  variant_id?: string;
  loan_amount: number;
  amount_paid: number;
  remaining_balance: number;
  loan_date: string; // ISO String
  due_date?: string; // ISO String
  status: 'active' | 'paid' | 'overdue';
  notes?: string;
  user_id: string;
  synced: boolean;
  lastModified: number;
  updated_at?: string;
}

// --- DATABASE CLASS ---

export class OfflineDatabase extends Dexie {
  products!: Table<CachedProduct>;
  sales!: Table<CachedSale>;
  categories!: Table<CachedCategory>;
  syncQueue!: Table<SyncQueue>;
  userProfile!: Table<UserProfile>;
  customers!: Table<CachedCustomer>;
  saleItems!: Table<CachedSaleItem>;
  settings!: Table<AppSettings>;
  heldCarts!: Table<CachedHeldCart>;
  productVariants!: Table<CachedProductVariant>;
  loans!: Table<CachedLoan>;

  constructor() {
    super('ShopAppOfflineDB');

    // This setup handles database versioning automatically.
    // v6 is the latest schema with variants and loans support.
    this.version(6).stores({
      products: 'id, user_id, name, category_id, lastModified, synced',
      sales: 'id, user_id, customer_id, created_at, lastModified, synced',
      categories: 'id, user_id, name, lastModified, synced',
      syncQueue: '++id, table, timestamp, retryCount, status', // Added status to index
      userProfile: 'id',
      customers: 'id, user_id, name, lastModified, synced',
      saleItems: 'id, sale_id, product_id, lastModified, synced',
      settings: 'id, user_id, lastModified, synced',
      heldCarts: 'id, user_id, created_at, synced',
      productVariants: 'id, product_id, user_id, lastModified, synced',
      loans: 'id, customer_id, user_id, status, due_date, lastModified, synced'
    });
  }

  // 🧹 Cleanup old data
  async cleanupOldData(daysToKeep: number = 30) {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    await this.sales.where('lastModified').below(cutoffTime).delete();
    console.log(`Cleaned up sales older than ${daysToKeep} days`);
  }

  // 📊 Cache statistics
  async getCacheStats() {
    const stats = {
      products: await this.products.count(),
      sales: await this.sales.count(),
      categories: await this.categories.count(),
      customers: await this.customers.count(),
      variants: await this.productVariants.count(),
      loans: await this.loans.count(),
      pendingSync: await this.syncQueue.count(),
      estimatedSize: 0
    };
    stats.estimatedSize = (
      stats.products * 500 +
      stats.sales * 800 +
      stats.categories * 300 +
      stats.customers * 400 +
      stats.variants * 300 +
      stats.loans * 500
    ) / 1024;
    return stats;
  }

  // 🧹 Clear all user-specific data (for logout/user switching)
  async clearUserData() {
    console.log('Clearing user-specific local data...');
    try {
      await Promise.all([
        this.products.clear(),
        this.categories.clear(),
        this.customers.clear(),
        this.sales.clear(),
        this.saleItems.clear(),
        this.settings.clear(),
        this.heldCarts.clear(),
        this.productVariants.clear(),
        this.loans.clear(),
        this.syncQueue.clear()
      ]);
      console.log('✅ User data cleared successfully');
    } catch (error) {
      console.error('❌ Failed to clear user data:', error);
      throw error;
    }
  }

  // 🧠 Generate 20,000 test products (for stress/performance testing)
  async seedTestProducts(count: number = 20000) {
    // 1. Get the logged-in user ID from the userProfile table
    const userProfile = await this.userProfile.limit(1).first();
    if (!userProfile) {
      console.error('Cannot seed products: No user is logged in and cached.');
      console.log('Please log in online once to cache your profile, then try again.');
      return;
    }
    const userId = userProfile.id;

    console.log(`Attempting to seed ${count} products for user ${userId}...`);

    // 2. We check for existing *test* products to avoid re-seeding
    const existingTestProduct = await this.products.get('P00001');
    if (existingTestProduct) {
      console.log(`Database already has test products (found P00001), skipping seeding.`);
      return;
    }

    console.time('InsertTestProducts');
    const products: CachedProduct[] = [];
    const now = Date.now();
    const isoNow = new Date(now).toISOString();

    for (let i = 1; i <= count; i++) {
      products.push({
        id: `P${i.toString().padStart(5, '0')}`,
        name: `Test Product ${i}`,
        retail_price: Math.round(Math.random() * 500 + 10),
        cost_price: Math.round(Math.random() * 400 + 5),
        stock_quantity: Math.floor(Math.random() * 1000),
        low_stock_threshold: Math.floor(Math.random() * 50),
        category_id: null,
        user_id: userId,

        synced: false,
        lastModified: now,
        updated_at: isoNow // Add this to match schema
      });
    }

    // 3. Bulk insert for high speed
    await this.products.bulkAdd(products);
    console.timeEnd('InsertTestProducts');
    console.log(`✅ Inserted ${count} test products for user ${userId} successfully.`);
  }
}

export const db = new OfflineDatabase();

// Expose db to window for debugging/seeding
(window as any).db = db;