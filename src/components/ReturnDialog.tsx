import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

interface ReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ReturnDialog = ({ open, onOpenChange }: ReturnDialogProps) => {
  const [receiptNumber, setReceiptNumber] = useState("");
  const [sale, setSale] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

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

      setSale(data);
      toast.success("Sale found");
    } catch (error: any) {
      console.error("Error finding sale:", error);
      toast.error("Sale not found");
      setSale(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = async () => {
    if (!sale) return;

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Create a return/refund record by inserting a negative sale
      const returnReceiptNumber = `RTN-${sale.receipt_number}`;
      
      const { data: returnSale, error: returnError } = await supabase
        .from("sales")
        .insert({
          receipt_number: returnReceiptNumber,
          customer_id: sale.customer_id,
          subtotal: -sale.subtotal,
          discount_amount: -sale.discount_amount,
          tax_amount: -sale.tax_amount,
          total_amount: -sale.total_amount,
          payment_method: sale.payment_method,
          amount_paid: -sale.total_amount,
          change_amount: 0,
          user_id: user.id,
          notes: `Return for ${sale.receipt_number}`,
        })
        .select()
        .single();

      if (returnError) throw returnError;

      // Create return items and restore stock
      for (const item of sale.sale_items) {
        // Insert negative sale item
        await supabase.from("sale_items").insert({
          sale_id: returnSale.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: -item.quantity,
          unit_price: item.unit_price,
          subtotal: -item.subtotal,
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
              .update({ stock_quantity: product.stock_quantity + Math.abs(item.quantity) })
              .eq("id", item.product_id);
          }
        }
      }

      toast.success(`Return processed! Return receipt: ${returnReceiptNumber}`);
      onOpenChange(false);
      setReceiptNumber("");
      setSale(null);
    } catch (error: any) {
      console.error("Error processing return:", error);
      toast.error("Error processing return: " + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `PKR ${amount.toFixed(2)}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
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
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Receipt</p>
                  <p className="font-medium">{sale.receipt_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {new Date(sale.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment Method</p>
                  <p className="font-medium capitalize">{sale.payment_method}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <p className="font-medium text-lg">{formatCurrency(sale.total_amount)}</p>
                </div>
              </div>

              <div>
                <p className="font-semibold mb-2">Items</p>
                <div className="space-y-2">
                  {sale.sale_items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm p-2 bg-background rounded">
                      <span>{item.product_name} x{item.quantity}</span>
                      <span className="font-medium">{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-destructive font-medium">
                  Warning: This will refund the entire sale and restore stock quantities.
                </p>
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
            disabled={!sale || processing}
            variant="destructive"
          >
            {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Process Return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
