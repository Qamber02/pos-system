import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
// We no longer need Supabase here
import { syncService } from '@/lib/syncService';

export function useOfflineProducts() {
  
  // 1. Get products from IndexedDB using useLiveQuery.
  // This hook automatically updates when the db changes.
  // `cachedProducts` will be `undefined` on the first render,
  // then it will become an array.
  const cachedProducts = useLiveQuery(
    () => db.products.toArray()
  );

  // 2. This useEffect just starts and stops the background sync service.
  useEffect(() => {
    // Start the service. It will automatically run `syncAll()`
    // and populate/update the db. `useLiveQuery` will
    // catch those changes and re-render the component.
    syncService.startAutoSync();

    // Return a cleanup function to stop the service
    // when the component unmounts.
    return () => {
      syncService.stopAutoSync();
    };
  }, []); // Runs only once when the hook is mounted

  // 3. Return the products.
  // The loading state is true only if `cachedProducts` is still undefined.
  return {
    products: cachedProducts || [],
    loading: cachedProducts === undefined,
    // We no longer return `isOnline` because it was unreliable and
    // the UI should not depend on it.
  };
}