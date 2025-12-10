import { useOfflineSettings } from './useOfflineSettings';
import { formatCurrency } from '@/lib/utils';

export function useFormatCurrency() {
    const { settings } = useOfflineSettings();
    const symbol = settings?.currency_symbol || 'PKR';

    return (amount: number) => formatCurrency(amount, symbol);
}
