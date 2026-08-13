import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useUserRole } from './useUserRole';

export function useOfflineSettings() {
  const { profile } = useUserRole();
  const userId = profile?.id;

  const rawSettings = useLiveQuery(
    async () => {
      if (userId) {
        const byUser = await db.settings.where('user_id').equals(userId).first();
        if (byUser) return byUser;
        const byId = await db.settings.get(userId);
        if (byId) return byId;
      }
      return (await db.settings.toCollection().first()) || null;
    },
    [userId]
  );

  const settings = {
    id: rawSettings?.id || userId || 'default',
    user_id: rawSettings?.user_id || userId || '',
    tax_rate: typeof rawSettings?.tax_rate === 'number' ? rawSettings.tax_rate : 0,
    business_name: rawSettings?.business_name?.trim() || 'My Store',
    logo_url: rawSettings?.logo_url || '',
    currency_symbol: rawSettings?.currency_symbol || 'PKR',
    receipt_footer: rawSettings?.receipt_footer?.trim() || 'Thank you for your business!',
    synced: rawSettings?.synced ?? true,
    lastModified: rawSettings?.lastModified || Date.now(),
  };

  return {
    settings,
    loading: rawSettings === undefined,
  };
}