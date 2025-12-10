import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useOfflineVariants } from '@/hooks/useOfflineVariants';
import { useOfflineSettings } from '@/hooks/useOfflineSettings';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { Plus, Edit, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ProductVariantDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    productId: string;
    productName: string;
    userId: string;
}

export function ProductVariantDialog({ open, onOpenChange, productId, productName, userId }: ProductVariantDialogProps) {
    const { variants, loading, createVariant, updateVariant, deleteVariant } = useOfflineVariants(productId);
    const { settings } = useOfflineSettings();
    const formatCurrency = useFormatCurrency();
    const currencySymbol = settings?.currency_symbol || 'PKR';
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        variant_name: '',
        sku: '',
        price_adjustment: '0',
        stock_quantity: '0',
    });

    const resetForm = () => {
        setForm({
            variant_name: '',
            sku: '',
            price_adjustment: '0',
            stock_quantity: '0',
        });
        setEditingId(null);
    };

    const handleEdit = (variant: any) => {
        setEditingId(variant.id);
        setForm({
            variant_name: variant.variant_name,
            sku: variant.sku || '',
            price_adjustment: variant.price_adjustment.toString(),
            stock_quantity: variant.stock_quantity.toString(),
        });
    };

    const handleSave = async () => {
        if (!form.variant_name.trim()) {
            toast.error('Variant name is required');
            return;
        }

        setSaving(true);
        try {
            const variantData = {
                product_id: productId,
                variant_name: form.variant_name,
                sku: form.sku || undefined,
                price_adjustment: parseFloat(form.price_adjustment) || 0,
                stock_quantity: parseInt(form.stock_quantity) || 0,
                is_active: true,
                user_id: userId,
            };

            if (editingId) {
                await updateVariant(editingId, variantData);
                toast.success('Variant updated');
            } else {
                await createVariant(variantData);
                toast.success('Variant created');
            }

            resetForm();
        } catch (error: any) {
            toast.error(error.message || 'Failed to save variant');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this variant?')) return;

        try {
            await deleteVariant(id);
            toast.success('Variant deleted');
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete variant');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Product Variants - {productName}</DialogTitle>
                    <DialogDescription>
                        Manage different variants like sizes, colors, or capacities
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Add/Edit Form */}
                    <div className="p-4 border-2 border-primary/20 rounded-lg bg-primary/5">
                        <h3 className="font-semibold mb-3">{editingId ? 'Edit Variant' : 'Add New Variant'}</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="variant_name">Variant Name *</Label>
                                <Input
                                    id="variant_name"
                                    value={form.variant_name}
                                    onChange={(e) => setForm({ ...form, variant_name: e.target.value })}
                                    placeholder="e.g., 32GB, Red, Large"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="sku">SKU (Optional)</Label>
                                <Input
                                    id="sku"
                                    value={form.sku}
                                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                                    placeholder="e.g., USB-32GB"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="price_adjustment">Price Adjustment ({currencySymbol})</Label>
                                <Input
                                    id="price_adjustment"
                                    type="number"
                                    step="0.01"
                                    value={form.price_adjustment}
                                    onChange={(e) => setForm({ ...form, price_adjustment: e.target.value })}
                                    placeholder="0"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="stock_quantity">Stock Quantity</Label>
                                <Input
                                    id="stock_quantity"
                                    type="number"
                                    value={form.stock_quantity}
                                    onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                                    placeholder="0"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                            <Button onClick={handleSave} disabled={saving} size="sm">
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                {editingId ? 'Update' : 'Add'} Variant
                            </Button>
                            {editingId && (
                                <Button onClick={resetForm} variant="outline" size="sm">
                                    Cancel
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Variants List */}
                    <div>
                        <h3 className="font-semibold mb-3">Existing Variants ({variants.length})</h3>
                        {loading ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                                Loading variants...
                            </div>
                        ) : variants.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No variants yet. Add one above!
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>SKU</TableHead>
                                        <TableHead>Price Adj.</TableHead>
                                        <TableHead>Stock</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {variants.map((variant) => (
                                        <TableRow key={variant.id}>
                                            <TableCell className="font-medium">{variant.variant_name}</TableCell>
                                            <TableCell>
                                                {variant.sku ? (
                                                    <Badge variant="outline">{variant.sku}</Badge>
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {variant.price_adjustment > 0 && '+'}
                                                {formatCurrency(variant.price_adjustment)}
                                            </TableCell>
                                            <TableCell>{variant.stock_quantity}</TableCell>
                                            <TableCell className="text-right space-x-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleEdit(variant)}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    onClick={() => handleDelete(variant.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
