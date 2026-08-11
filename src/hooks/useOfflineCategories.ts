import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export function useOfflineCategories() {
  
  const cachedCategories = useLiveQuery(
    () => db.categories.toArray()
  );

  return {
    categories: cachedCategories || [],
    loading: cachedCategories === undefined,
  };
}