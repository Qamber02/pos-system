import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export function useOfflineCustomers() {
  const customers = useLiveQuery(
    () => db.customers.toArray()
  );

  return {
    customers: customers || [],
    loading: customers === undefined,
  };
}