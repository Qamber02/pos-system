import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

import { db, CachedSale, CachedSaleItem, CachedRefund } from "@/lib/db";
import { syncService } from "@/lib/syncService";

interface ReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ReturnItemState {
  selected: boolean;
  returnQuantity: number;
}

export const ReturnDialog = ({ open, onOpenChange }: ReturnDialogProps) => {
  const [receiptNumber, setReceiptNumber] = useState("");
  const [sale, setSale] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Map of sale_item_id -> { selected, returnQuantity }
  const [returnItems, setReturnItems] = useState<Record<string, ReturnItemState>>({});

  const handleSearch = async () => {
    const trimmedReceipt = receiptNumber.trim();
    if (!trimmedReceipt) {
      toast.error("Please enter a receipt number");
      return;
    }

    setLoading(true);
    try {
      // 1. Try finding in local Dexie database first (works offline)
      const localSale = await db.sales.where('receipt_number').equals(trimmedReceipt).first();
      
      if (localSale) {
        const localItems = await db.saleItems.where('sale_id').equals(localSale.id).toArray();
        const initialReturnState: Record<string, ReturnItemState> = {};
        localItems.forEach((item) => {
          initialReturnState[item.id] = {
            selected: false,
            returnQuantity: item.quantity
          };
        });

        setSale({ ...localSale, sale_items: localItems });
        setReturnItems(initialReturnState);
        toast.success("Sale found (Local Database)");
        setLoading(false);
        return;
      }

      // 2. Fallback to Supabase cloud if online
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("sales")
          .select(`
            *,
            sale_items (
              id,
              product_id,
              product_name,
              quantity,
              unit_price,
              subtotal,
              variant_id
            )
          `)
          .eq("receipt_number", trimmedReceipt)
          .single();

        if (error) throw error;

        if (data) {
          const initialReturnState: Record<string, ReturnItemState> = {};
          data.sale_items.forEach((item: any) => {
            initialReturnState[item.id] = {
              selected: false,
              returnQuantity: item.quantity
            };
          });

          setSale(data);
          setReturnItems(initialReturnState);
          toast.success("Sale found (Cloud)");
          setLoading(false);
          return;
        }
      }

      toast.error("Sale receipt not found");
      setSale(null);
    } catch (error: any) {
      console.error("Error finding sale:", error);
      toast.error("Sale not found");
      setSale(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleItemSelection = (itemId: string, checked: boolean) => {
    setReturnItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        selected: checked
      }
    }));
  };

  const updateReturnQuantity = (itemId: string, quantity: number, maxQuantity: number) => {
    const validQuantity = Math.max(1, Math.min(quantity, maxQuantity));
    setReturnItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        returnQuantity: validQuantity
      }
    }));
  };

  const calculateRefundTotal = () => {
    if (!sale) return 0;
    let total = 0;
    sale.sale_items?.forEach((item: any) => {
      const state = returnItems[item.id];
      if (state?.selected) {
        total += Number(item.unit_price) * state.returnQuantity;
      }
    });
    return total;
  };

  const handleReturn = async () => {
    if (!sale) return;

    const itemsToReturn = sale.sale_items?.filter((item: any) => returnItems[item.id]?.selected) || [];

    if (itemsToReturn.length === 0) {
      toast.error("Please select at least one item to return");
      return;
    }

    if (!confirm(`Process refund of ${formatCurrency(calculateRefundTotal())}?`)) {
      return;
    }

    setProcessing(true);
    try {
      let activeUserId = "d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0";
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) activeUserId = user.id;
      } catch {}

      const refundTotal = calculateRefundTotal();
      const returnReceiptNumber = `RTN-${sale.receipt_number}-${Date.now().toString().slice(-4)}`;
      const nowIso = new Date().toISOString();
      const nowTimestamp = Date.now();
      const newReturnSaleId = crypto.randomUUID();

      // 1. Create Return Sale Record (Offline-ready)
      const returnSale: CachedSale = {
        id: newReturnSaleId,
        receipt_number: returnReceiptNumber,
        customer_id: sale.customer_id,
        subtotal: -refundTotal,
        discount_amount: 0,
        tax_amount: 0,
        total_amount: -refundTotal,
        payment_method: sale.payment_method || 'cash',
        amount_paid: -refundTotal,
        change_amount: 0,
        user_id: activeUserId,
        notes: `Partial Return for ${sale.receipt_number}`,
        synced: false,
        lastModified: nowTimestamp,
        created_at: nowIso
      };
      await syncService.queueOperation('sales', 'insert', returnSale);

      // 1b. Create Audit Refund Record
      const refundRecord: CachedRefund = {
        id: crypto.randomUUID(),
        user_id: activeUserId,
        sale_id: sale.id,
        refund_number: returnReceiptNumber,
        amount: refundTotal,
        refund_type: 'product',
        payment_method: sale.payment_method || 'cash',
        reason: `POS Return for receipt ${sale.receipt_number}`,
        restock_item: true,
        processed_by: activeUserId,
        synced: false,
        lastModified: nowTimestamp,
        created_at: nowIso
      };
      await syncService.queueOperation('refunds', 'insert', refundRecord);

      // 2. Create Return Items and Restore Stock in Dexie & Sync
      for (const item of itemsToReturn) {
        const state = returnItems[item.id];
        const qtyToReturn = state.returnQuantity;
        const refundAmount = Number(item.unit_price) * qtyToReturn;

        const returnSaleItem: CachedSaleItem = {
          id: crypto.randomUUID(),
          sale_id: newReturnSaleId,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: -qtyToReturn,
          unit_price: item.unit_price,
          subtotal: -refundAmount,
          variant_id: item.variant_id,
          synced: false,
          lastModified: nowTimestamp
        };
        await syncService.queueOperation('saleItems', 'insert', returnSaleItem);

        // Restore stock in local database
        if (item.product_id) {
          const product = await db.products.get(item.product_id);
          if (product) {
            const updatedProduct = {
              ...product,
              stock_quantity: product.stock_quantity + qtyToReturn,
              lastModified: nowTimestamp,
              synced: false,
              updated_at: nowIso
            };
            await syncService.queueOperation('products', 'update', updatedProduct);
          }
        }

        // Restore variant stock if present
        if (item.variant_id) {
          const variant = await db.productVariants.get(item.variant_id);
          if (variant) {
            const updatedVariant = {
              ...variant,
              stock_quantity: variant.stock_quantity + qtyToReturn,
              lastModified: nowTimestamp,
              synced: false,
              updated_at: nowIso
            };
            await syncService.queueOperation('productVariants', 'update', updatedVariant);
          }
        }
      }

      toast.success(`Return processed! Refund: ${formatCurrency(refundTotal)}`);
      onOpenChange(false);
      setReceiptNumber("");
      setSale(null);
      setReturnItems({});
    } catch (error: any) {
      console.error("Error processing return:", error);
      toast.error("Error processing return: " + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = useFormatCurrency();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Process Return</DialogTitle>
          <DialogDescription>
            Enter the receipt number to process a return
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>Receipt Number</Label>
              <Input
                placeholder="RCP-..."
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch} disabled={loading} className="mt-auto">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {sale && (
            <div className="space-y-4">
              <div className="p-4 border rounded-lg bg-muted/50 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Receipt</p>
                  <p className="font-medium">{sale.receipt_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{new Date(sale.created_at).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Original Total</p>
                  <p className="font-medium">{formatCurrency(sale.total_amount)}</p>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Select</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Qty Sold</TableHead>
                      <TableHead className="w-[100px]">Return Qty</TableHead>
                      <TableHead className="text-right">Refund</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sale.sale_items?.map((item: any) => {
                      const state = returnItems[item.id] || { selected: false, returnQuantity: item.quantity };
                      const refundAmount = Number(item.unit_price) * state.returnQuantity;

                      return (
                        <TableRow key={item.id} className={state.selected ? "bg-muted/30" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={state.selected}
                              onCheckedChange={(checked) => toggleItemSelection(item.id, checked as boolean)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell>{formatCurrency(item.unit_price)}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              max={item.quantity}
                              value={state.returnQuantity}
                              onChange={(e) => updateReturnQuantity(item.id, parseInt(e.target.value) || 1, item.quantity)}
                              disabled={!state.selected}
                              className="h-8 w-20"
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {state.selected ? formatCurrency(refundAmount) : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end items-center gap-4 p-4 bg-destructive/5 rounded-lg border border-destructive/20">
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Stock will be restored for selected items
                </div>
                <div className="text-xl font-bold text-destructive">
                  Refund Total: {formatCurrency(calculateRefundTotal())}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleReturn}
            disabled={!sale || processing || calculateRefundTotal() === 0}
            variant="destructive"
          >
            {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Process Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
