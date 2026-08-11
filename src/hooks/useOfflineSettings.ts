import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useUserRole } from './useUserRole';

export function useOfflineSettings() {
  const { profile } = useUserRole();
  const userId = profile?.id;

  const settings = useLiveQuery(
    async () => {
      if (!userId) return null;
      const result = await db.settings.where('user_id').equals(userId).first();
      return result || null;
    },
    [userId]
  );

  return {
    settings: settings || {
      tax_rate: 0,
      business_name: 'POS SHOPPING',
      logo_url: '/default-logo.png',
      currency_symbol: 'PKR',
      receipt_footer: 'Thank you for your business!'
    },
    loading: settings === undefined,
  };
}