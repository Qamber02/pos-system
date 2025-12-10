import { useLiveQuery } from 'dexie-react-hooks';
import { db, CachedProduct } from '@/lib/db';
import { syncService } from '@/lib/syncService';

/**
 * An optimized hook to get products from the local database.
 * It applies search and category filters *inside* the query
 * and accepts a 'limit' for pagination.
 * Now includes full CRUD operations with sync queue integration.
 */
export function useOfflineProducts(
  searchQuery: string,
  selectedCategory: string | null,
  limit: number
) {

  const products = useLiveQuery(() => {
    // This is a dynamic query. It builds itself based on the filters.

    // 1. Start with a collection
    let query;

    // 2. Apply category filter first (uses an index, very fast)
    if (selectedCategory) {
      query = db.products.where('category_id').equals(selectedCategory);
    } else {
      // No category, start with the whole table
      query = db.products.toCollection();
    }

    // 3. Apply search filter
    if (searchQuery) {
      const lowerSearch = searchQuery.toLowerCase();

      // .filter() is Dexie's way of running a JS filter on the results.
      query = query.filter(product =>
        product.name.toLowerCase().includes(lowerSearch)
      );
    }

    // 4. Apply the dynamic limit and sort
    return query.limit(limit).sortBy('name');

  }, [searchQuery, selectedCategory, limit]); // Rerun this query when filters or limit change

  // CRUD operations
  const createProduct = async (product: Omit<CachedProduct, 'id' | 'synced' | 'lastModified'>) => {
    const newProduct: CachedProduct = {
      ...product,
      id: crypto.randomUUID(),
      synced: false,
      lastModified: Date.now(),
      updated_at: new Date().toISOString()
    };

    await syncService.queueOperation('products', 'insert', newProduct);
    return newProduct;
  };

  const updateProduct = async (id: string, updates: Partial<CachedProduct>) => {
    const existing = await db.products.get(id);
    if (!existing) throw new Error('Product not found');

    const updated: CachedProduct = {
      ...existing,
      ...updates,
      synced: false,
      lastModified: Date.now(),
      updated_at: new Date().toISOString()
    };

    await syncService.queueOperation('products', 'update', updated);
    return updated;
  };

  const deleteProduct = async (id: string) => {
    await syncService.queueOperation('products', 'delete', { id });
  };

  return {
    products: products || [],
    loading: products === undefined,
    createProduct,
    updateProduct,
    deleteProduct
  };
}