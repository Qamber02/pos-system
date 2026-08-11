import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useOfflineLoans } from '@/hooks/useOfflineLoans';
import { useOfflineCustomers } from '@/hooks/useOfflineCustomers';
import { useOfflineProducts } from '@/hooks/useOfflineProducts';
import { useOfflineVariants } from '@/hooks/useOfflineVariants';
import { useOfflineSettings } from '@/hooks/useOfflineSettings';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface LoanDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    editingLoan?: any;
}

export function LoanDialog({ open, onOpenChange, userId, editingLoan }: LoanDialogProps) {
    const { createLoan, updateLoan } = useOfflineLoans();
    const { customers } = useOfflineCustomers('');
    const { products } = useOfflineProducts('', null, 100);
    const { settings } = useOfflineSettings();
    const currencySymbol = settings?.currency_symbol || 'PKR';

    const [saving, setSaving] = useState(false);
    const [selectedProductId, setSelectedProductId] = useState<string>('');
    const { variants } = useOfflineVariants(selectedProductId);

    // Multi-item state
    const [selectedItems, setSelectedItems] = useState<Array<{
        productId: string;
        productName: string;
        variantId?: string;
        variantName?: string;
        price: number;
        quantity: number;
    }>>([]);

    const [form, setForm] = useState({
        customer_id: editingLoan?.customer_id || '',
        product_id: editingLoan?.product_id || '', // Keep for backward compatibility or single item selection
        variant_id: editingLoan?.variant_id || '',
        loan_amount: editingLoan?.loan_amount?.toString() || '',
        amount_paid: editingLoan?.amount_paid?.toString() || '0',
        due_date: editingLoan?.due_date ? new Date(editingLoan.due_date) : undefined as Date | undefined,
        notes: editingLoan?.notes || '',
    });

    // Temporary state for adding an item
    const [currentItem, setCurrentItem] = useState({
        productId: '',
        variantId: '',
        quantity: '1',
        price: ''
    });

    const handleProductChange = (productId: string) => {
        setSelectedProductId(productId);
        const product = products.find(p => p.id === productId);
        setCurrentItem({
            ...currentItem,
            productId,
            variantId: '',
            price: product?.retail_price.toString() || ''
        });
    };

    const handleVariantChange = (variantId: string) => {
        const variant = variants.find(v => v.id === variantId);
        const product = products.find(p => p.id === currentItem.productId);
        const basePrice = product?.retail_price || 0;
        const adjustment = variant?.price_adjustment || 0;

        setCurrentItem({
            ...currentItem,
            variantId,
            price: (basePrice + adjustment).toString()
        });
    };

    const addItem = () => {
        if (!currentItem.productId) return;

        const product = products.find(p => p.id === currentItem.productId);
        const variant = variants.find(v => v.id === currentItem.variantId);

        if (!product) return;

        const newItem = {
            productId: currentItem.productId,
            productName: product.name,
            variantId: currentItem.variantId || undefined,
            variantName: variant?.variant_name,
            price: parseFloat(currentItem.price) || 0,
            quantity: parseInt(currentItem.quantity) || 1
        };

        const newItems = [...selectedItems, newItem];
        setSelectedItems(newItems);

        // Update loan amount automatically
        const totalAmount = newItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        setForm(prev => ({ ...prev, loan_amount: totalAmount.toString() }));

        // Reset current item selection
        setCurrentItem({
            productId: '',
            variantId: '',
            quantity: '1',
            price: ''
        });
        setSelectedProductId('');
    };

    const removeItem = (index: number) => {
        const newItems = selectedItems.filter((_, i) => i !== index);
        setSelectedItems(newItems);

        // Update loan amount automatically
        const totalAmount = newItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        setForm(prev => ({ ...prev, loan_amount: totalAmount.toString() }));
    };

    const handleSave = async () => {
        if (!form.customer_id) {
            toast.error('Please select a customer');
            return;
        }
        if (!form.loan_amount || parseFloat(form.loan_amount) <= 0) {
            toast.error('Please enter a valid loan amount');
            return;
        }

        setSaving(true);
        try {
            // Construct notes from items if any
            let notes = form.notes || '';
            if (selectedItems.length > 0) {
                const itemDetails = selectedItems.map(item =>
                    `${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ''} @ ${item.price}`
                ).join(', ');
                notes = notes ? `${notes}\nItems: ${itemDetails}` : `Items: ${itemDetails}`;
            }

            const loanData = {
                customer_id: form.customer_id,
                product_id: selectedItems.length === 1 ? selectedItems[0].productId : undefined, // Store ID if single item
                variant_id: selectedItems.length === 1 ? selectedItems[0].variantId : undefined,
                loan_amount: parseFloat(form.loan_amount),
                amount_paid: parseFloat(form.amount_paid) || 0,
                loan_date: new Date().toISOString(),
                due_date: form.due_date?.toISOString(),
                status: 'active' as const,
                notes: notes,
                user_id: userId,
            };

            if (editingLoan) {
                await updateLoan(editingLoan.id, loanData);
                toast.success('Loan updated successfully');
            } else {
                await createLoan(loanData);
                toast.success('Loan created successfully');
            }

            onOpenChange(false);
            // Reset state
            setSelectedItems([]);
            setForm({
                customer_id: '',
                product_id: '',
                variant_id: '',
                loan_amount: '',
                amount_paid: '0',
                due_date: undefined,
                notes: ''
            });
        } catch (error: any) {
            toast.error(error.message || 'Failed to save loan');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editingLoan ? 'Edit Loan' : 'Create New Loan'}</DialogTitle>
                    <DialogDescription>
                        Track products given to customers on credit
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="customer">Customer *</Label>
                        <Select value={form.customer_id} onValueChange={(val) => setForm({ ...form, customer_id: val })}>
                            <SelectTrigger id="customer">
                                <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                            <SelectContent>
                                {customers.map((customer) => (
                                    <SelectItem key={customer.id} value={customer.id}>
                                        {customer.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Item Selection Section */}
                    <div className="p-4 border rounded-lg bg-slate-50 space-y-4">
                        <h4 className="font-medium text-sm">Add Items to Loan</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="product">Product</Label>
                                <Select value={currentItem.productId} onValueChange={handleProductChange}>
                                    <SelectTrigger id="product">
                                        <SelectValue placeholder="Select product" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {products.map((product) => (
                                            <SelectItem key={product.id} value={product.id}>
                                                {product.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {selectedProductId && variants.length > 0 && (
                                <div className="space-y-2">
                                    <Label htmlFor="variant">Variant</Label>
                                    <Select value={currentItem.variantId} onValueChange={handleVariantChange}>
                                        <SelectTrigger id="variant">
                                            <SelectValue placeholder="Select variant" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {variants.map((variant) => (
                                                <SelectItem key={variant.id} value={variant.id}>
                                                    {variant.variant_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-3 gap-4 items-end">
                            <div className="space-y-2">
                                <Label>Price</Label>
                                <Input
                                    type="number"
                                    value={currentItem.price}
                                    onChange={e => setCurrentItem({ ...currentItem, price: e.target.value })}
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Quantity</Label>
                                <Input
                                    type="number"
                                    value={currentItem.quantity}
                                    onChange={e => setCurrentItem({ ...currentItem, quantity: e.target.value })}
                                    placeholder="1"
                                />
                            </div>
                            <Button onClick={addItem} disabled={!currentItem.productId} variant="secondary">
                                Add Item
                            </Button>
                        </div>

                        {/* Selected Items List */}
                        {selectedItems.length > 0 && (
                            <div className="mt-4 border-t pt-4">
                                <Label className="mb-2 block">Selected Items</Label>
                                <div className="space-y-2">
                                    {selectedItems.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border text-sm">
                                            <span>{item.quantity}x {item.productName} {item.variantName && `(${item.variantName})`}</span>
                                            <div className="flex items-center gap-2">
                                                <span>{currencySymbol} {(item.price * item.quantity).toFixed(2)}</span>
                                                <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="h-6 w-6 p-0 text-red-500">
                                                    &times;
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="loan_amount">Total Loan Amount ({currencySymbol}) *</Label>
                            <Input
                                id="loan_amount"
                                type="number"
                                step="0.01"
                                value={form.loan_amount}
                                onChange={(e) => setForm({ ...form, loan_amount: e.target.value })}
                                placeholder="0.00"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="amount_paid">Down Payment ({currencySymbol})</Label>
                            <Input
                                id="amount_paid"
                                type="number"
                                step="0.01"
                                value={form.amount_paid}
                                onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Due Date (Optional)</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !form.due_date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {form.due_date ? format(form.due_date, "PPP") : "Pick a date"}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={form.due_date}
                                    onSelect={(date) => setForm({ ...form, due_date: date })}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes (Optional)</Label>
                        <Textarea
                            id="notes"
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            placeholder="Additional information about this loan..."
                            rows={3}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            editingLoan ? 'Update Loan' : 'Create Loan'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
