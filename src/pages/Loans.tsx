import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { LoanDialog } from '@/components/LoanDialog';
import { useOfflineLoans } from '@/hooks/useOfflineLoans';
import { useOfflineCustomers } from '@/hooks/useOfflineCustomers';
import { Plus, DollarSign, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';

const Loans = () => {
    const navigate = useNavigate();
    const [userId, setUserId] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<'active' | 'paid' | 'overdue' | undefined>(undefined);
    const [customerFilter, setCustomerFilter] = useState<string>('');
    const [loanDialogOpen, setLoanDialogOpen] = useState(false);
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [selectedLoan, setSelectedLoan] = useState<any>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const formatPrice = useFormatCurrency();

    const { loans, loading, recordPayment } = useOfflineLoans(customerFilter === 'all' ? undefined : customerFilter, statusFilter);
    const { customers } = useOfflineCustomers('');

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            navigate('/auth');
            return;
        }
        setUserId(session.user.id);
    };

    const handleRecordPayment = async () => {
        if (!selectedLoan) return;

        const amount = parseFloat(paymentAmount);
        if (isNaN(amount) || amount <= 0) {
            toast.error('Please enter a valid payment amount');
            return;
        }

        if (amount > selectedLoan.remaining_balance) {
            toast.error('Payment amount cannot exceed remaining balance');
            return;
        }

        try {
            await recordPayment(selectedLoan.id, amount);
            toast.success('Payment recorded successfully');
            setPaymentDialogOpen(false);
            setPaymentAmount('');
            setSelectedLoan(null);
        } catch (error: any) {
            toast.error(error.message || 'Failed to record payment');
        }
    };

    const openPaymentDialog = (loan: any) => {
        setSelectedLoan(loan);
        setPaymentAmount('');
        setPaymentDialogOpen(true);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'paid':
                return <Badge className="bg-green-500"><CheckCircle className="mr-1 h-3 w-3" />Paid</Badge>;
            case 'overdue':
                return <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" />Overdue</Badge>;
            default:
                return <Badge variant="secondary">Active</Badge>;
        }
    };

    const totalLoans = loans.length;
    const activeLoans = loans.filter(l => l.status === 'active').length;
    const overdueLoans = loans.filter(l => l.status === 'overdue').length;
    const totalOutstanding = loans
        .filter(l => l.status !== 'paid')
        .reduce((sum, l) => sum + l.remaining_balance, 0);

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="border-b bg-card shadow-sm sticky top-0 z-50">
                <div className="container mx-auto px-4 py-4 flex items-center gap-4">
                    <Navigation />
                    <h1 className="text-2xl font-bold">Customer Loans</h1>
                </div>
            </header>

            <div className="flex flex-1">
                <Navigation />
                <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
                    {/* Summary Cards */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>Total Loans</CardDescription>
                                <CardTitle className="text-3xl">{totalLoans}</CardTitle>
                            </CardHeader>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>Active Loans</CardDescription>
                                <CardTitle className="text-3xl text-blue-600">{activeLoans}</CardTitle>
                            </CardHeader>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>Overdue Loans</CardDescription>
                                <CardTitle className="text-3xl text-red-600">{overdueLoans}</CardTitle>
                            </CardHeader>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>Total Outstanding</CardDescription>
                                <CardTitle className="text-3xl">{formatPrice(totalOutstanding)}</CardTitle>
                            </CardHeader>
                        </Card>
                    </div>

                    {/* Filters and Actions */}
                    <Card>
                        <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-4">
                                    <Select value={statusFilter || 'all'} onValueChange={(val) => setStatusFilter(val === 'all' ? undefined : val as any)}>
                                        <SelectTrigger className="w-[180px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Status</SelectItem>
                                            <SelectItem value="active">Active</SelectItem>
                                            <SelectItem value="overdue">Overdue</SelectItem>
                                            <SelectItem value="paid">Paid</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Select value={customerFilter} onValueChange={setCustomerFilter}>
                                        <SelectTrigger className="w-[200px]">
                                            <SelectValue placeholder="All Customers" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Customers</SelectItem>
                                            {customers.map((customer) => (
                                                <SelectItem key={customer.id} value={customer.id}>
                                                    {customer.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Button onClick={() => setLoanDialogOpen(true)}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    New Loan
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="text-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                                    <p className="text-muted-foreground">Loading loans...</p>
                                </div>
                            ) : loans.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <p>No loans found</p>
                                    <p className="text-sm mt-2">Create a new loan to get started</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Customer</TableHead>
                                            <TableHead>Loan Amount</TableHead>
                                            <TableHead>Paid</TableHead>
                                            <TableHead>Remaining</TableHead>
                                            <TableHead>Due Date</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loans.map((loan) => {
                                            const customer = customers.find(c => c.id === loan.customer_id);
                                            return (
                                                <TableRow key={loan.id}>
                                                    <TableCell className="font-medium">
                                                        {customer?.name || 'Unknown'}
                                                    </TableCell>
                                                    <TableCell>{formatPrice(loan.loan_amount)}</TableCell>
                                                    <TableCell className="text-green-600">
                                                        {formatPrice(loan.amount_paid)}
                                                    </TableCell>
                                                    <TableCell className="font-semibold">
                                                        {formatPrice(loan.remaining_balance)}
                                                    </TableCell>
                                                    <TableCell>
                                                        {loan.due_date ? format(new Date(loan.due_date), 'MMM dd, yyyy') : '-'}
                                                    </TableCell>
                                                    <TableCell>{getStatusBadge(loan.status)}</TableCell>
                                                    <TableCell className="text-right">
                                                        {loan.status !== 'paid' && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => openPaymentDialog(loan)}
                                                            >
                                                                <DollarSign className="mr-1 h-4 w-4" />
                                                                Record Payment
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </main>
            </div>

            {/* Loan Dialog */}
            <LoanDialog
                open={loanDialogOpen}
                onOpenChange={setLoanDialogOpen}
                userId={userId}
            />

            {/* Payment Dialog */}
            <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Record Payment</DialogTitle>
                        <DialogDescription>
                            Record a payment for this loan
                        </DialogDescription>
                    </DialogHeader>
                    {selectedLoan && (
                        <div className="space-y-4">
                            <div className="p-4 bg-muted rounded-lg space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">Remaining Balance:</span>
                                    <span className="font-semibold">{formatPrice(selectedLoan.remaining_balance)}</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="payment_amount">Payment Amount</Label>
                                <Input
                                    id="payment_amount"
                                    type="number"
                                    step="0.01"
                                    value={paymentAmount}
                                    onChange={(e) => setPaymentAmount(e.target.value)}
                                    placeholder="0.00"
                                    autoFocus
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleRecordPayment}>
                            Record Payment
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Loans;
