import { useLiveQuery } from 'dexie-react-hooks';
import { db, CachedLoan } from '@/lib/db';
import { syncService } from '@/lib/syncService';

/**
 * Hook to manage customer loans with full offline support.
 */
export function useOfflineLoans(customerId?: string, status?: 'active' | 'paid' | 'overdue') {

    const loans = useLiveQuery(() => {
        let query = db.loans.toCollection();

        // Filter by customer
        if (customerId) {
            query = db.loans.where('customer_id').equals(customerId);
        }

        // Filter by status
        if (status) {
            return query.filter(loan => loan.status === status).sortBy('loan_date');
        }

        return query.sortBy('loan_date');
    }, [customerId, status]);

    // CRUD operations
    const createLoan = async (loan: Omit<CachedLoan, 'id' | 'synced' | 'lastModified' | 'remaining_balance'>) => {
        const newLoan: CachedLoan = {
            ...loan,
            id: crypto.randomUUID(),
            remaining_balance: loan.loan_amount - (loan.amount_paid || 0),
            synced: false,
            lastModified: Date.now(),
            updated_at: new Date().toISOString()
        };

        await syncService.queueOperation('loans', 'insert', newLoan);
        return newLoan;
    };

    const updateLoan = async (id: string, updates: Partial<CachedLoan>) => {
        const existing = await db.loans.get(id);
        if (!existing) throw new Error('Loan not found');

        // Recalculate remaining balance if amount_paid changed
        const amount_paid = updates.amount_paid !== undefined ? updates.amount_paid : existing.amount_paid;
        const loan_amount = updates.loan_amount !== undefined ? updates.loan_amount : existing.loan_amount;
        const remaining_balance = loan_amount - amount_paid;

        // Auto-update status
        let status = existing.status;
        if (remaining_balance <= 0) {
            status = 'paid';
        } else if (existing.due_date && new Date(existing.due_date) < new Date() && remaining_balance > 0) {
            status = 'overdue';
        } else if (remaining_balance > 0) {
            status = 'active';
        }

        const updated: CachedLoan = {
            ...existing,
            ...updates,
            remaining_balance,
            status,
            synced: false,
            lastModified: Date.now(),
            updated_at: new Date().toISOString()
        };

        await syncService.queueOperation('loans', 'update', updated);
        return updated;
    };

    const recordPayment = async (id: string, paymentAmount: number) => {
        const existing = await db.loans.get(id);
        if (!existing) throw new Error('Loan not found');

        const newAmountPaid = existing.amount_paid + paymentAmount;
        return updateLoan(id, { amount_paid: newAmountPaid });
    };

    const deleteLoan = async (id: string) => {
        await syncService.queueOperation('loans', 'delete', { id });
    };

    return {
        loans: loans || [],
        loading: loans === undefined,
        createLoan,
        updateLoan,
        recordPayment,
        deleteLoan
    };
}
