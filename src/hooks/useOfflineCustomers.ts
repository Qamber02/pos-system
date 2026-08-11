import { useLiveQuery } from 'dexie-react-hooks';
import { db, CachedCustomer } from '@/lib/db';
import { syncService } from '@/lib/syncService';

/**
 * Hook to manage customers with full offline support and CRUD operations.
 */
export function useOfflineCustomers(searchQuery: string = '') {

  const customers = useLiveQuery(() => {
    let query = db.customers.toCollection();

    // Apply search filter
    if (searchQuery) {
      const lowerSearch = searchQuery.toLowerCase();
      query = query.filter(customer =>
        customer.name.toLowerCase().includes(lowerSearch) ||
        customer.email?.toLowerCase().includes(lowerSearch) ||
        customer.phone?.includes(searchQuery)
      );
    }

    return query.sortBy('name');
  }, [searchQuery]);

  // CRUD operations
  const createCustomer = async (customer: Omit<CachedCustomer, 'id' | 'synced' | 'lastModified'>) => {
    const newCustomer: CachedCustomer = {
      ...customer,
      id: crypto.randomUUID(),
      synced: false,
      lastModified: Date.now(),
      updated_at: new Date().toISOString()
    };

    await syncService.queueOperation('customers', 'insert', newCustomer);
    return newCustomer;
  };

  const updateCustomer = async (id: string, updates: Partial<CachedCustomer>) => {
    const existing = await db.customers.get(id);
    if (!existing) throw new Error('Customer not found');

    const updated: CachedCustomer = {
      ...existing,
      ...updates,
      synced: false,
      lastModified: Date.now(),
      updated_at: new Date().toISOString()
    };

    await syncService.queueOperation('customers', 'update', updated);
    return updated;
  };

  const deleteCustomer = async (id: string) => {
    await syncService.queueOperation('customers', 'delete', { id });
  };

  return {
    customers: customers || [],
    loading: customers === undefined,
    createCustomer,
    updateCustomer,
    deleteCustomer
  };
}