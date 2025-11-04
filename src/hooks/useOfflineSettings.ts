import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useUserRole } from './useUserRole'; // We need the user's ID

export function useOfflineSettings() {
  const { profile } = useUserRole();
  const userId = profile?.id;

  const settings = useLiveQuery(
    () => (userId ? db.settings.get(userId) : null),
    [userId] // Rerun when userId is available
  );

  return {
    // Return settings or a default object
    settings: settings || { 
      tax_rate: 0, 
      business_name: 'POS SHOPPING', 
      logo_url: '/default-logo.png', // Use your default logo path
      receipt_footer: 'Thank you for your business!'
    },
    loading: settings === undefined,
  };
}