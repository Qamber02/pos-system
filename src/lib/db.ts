import Dexie, { Table } from 'dexie';

// --- INTERFACES ---

export interface CachedProduct {
  id: string;
  name: string;
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
  synced: boolean;
  lastModified: number;
}
export interface AppSettings {
  id: string; // Should be the user_id
  user_id: string;
  business_name: string;
  logo_url: string;
  tax_rate: number;
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
  heldCarts!: Table<CachedHeldCart>; // New table

  constructor() {
    super('ShopAppOfflineDB');
    
    // v1: Initial tables
    this.version(1).stores({
      products: 'id, user_id, name, category_id, lastModified, synced',
      sales: 'id, user_id, customer_id, created_at, lastModified, synced',
      categories: 'id, user_id, name, lastModified, synced',
      syncQueue: '++id, table, timestamp, retryCount'
    });

    // v2: Add userProfile
    this.version(2).stores({
      userProfile: 'id'
    }).upgrade(tx => {
      // This runs if upgrading from v1, just defining the new table
      return tx.table("userProfile").clear(); 
    });

    // v3: Add customers, saleItems, settings
    this.version(3).stores({
      customers: 'id, user_id, name, lastModified, synced',
      saleItems: 'id, sale_id, product_id, lastModified, synced',
      settings: 'id, user_id, lastModified, synced'
    }).upgrade(tx => {
      // This runs if upgrading from v2, just defining the new tables
      return Promise.all([
        tx.table("customers").clear(),
        tx.table("saleItems").clear(),
        tx.table("settings").clear()
      ]);
    });
    
    // v4: Add heldCarts (Final version)
    this.version(4).stores({
      products: 'id, user_id, name, category_id, lastModified, synced',
      sales: 'id, user_id, customer_id, created_at, lastModified, synced',
      categories: 'id, user_id, name, lastModified, synced',
      syncQueue: '++id, table, timestamp, retryCount',
      userProfile: 'id',
      customers: 'id, user_id, name, lastModified, synced',
      saleItems: 'id, sale_id, product_id, lastModified, synced',
      settings: 'id, user_id, lastModified, synced',
      heldCarts: 'id, user_id, created_at, synced' // New table
    });
  }
}

export const db = new OfflineDatabase();