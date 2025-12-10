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
    if (!receiptNumber.trim()) {
      toast.error("Please enter a receipt number");
      return;
    }

    setLoading(true);
    try {
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
            subtotal
          )
        `)
        .eq("receipt_number", receiptNumber.trim())
        .single();

      if (error) throw error;

      if (!data) {
        toast.error("Sale not found");
        return;
      }

      // Initialize return state for all items
      const initialReturnState: Record<string, ReturnItemState> = {};
      data.sale_items.forEach((item: any) => {
        initialReturnState[item.id] = {
          selected: false,
          returnQuantity: item.quantity
        };
      });

      setSale(data);
      setReturnItems(initialReturnState);
      toast.success("Sale found");
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
    // Ensure quantity is valid (1 to max)
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
    sale.sale_items.forEach((item: any) => {
      const state = returnItems[item.id];
      if (state?.selected) {
        // Calculate proportional refund based on unit price
        // Note: This assumes no complex discounts per item. 
        // If there was a global discount, we might need to adjust.
        // For now, using unit_price * returnQuantity is safe.
        total += Number(item.unit_price) * state.returnQuantity;
      }
    });
    return total;
  };

  const handleReturn = async () => {
    if (!sale) return;

    const itemsToReturn = sale.sale_items.filter((item: any) => returnItems[item.id]?.selected);

    if (itemsToReturn.length === 0) {
      toast.error("Please select at least one item to return");
      return;
    }

    if (!confirm(`Process refund of ${formatCurrency(calculateRefundTotal())}?`)) {
      return;
    }

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const refundTotal = calculateRefundTotal();
      const returnReceiptNumber = `RTN-${sale.receipt_number}-${Date.now().toString().slice(-4)}`;

      // 1. Create Return Sale Record
      const { data: returnSale, error: returnError } = await supabase
        .from("sales")
        .insert({
          receipt_number: returnReceiptNumber,
          customer_id: sale.customer_id,
          subtotal: -refundTotal,
          discount_amount: 0, // Simplified for partial returns
          tax_amount: 0,      // Simplified
          total_amount: -refundTotal,
          payment_method: sale.payment_method,
          amount_paid: -refundTotal,
          change_amount: 0,
          user_id: user.id,
          notes: `Partial Return for ${sale.receipt_number}`,
        })
        .select()
        .single();

      if (returnError) throw returnError;

      // 2. Create Return Items and Restore Stock
      for (const item of itemsToReturn) {
        const state = returnItems[item.id];
        const qtyToReturn = state.returnQuantity;
        const refundAmount = Number(item.unit_price) * qtyToReturn;

        // Insert negative sale item
        await supabase.from("sale_items").insert({
          sale_id: returnSale.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: -qtyToReturn,
          unit_price: item.unit_price,
          subtotal: -refundAmount,
        });

        // Restore stock
        if (item.product_id) {
          const { data: product } = await supabase
            .from("products")
            .select("stock_quantity")
            .eq("id", item.product_id)
            .single();

          if (product) {
            await supabase
              .from("products")
              .update({ stock_quantity: product.stock_quantity + qtyToReturn })
              .eq("id", item.product_id);
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
