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
  is_serialized?: boolean;
  condition_grade?: string;
  is_repair_part?: boolean;
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
  is_serialized?: boolean;
  condition_grade?: string;
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

export interface CachedDeviceIdentifier {
  id: string;
  user_id: string;
  imei?: string | null;
  serial_number?: string | null;
  product_id: string;
  product_variant_id?: string | null;
  condition_grade?: string | null;
  status: 'available' | 'reserved' | 'sold' | 'in_repair' | 'returned';
  cost?: number | null;
  sell_price?: number | null;
  customer_id?: string | null;
  notes?: string | null;
  synced: boolean;
  lastModified: number;
  created_at?: string;
  updated_at?: string;
}

export interface CachedPartCompatibility {
  id: string;
  user_id: string;
  product_id: string;
  product_variant_id?: string | null;
  device_model: string;
  notes?: string | null;
  synced: boolean;
  lastModified: number;
  created_at?: string;
  updated_at?: string;
}

export type RepairStatus =
  | 'received'
  | 'diagnosing'
  | 'awaiting_approval'
  | 'approved'
  | 'declined'
  | 'awaiting_parts'
  | 'in_repair'
  | 'qc_testing'
  | 'ready_for_pickup'
  | 'completed'
  | 'cancelled';

export interface CachedRepairTicket {
  id: string;
  user_id: string;
  ticket_number: string;
  customer_id?: string | null;
  device_identifier_id?: string | null;
  device_name: string;
  serial_or_imei?: string | null;
  issue_description: string;
  estimated_cost?: number | null;
  deposit_paid?: number | null;
  status: RepairStatus;
  assigned_tech_id?: string | null;
  notes?: string | null;
  synced: boolean;
  lastModified: number;
  created_at?: string;
  updated_at?: string;
}

export interface CachedRepairTicketHistory {
  id: string;
  repair_ticket_id: string;
  user_id: string;
  previous_status?: string | null;
  new_status: string;
  changed_by?: string | null;
  notes?: string | null;
  synced: boolean;
  lastModified: number;
  created_at?: string;
}

export interface CachedTechnician {
  id: string;
  user_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  specialty?: string | null;
  status: 'active' | 'inactive';
  synced: boolean;
  lastModified: number;
  created_at?: string;
  updated_at?: string;
}

export type TicketPartStatus = 'reserved' | 'consumed' | 'returned' | 'broken' | 'returned_to_supplier';

export interface CachedRepairTicketPart {
  id: string;
  user_id: string;
  repair_ticket_id: string;
  product_id: string;
  product_variant_id?: string | null;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  status: TicketPartStatus;
  status_reason?: string | null;
  status_updated_at?: string | null;
  item_type?: 'part' | 'product';
  synced: boolean;
  lastModified: number;
  created_at?: string;
  updated_at?: string;
}

export interface CachedRepairTicketPartHistory {
  id: string;
  repair_ticket_part_id: string;
  repair_ticket_id: string;
  user_id: string;
  previous_status?: string | null;
  new_status: TicketPartStatus;
  reason?: string | null;
  changed_by?: string | null;
  synced: boolean;
  lastModified: number;
  created_at?: string;
}

export interface CachedRefund {
  id: string;
  user_id: string;
  sale_id?: string | null;
  repair_ticket_id?: string | null;
  refund_number: string;
  amount: number;
  refund_type: 'product' | 'service' | 'deposit';
  payment_method: 'cash' | 'card' | 'store_credit' | 'other';
  reason: string;
  restock_item: boolean;
  processed_by?: string | null;
  notes?: string | null;
  synced: boolean;
  lastModified: number;
  created_at?: string;
}

export interface CachedWholesaler {
  id: string;
  user_id: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  synced: boolean;
  lastModified: number;
  created_at?: string;
  updated_at?: string;
}

export interface CachedWholesalerIntake {
  id: string;
  user_id: string;
  wholesaler_id: string;
  product_id?: string | null;
  item_name: string;
  quantity: number;
  agreed_unit_cost: number;
  total_cost: number;
  amount_paid: number;
  intake_date?: string;
  status: 'pending' | 'partial' | 'paid';
  notes?: string | null;
  synced: boolean;
  lastModified: number;
  created_at?: string;
  updated_at?: string;
}

