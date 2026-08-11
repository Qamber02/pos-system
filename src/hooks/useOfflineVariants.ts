import { useLiveQuery } from 'dexie-react-hooks';
import { db, CachedProductVariant } from '@/lib/db';
import { syncService } from '@/lib/syncService';

/**
 * Hook to manage product variants with full offline support.
 */
export function useOfflineVariants(productId?: string) {

    const variants = useLiveQuery(() => {
        if (productId) {
            return db.productVariants
                .where('product_id')
                .equals(productId)
                .and(v => v.is_active)
                .sortBy('variant_name');
        }
        return db.productVariants.toArray();
    }, [productId]);

    // CRUD operations
    const createVariant = async (variant: Omit<CachedProductVariant, 'id' | 'synced' | 'lastModified'>) => {
        const newVariant: CachedProductVariant = {
            ...variant,
            id: crypto.randomUUID(),
            synced: false,
            lastModified: Date.now(),
            updated_at: new Date().toISOString()
        };

        await syncService.queueOperation('productVariants', 'insert', newVariant);
        return newVariant;
    };

    const updateVariant = async (id: string, updates: Partial<CachedProductVariant>) => {
        const existing = await db.productVariants.get(id);
        if (!existing) throw new Error('Variant not found');

        const updated: CachedProductVariant = {
            ...existing,
            ...updates,
            synced: false,
            lastModified: Date.now(),
            updated_at: new Date().toISOString()
        };

        await syncService.queueOperation('productVariants', 'update', updated);
        return updated;
    };

    const deleteVariant = async (id: string) => {
        // Soft delete by marking as inactive
        const existing = await db.productVariants.get(id);
        if (existing) {
            await updateVariant(id, { is_active: false });
        }
    };

    return {
        variants: variants || [],
        loading: variants === undefined,
        createVariant,
        updateVariant,
        deleteVariant
    };
}
