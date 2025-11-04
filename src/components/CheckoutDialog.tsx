import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CartItem } from "./Cart";
import { Loader2, Printer } from "lucide-react";
import defaultLogo from "@/assets/default-logo.png";
import { UserProfile, db, CachedSale, CachedSaleItem } from "@/lib/db";
import { useOfflineCustomers } from "@/hooks/useOfflineCustomers";
import { useOfflineSettings } from "@/hooks/useOfflineSettings";
import { syncService } from "@/lib/syncService";

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartItems: CartItem[];
  subtotal: number;
  discount: number;
  taxRate: number; // This is now passed from POS.tsx
  taxAmount: number;
  total: number;
  onComplete: () => void;
  profile: UserProfile | null; // Receive the user's profile
}

export const CheckoutDialog = ({
  open,
  onOpenChange,
  cartItems,
  subtotal,
  discount,
  taxRate,
  taxAmount,
  total,
  onComplete,
  profile,
}: CheckoutDialogProps) => {
  // Get customers and settings from our offline hooks
  const { customers } = useOfflineCustomers();
  const { settings } = useOfflineSettings();

  const [selectedCustomer, setSelectedCustomer] = useState<string>("walk-in");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountPaid, setAmountPaid] = useState(total.toString());
  const [processing, setProcessing] = useState(false);
  const [shouldPrint, setShouldPrint] = useState(false);

  useEffect(() => {
    // No more fetching, just update amountPaid when total changes
    if (open) {
      setAmountPaid(total.toFixed(2));
    }
  }, [open, total]);

  const calculateChange = () => {
    const paid = parseFloat(amountPaid) || 0;
    return Math.max(0, paid - total);
  };

  const handleQuickAmount = (amount: number) => {
    setAmountPaid(amount.toFixed(2));
  };

  // --- THIS IS THE MAIN OFFLINE-FIRST FUNCTION ---
  const handleCompleteSale = async () => {
    const paid = parseFloat(amountPaid) || 0;
    
    if (paid < total) {
      toast.error("Amount paid is less than total");
      return;
    }

    if (!profile) {
      toast.error("Error: User profile not loaded. Cannot complete sale.");
      return;
    }

    setProcessing(true);

    try {
      // 1. Generate local IDs and timestamps
      const newSaleId = crypto.randomUUID();
      const receiptNumber = `RCP-${Date.now()}`;
      const now = new Date();
      const lastModified = now.getTime();

      // 2. Create Sale Object
      const sale: CachedSale = {
        id: newSaleId,
        receipt_number: receiptNumber,
        customer_id: selectedCustomer === "walk-in" ? undefined : selectedCustomer,
        subtotal,
        discount_amount: discount,
        tax_amount: taxAmount,
        total_amount: total,
        payment_method: paymentMethod,
        amount_paid: paid,
        change_amount: calculateChange(),
        user_id: profile.id,
        created_at: now.toISOString(),
        synced: false,
        lastModified: lastModified,
      };

      // 3. Create Sale Item Objects
      const saleItems: CachedSaleItem[] = cartItems.map(item => ({
        id: crypto.randomUUID(),
        sale_id: newSaleId,
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        subtotal: item.price * item.quantity,
        synced: false,
        lastModified: lastModified,
      }));

      // 4. Create Product Stock Update Objects
      // We must read from the local DB to get current stock
      const productUpdatesPromises = cartItems.map(async (item) => {
        const product = await db.products.get(item.id);
        const newStock = (product?.stock_quantity || 0) - item.quantity;
        return {
          id: item.id,
          stock_quantity: newStock,
          lastModified: Date.now(),
          synced: false,
        };
      });
      const updatesToQueue = await Promise.all(productUpdatesPromises);
      
      // 5. Use queueOperation to save locally AND queue for sync
      await syncService.queueOperation('sales', 'insert', sale);
      
      for (const item of saleItems) {
        await syncService.queueOperation('saleItems', 'insert', item);
      }
      
      for (const update of updatesToQueue) {
        // Here, we update the stock of the *product*
        await syncService.queueOperation('products', 'update', update);
      }

      // 6. Handle Printing
      if (shouldPrint) {
        await handlePrintReceipt(receiptNumber, sale);
        toast.success(`Sale completed & printed! (Saved Locally)`);
      } else {
        toast.success(`Sale completed! (Saved Locally)`, {
          action: {
            label: "Print",
            onClick: () => handlePrintReceipt(receiptNumber, sale),
          },
        });
      }
      
      onComplete();
      onOpenChange(false);
      setShouldPrint(false);

    } catch (error: any) {
      console.error("Error completing sale:", error);
      toast.error("Error completing sale: " + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintReceipt = async (receiptNumber: string, sale: any) => {
    // This now uses the settings from our offline hook
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to print receipts");
      return;
    }

    const logoSrc = settings.logo_url || defaultLogo;

    const receiptHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt - ${receiptNumber}</title>
        <style>
          body { font-family: 'Courier New', monospace; max-width: 300px; margin: 20px auto; padding: 20px; }
          .logo { text-align: center; margin-bottom: 10px; }
          .logo img { max-width: 80px; max-height: 80px; object-fit: contain; }
          h1 { text-align: center; font-size: 18px; margin-bottom: 10px; }
          .info { text-align: center; margin-bottom: 20px; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 5px; text-align: left; font-size: 12px; }
          .total-row { border-top: 2px solid #000; font-weight: bold; }
          .footer { text-align: center; margin-top: 20px; font-size: 11px; }
          hr { border: none; border-top: 1px dashed #000; }
        </style>
      </head>
      <body>
        <div class="logo">
          <img src="${logoSrc}" alt="Logo" />
        </div>
        <h1>${settings.business_name}</h1>
        <div class="info">
          <div>Receipt: ${receiptNumber}</div>
          <div>Date: ${new Date(sale.created_at).toLocaleString()}</div>
          <div>Payment: ${paymentMethod.toUpperCase()}</div>
        </div>
        <hr />
        <table>
          <thead>
            <tr> <th>Item</th> <th>Qty</th> <th>Price</th> <th>Total</th> </tr>
          </thead>
          <tbody>
            ${cartItems.map(item => `
              <tr>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.price)}</td>
                <td>${formatCurrency(item.price * item.quantity)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <hr />
        <table>
          <tr>
            <td>Subtotal:</td>
            <td style="text-align: right;">${formatCurrency(subtotal)}</td>
          </tr>
          ${discount > 0 ? `
          <tr>
            <td>Discount:</td>
            <td style="text-align: right;">-${formatCurrency(discount)}</td>
          </tr>
          ` : ''}
          <tr>
            <td>Tax (${taxRate}%):</td>
            <td style="text-align: right;">${formatCurrency(taxAmount)}</td>
          </tr>
          <tr class="total-row">
            <td>TOTAL:</td>
            <td style="text-align: right;">${formatCurrency(total)}</td>
          </tr>
          ${paymentMethod === 'cash' ? `
          <tr>
            <td>Paid:</td>
            <td style="text-align: right;">${formatCurrency(parseFloat(amountPaid))}</td>
          </tr>
          <tr>
            <td>Change:</td>
            <td style="text-align: right;">${formatCurrency(calculateChange())}</td>
          </tr>
          ` : ''}
        </table>
        <hr />
        <div class="footer">
          ${settings.receipt_footer}
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const formatCurrency = (amount: number) => {
    return `PKR ${amount.toFixed(2)}`;
  };

  const quickAmounts = [total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Complete Sale</DialogTitle>
          <DialogDescription>
            Process payment and complete the transaction
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1">
          <div className="space-y-2">
            <Label>Customer</Label>
            <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="walk-in">Walk-in Customer</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Tabs value={paymentMethod} onValueChange={setPaymentMethod}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="cash">Cash</TabsTrigger>
                <TabsTrigger value="card">Card</TabsTrigger>
                <TabsTrigger value="other">Other</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="rounded-lg bg-muted p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-accent">
                <span>Discount</span>
                <span>-{formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span>Tax ({taxRate}%)</span>
              <span className="font-medium">{formatCurrency(taxAmount)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          {paymentMethod === "cash" && (
            <>
              <div className="space-y-2">
                <Label>Amount Paid</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                />
                <div className="flex gap-2 flex-wrap">
                  {quickAmounts.map((amount, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickAmount(amount)}
                    >
                      {formatCurrency(amount)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-accent/10 p-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Change</span>
                  <span className="text-2xl font-bold text-accent">
                    {formatCurrency(calculateChange())}
                  </span>
                </div>
              </div>
            </>
          )}

          {paymentMethod !== "cash" && (
            <div className="rounded-lg bg-accent/10 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Exact amount will be charged
              </p>
            </div>
          )}
        </div>

        {/* This is the UI fix for the footer */}
        <DialogFooter className="mt-4 pt-4 border-t bg-background flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing} className="flex-1">
            Cancel
          </Button>
          <Button 
            onClick={() => {
              setShouldPrint(false);
              handleCompleteSale();
            }} 
            disabled={processing} 
            variant="secondary"
            className="flex-1"
          >
            {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete Sale
          </Button>
          <Button 
            onClick={() => {
              setShouldPrint(true);
              handleCompleteSale();
            }} 
            disabled={processing}
            className="flex-1"
          >
            {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Printer className="mr-2 h-4 w-4" />
            Complete & Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
