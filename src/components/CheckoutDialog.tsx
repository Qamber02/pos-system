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
import { UserProfile, db, CachedSale, CachedSaleItem, CachedLoan } from "@/lib/db";
import { useOfflineCustomers } from "@/hooks/useOfflineCustomers";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
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
  const [isProcessing, setIsProcessing] = useState(false);
  const formatPrice = useFormatCurrency();
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
  const handleCompleteSale = async (print: boolean = false) => {
    const paid = parseFloat(amountPaid) || 0;

    if (paid < total && paymentMethod !== 'loan') {
      toast.error("Amount paid is less than total");
      return;
    }

    if (!profile) {
      toast.error("Error: User profile not loaded. Cannot complete sale.");
      return;
    }

    setIsProcessing(true);

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
        product_id: item.productId || item.id, // FIX: Use Parent ID for FK constraint
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        subtotal: item.price * item.quantity,
        variant_id: item.variantId, // Added variant_id
        variant_name: item.variantName, // Added variant_name
        synced: false,
        lastModified: lastModified,
      }));

      // 4. Create Stock Update Objects (Products OR Variants)
      const stockUpdatesPromises = cartItems.map(async (item) => {
        if (item.variantId) {
          // --- HANDLE VARIANT STOCK ---
          const variant = await db.productVariants.get(item.variantId);
          // Use item.productId if available (it should be now), otherwise fallback to item.id (which might be wrong for variants but we try)
          const parentId = item.productId || item.id;
          const product = await db.products.get(parentId);

          const updates = [];

          if (variant) {
            const newVariantStock = (variant.stock_quantity || 0) - item.quantity;

            // Update Variant Locally
            await db.productVariants.update(item.variantId, {
              stock_quantity: newVariantStock,
              lastModified: Date.now(),
              synced: false
            });

            updates.push({
              table: 'productVariants',
              data: {
                id: item.variantId,
                stock_quantity: newVariantStock,
                lastModified: Date.now(),
                synced: false
              }
            });
          }

          // ALSO Update Parent Product Stock (Total Stock)
          if (product) {
            const newProductStock = (product.stock_quantity || 0) - item.quantity;

            // Update Product Locally
            // FIX: Use product.id, NOT item.id (which is the variant ID)
            await db.products.update(product.id, {
              stock_quantity: newProductStock,
              lastModified: Date.now(),
              synced: false
            });

            updates.push({
              table: 'products',
              data: {
                id: product.id, // FIX: Use product.id
                stock_quantity: newProductStock,
                lastModified: Date.now(),
                synced: false
              }
            });
          }

          return updates; // Return array of updates
        } else {
          // --- HANDLE MAIN PRODUCT STOCK (SIMPLE PRODUCT) ---
          const product = await db.products.get(item.id);
          if (product) {
            const newStock = (product.stock_quantity || 0) - item.quantity;

            // Update Local DB
            await db.products.update(item.id, {
              stock_quantity: newStock,
              lastModified: Date.now(),
              synced: false
            });

            return [{
              table: 'products',
              data: {
                id: item.id,
                stock_quantity: newStock,
                lastModified: Date.now(),
                synced: false,
              }
            }];
          }
        }
        return [];
      });

      // Flatten the array of arrays
      const stockUpdates = (await Promise.all(stockUpdatesPromises)).flat();

      // 5. Use queueOperation to save locally AND queue for sync
      await syncService.queueOperation('sales', 'insert', sale);

      for (const item of saleItems) {
        await syncService.queueOperation('saleItems', 'insert', item);
      }

      for (const update of stockUpdates) {
        if (update) {
          await syncService.queueOperation(update.table, 'update', update.data);
        }
      }

      // 6. Handle Loan Creation if applicable
      if (paymentMethod === 'loan') {
        if (selectedCustomer === 'walk-in') {
          throw new Error("Cannot create loan for walk-in customer. Please select a customer.");
        }

        const loanAmount = total - paid;
        if (loanAmount > 0) {
          const newLoan: CachedLoan = {
            id: crypto.randomUUID(),
            customer_id: selectedCustomer,
            loan_amount: loanAmount,
            amount_paid: paid,
            remaining_balance: loanAmount,
            loan_date: now.toISOString(),
            due_date: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Default 30 days
            status: 'active',
            notes: `Auto-generated from Sale #${receiptNumber}`,
            user_id: profile.id,
            synced: false,
            lastModified: Date.now(),
            updated_at: now.toISOString()
          };
          await syncService.queueOperation('loans', 'insert', newLoan);
        }
      }

      // 7. Handle Printing - DECOUPLED from success flow
      if (print) {
        // We don't await this because we want to close the dialog immediately
        handlePrintReceipt(receiptNumber, sale).catch(err => {
          console.error("Printing failed:", err);
          toast.error("Sale saved, but printing failed. Please reprint from history.");
        });
        toast.success(`Sale completed! Printing...`);
      } else {
        toast.success(`Sale completed!`);
      }

      // 8. Close Dialog & Reset - IMMEDIATELY
      onComplete();
      onOpenChange(false);

    } catch (error: any) {
      console.error("Error completing sale:", error);
      toast.error("Error completing sale: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintReceipt = async (receiptNumber: string, sale: any) => {
    // Hidden Iframe Approach
    const logoSrc = settings.logo_url || defaultLogo;

    // Create a hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const receiptHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt - ${receiptNumber}</title>
        <style>
          body { font-family: 'Courier New', monospace; width: 300px; margin: 0; padding: 10px; font-size: 12px; }
          .logo { text-align: center; margin-bottom: 10px; }
          .logo img { max-width: 60px; max-height: 60px; object-fit: contain; }
          h1 { text-align: center; font-size: 16px; margin: 5px 0; }
          .info { text-align: center; margin-bottom: 10px; font-size: 10px; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          th, td { padding: 2px 0; text-align: left; font-size: 10px; }
          .text-right { text-align: right; }
          .total-row { border-top: 1px dashed #000; font-weight: bold; margin-top: 5px; }
          .footer { text-align: center; margin-top: 15px; font-size: 10px; }
          hr { border: none; border-top: 1px dashed #000; margin: 5px 0; }
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
            <tr> <th>Item</th> <th>Qty</th> <th class="text-right">Price</th> <th class="text-right">Total</th> </tr>
          </thead>
          <tbody>
            ${cartItems.map(item => `
              <tr>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td class="text-right">${formatCurrency(item.price)}</td>
                <td class="text-right">${formatCurrency(item.price * item.quantity)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <hr />
        <table>
          <tr>
            <td>Subtotal:</td>
            <td class="text-right">${formatCurrency(subtotal)}</td>
          </tr>
          ${discount > 0 ? `
          <tr>
            <td>Discount:</td>
            <td class="text-right">-${formatCurrency(discount)}</td>
          </tr>
          ` : ''}
          <tr>
            <td>Tax (${taxRate}%):</td>
            <td class="text-right">${formatCurrency(taxAmount)}</td>
          </tr>
          <tr class="total-row">
            <td>TOTAL:</td>
            <td class="text-right">${formatCurrency(total)}</td>
          </tr>
          ${paymentMethod === 'cash' ? `
          <tr>
            <td>Paid:</td>
            <td class="text-right">${formatCurrency(parseFloat(amountPaid))}</td>
          </tr>
          <tr>
            <td>Change:</td>
            <td class="text-right">${formatCurrency(calculateChange())}</td>
          </tr>
          ` : ''}
        </table>
        <hr />
        <div class="footer">
          ${settings.receipt_footer}
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(receiptHTML);
      doc.close();

      // Wait for print to be initiated (or failed) then remove iframe
      // Note: There is no reliable cross-browser way to know when print is done.
      // We just remove the iframe after a sufficient delay.
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 5000);
    } else {
      console.error("Could not access iframe document");
    }
  };

  const formatCurrency = (amount: number) => {
    return formatPrice(amount);
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
            <Tabs value={paymentMethod} onValueChange={(val) => {
              setPaymentMethod(val);
              if (val === 'loan') {
                setAmountPaid('');
              } else {
                setAmountPaid(total.toString());
              }
            }}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="cash">Cash</TabsTrigger>
                <TabsTrigger value="card">Card</TabsTrigger>
                <TabsTrigger value="loan">Loan</TabsTrigger>
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
                  <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(calculateChange())}
                  </span>
                </div>
              </div>
            </>
          )}

          {paymentMethod !== "cash" && paymentMethod !== "loan" && (
            <div className="rounded-lg bg-accent/10 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Exact amount will be charged
              </p>
            </div>
          )}

          {paymentMethod === "loan" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Down Payment (Optional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="rounded-lg bg-blue-50 p-4 border border-blue-100">
                <div className="flex justify-between items-center text-blue-900">
                  <span className="font-medium">Loan Amount</span>
                  <span className="text-xl font-bold">
                    {formatCurrency(Math.max(0, total - (parseFloat(amountPaid) || 0)))}
                  </span>
                </div>
                <p className="text-xs text-blue-700 mt-2">
                  This amount will be added to the customer's outstanding balance.
                  {parseFloat(amountPaid) <= 0 && " No down payment will be collected."}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* This is the UI fix for the footer */}
        <DialogFooter className="mt-4 pt-4 border-t bg-background flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={() => handleCompleteSale(false)}
            disabled={isProcessing}
            variant="secondary"
            className="flex-1"
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete Sale
          </Button>
          <Button
            onClick={() => handleCompleteSale(true)}
            disabled={isProcessing}
            className="flex-1"
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Printer className="mr-2 h-4 w-4" />
            Complete & Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
