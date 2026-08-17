import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CartItem } from "./Cart";
import { Loader2, Printer, MessageSquare, Phone } from "lucide-react";
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
  const [receiptPhone, setReceiptPhone] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const formatPrice = useFormatCurrency();

  useEffect(() => {
    if (open) {
      setAmountPaid(total.toFixed(2));
    }
  }, [open, total]);

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomer(customerId);
    if (customerId !== "walk-in") {
      const cust = customers.find(c => c.id === customerId);
      if (cust?.phone) {
        setReceiptPhone(cust.phone);
      }
    }
  };

  const sendWhatsAppReceipt = (phone: string, receiptNumber: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      toast.error("Please enter a valid phone number with country code (e.g. 923001234567)");
      return;
    }

    const storeName = settings.business_name || "POS SHOPPING";
    const footer = settings.receipt_footer || "Thank you for your business!";
    
    const itemsText = cartItems.map(item => 
      `• ${item.name} x${item.quantity} = ${formatPrice(item.price * item.quantity)}`
    ).join('\n');

    const text = `🧾 *RECEIPT FROM ${storeName.toUpperCase()}*\n` +
      `-----------------------------------\n` +
      `*Receipt #:* ${receiptNumber}\n` +
      `*Date:* ${new Date().toLocaleString()}\n` +
      `*Payment:* ${paymentMethod.toUpperCase()}\n` +
      `-----------------------------------\n` +
      `*ITEMS:*\n${itemsText}\n` +
      `-----------------------------------\n` +
      `*Subtotal:* ${formatPrice(subtotal)}\n` +
      (discount > 0 ? `*Discount:* -${formatPrice(discount)}\n` : '') +
      (taxAmount > 0 ? `*Tax:* ${formatPrice(taxAmount)}\n` : '') +
      `*TOTAL:* ${formatPrice(total)}\n` +
      (paymentMethod === 'cash' ? `*Paid:* ${formatPrice(parseFloat(amountPaid) || 0)}\n*Change:* ${formatPrice(calculateChange())}\n` : '') +
      `-----------------------------------\n` +
      `${footer}`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };


  const calculateChange = () => {
    const paid = parseFloat(amountPaid) || 0;
    return Math.max(0, paid - total);
  };

  const handleQuickAmount = (amount: number) => {
    setAmountPaid(amount.toFixed(2));
  };

  // --- THIS IS THE MAIN OFFLINE-FIRST FUNCTION ---
  const handleCompleteSale = async (action: 'complete' | 'print' | 'whatsapp' = 'complete') => {
    const paid = parseFloat(amountPaid) || 0;

    if (paid < total && paymentMethod !== 'loan') {
      toast.error("Amount paid is less than total");
      return;
    }

    if (action === 'whatsapp' && !receiptPhone.trim()) {
      toast.error("Please enter a phone number to send the WhatsApp receipt");
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
        product_id: (item.repairTicketId && !item.productId) ? (null as any) : (item.productId || item.id),
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        subtotal: item.price * item.quantity,
        variant_id: item.variantId,
        variant_name: item.variantName,
        device_identifier_id: item.deviceIdentifierId,
        repair_ticket_id: item.repairTicketId,
        synced: false,
        lastModified: lastModified,
      }));

      // 4. Create Stock Update & Serialized Device / Repair Ticket Lifecycle Updates
      const stockUpdatesPromises = cartItems.map(async (item) => {
        if (item.deviceIdentifierId) {
          const device = await db.deviceIdentifiers.get(item.deviceIdentifierId);
          if (device) {
            const updatedDevice = {
              ...device,
              status: 'sold' as const,
              customer_id: selectedCustomer === "walk-in" ? undefined : selectedCustomer,
              synced: false,
              lastModified: Date.now(),
              updated_at: new Date().toISOString()
            };
            await syncService.queueOperation('deviceIdentifiers', 'update', updatedDevice);
          }
        }

        if (item.repairTicketId) {
          const ticket = await db.repairTickets.get(item.repairTicketId);
          if (ticket) {
            const nowIso = new Date().toISOString();
            const nowTimestamp = Date.now();
            const updatedTicket = {
              ...ticket,
              status: 'completed' as const,
              synced: false,
              lastModified: nowTimestamp,
              updated_at: nowIso
            };
            await syncService.queueOperation('repairTickets', 'update', updatedTicket);

            const historyEntry = {
              id: crypto.randomUUID(),
              repair_ticket_id: ticket.id,
              user_id: profile.id,
              previous_status: ticket.status,
              new_status: 'completed',
              changed_by: profile.id,
              notes: `Paid in full at POS (Receipt ${receiptNumber})`,
              synced: false,
              lastModified: nowTimestamp,
              created_at: nowIso
            };
            await syncService.queueOperation('repairTicketHistory', 'insert', historyEntry);

            // Update attached parts from 'reserved' to 'consumed'
            const attachedParts = await db.repairTicketParts.where('repair_ticket_id').equals(ticket.id).toArray();
            for (const part of attachedParts) {
              if (part.status === 'reserved') {
                const updatedPart = {
                  ...part,
                  status: 'consumed' as const,
                  status_reason: `Installed & settled via POS checkout (Receipt ${receiptNumber})`,
                  status_updated_at: nowIso,
                  synced: false,
                  lastModified: nowTimestamp,
                  updated_at: nowIso
                };
                await syncService.queueOperation('repairTicketParts', 'update', updatedPart);

                const partHist = {
                  id: crypto.randomUUID(),
                  repair_ticket_part_id: part.id,
                  repair_ticket_id: ticket.id,
                  user_id: profile.id,
                  previous_status: 'reserved',
                  new_status: 'consumed',
                  reason: `Completed via POS checkout (Receipt ${receiptNumber})`,
                  changed_by: profile.id,
                  synced: false,
                  lastModified: nowTimestamp,
                  created_at: nowIso
                };
                await syncService.queueOperation('repairTicketPartHistory', 'insert', partHist);
              }
            }
          }
          return [];
        }

        if (item.variantId) {
          const variant = await db.productVariants.get(item.variantId);
          const parentId = item.productId || item.id;
          const product = await db.products.get(parentId);
          const updates = [];

          if (variant) {
            const newVariantStock = (variant.stock_quantity || 0) - item.quantity;
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

          if (product) {
            const newProductStock = (product.stock_quantity || 0) - item.quantity;
            await db.products.update(product.id, {
              stock_quantity: newProductStock,
              lastModified: Date.now(),
              synced: false
            });
            updates.push({
              table: 'products',
              data: {
                id: product.id,
                stock_quantity: newProductStock,
                lastModified: Date.now(),
                synced: false
              }
            });
          }
          return updates;
        } else if (item.productId || item.id) {
          const productIdToUse = item.productId || item.id;
          const product = await db.products.get(productIdToUse);
          if (product) {
            const newStock = (product.stock_quantity || 0) - item.quantity;
            await db.products.update(productIdToUse, {
              stock_quantity: newStock,
              lastModified: Date.now(),
              synced: false
            });

            return [{
              table: 'products',
              data: {
                id: productIdToUse,
                stock_quantity: newStock,
                lastModified: Date.now(),
                synced: false,
              }
            }];
          }
        }
        return [];
      });

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
            due_date: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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

      // 7. Handle Printing or WhatsApp dispatch
      if (action === 'print') {
        handlePrintReceipt(receiptNumber, sale).catch(err => {
          console.error("Printing failed:", err);
          toast.error("Sale saved, but printing failed.");
        });
        toast.success(`Sale completed! Printing...`);
      } else if (action === 'whatsapp') {
        sendWhatsAppReceipt(receiptPhone, receiptNumber);
        toast.success(`Sale completed! Opening WhatsApp...`);
      } else {
        toast.success(`Sale completed!`);
      }

      // 8. Close Dialog & Reset
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
    const logoSrc = settings.logo_url || defaultLogo;

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
        <h1>${settings.business_name || 'My Store'}</h1>
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
          ${settings.receipt_footer || 'Thank you for your business!'}
        </div>
        <script>
          window.onload = function() {
            var img = document.querySelector('.logo img');
            if (img && !img.complete) {
              img.onload = function() { window.print(); };
              img.onerror = function() { window.print(); };
            } else {
              window.print();
            }
          };
        </script>
      </body>
      </html>
    `;

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(receiptHTML);
      doc.close();

      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 5000);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatPrice(amount);
  };

  const quickAmounts = [total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Complete Sale</DialogTitle>
          <DialogDescription>
            Process payment, issue receipts, or send via WhatsApp
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1">
          <div className="space-y-2">
            <Label>Customer</Label>
            <Select value={selectedCustomer} onValueChange={handleCustomerChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="walk-in">Walk-in Customer</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name} {customer.phone ? `(${customer.phone})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="h-3.5 w-3.5 text-emerald-600" />
              Receipt Phone Number / WhatsApp (Optional)
            </Label>
            <Input
              type="tel"
              placeholder="e.g. 923001234567"
              value={receiptPhone}
              onChange={(e) => setReceiptPhone(e.target.value)}
            />
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
              <TabsList className="grid w-full grid-cols-4">
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

        <DialogFooter className="mt-4 pt-4 border-t bg-background flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={() => handleCompleteSale('complete')}
            disabled={isProcessing}
            variant="secondary"
            className="flex-1"
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete
          </Button>
          <Button
            onClick={() => handleCompleteSale('whatsapp')}
            disabled={isProcessing}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <MessageSquare className="mr-2 h-4 w-4" />
            WhatsApp
          </Button>
          <Button
            onClick={() => handleCompleteSale('print')}
            disabled={isProcessing}
            className="flex-1"
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