export interface CachedWholesalerPayment {
  id: string;
  user_id: string;
  wholesaler_id: string;
  intake_id?: string | null;
  amount: number;
  payment_method: string;
  payment_date?: string;
  notes?: string | null;
  synced: boolean;
  lastModified: number;
  created_at?: string;
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
  deviceIdentifiers!: Table<CachedDeviceIdentifier>;
  partCompatibility!: Table<CachedPartCompatibility>;
  repairTickets!: Table<CachedRepairTicket>;
  repairTicketHistory!: Table<CachedRepairTicketHistory>;
  technicians!: Table<CachedTechnician>;
  repairTicketParts!: Table<CachedRepairTicketPart>;
  repairTicketPartHistory!: Table<CachedRepairTicketPartHistory>;
  refunds!: Table<CachedRefund>;
  wholesalers!: Table<CachedWholesaler>;
  wholesalerIntakes!: Table<CachedWholesalerIntake>;
  wholesalerPayments!: Table<CachedWholesalerPayment>;

  constructor() {
    super('ShopAppOfflineDB');

    // This setup handles database versioning automatically.
    // v10 adds device_identifier_id and repair_ticket_id to sale items.
    this.version(10).stores({
      products: 'id, user_id, name, category_id, lastModified, synced',
      sales: 'id, user_id, customer_id, created_at, lastModified, synced',
      categories: 'id, user_id, name, lastModified, synced',
      syncQueue: '++id, table, timestamp, retryCount, status',
      userProfile: 'id',
      customers: 'id, user_id, name, lastModified, synced',
      saleItems: 'id, sale_id, product_id, device_identifier_id, repair_ticket_id, lastModified, synced',
      settings: 'id, user_id, lastModified, synced',
      heldCarts: 'id, user_id, created_at, synced',
      productVariants: 'id, product_id, user_id, lastModified, synced',
      loans: 'id, customer_id, user_id, status, due_date, lastModified, synced',
      deviceIdentifiers: 'id, user_id, imei, serial_number, product_id, status, customer_id, lastModified, synced',
      partCompatibility: 'id, user_id, product_id, device_model, lastModified, synced',
      repairTickets: 'id, user_id, ticket_number, customer_id, device_identifier_id, status, lastModified, synced',
      repairTicketHistory: 'id, repair_ticket_id, user_id, lastModified, synced',
      technicians: 'id, user_id, name, status, lastModified, synced',
      repairTicketParts: 'id, user_id, repair_ticket_id, product_id, status, lastModified, synced',
      repairTicketPartHistory: 'id, repair_ticket_part_id, repair_ticket_id, user_id, lastModified, synced',
      refunds: 'id, user_id, sale_id, repair_ticket_id, refund_number, lastModified, synced',
      wholesalers: 'id, user_id, name, lastModified, synced',
      wholesalerIntakes: 'id, user_id, wholesaler_id, product_id, status, lastModified, synced',
      wholesalerPayments: 'id, user_id, wholesaler_id, intake_id, lastModified, synced'
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
      deviceIdentifiers: await this.deviceIdentifiers.count(),
      partCompatibility: await this.partCompatibility.count(),
      repairTickets: await this.repairTickets.count(),
      repairTicketHistory: await this.repairTicketHistory.count(),
      technicians: await this.technicians.count(),
      repairTicketParts: await this.repairTicketParts.count(),
      pendingSync: await this.syncQueue.count(),
      estimatedSize: 0
    };
    stats.estimatedSize = (
      stats.products * 500 +
      stats.sales * 800 +
      stats.categories * 300 +
      stats.customers * 400 +
      stats.variants * 300 +
      stats.loans * 500 +
      stats.deviceIdentifiers * 400 +
      stats.partCompatibility * 300 +
      stats.repairTickets * 600 +
      stats.repairTicketHistory * 300 +
      stats.technicians * 300 +
      stats.repairTicketParts * 400
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
        this.deviceIdentifiers.clear(),
        this.partCompatibility.clear(),
        this.repairTickets.clear(),
        this.repairTicketHistory.clear(),
        this.technicians.clear(),
        this.repairTicketParts.clear(),
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