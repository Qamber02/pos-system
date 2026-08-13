import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DollarSign, RotateCcw, AlertTriangle, CreditCard, Banknote, Gift } from "lucide-react";
import { db, CachedRepairTicket, CachedRefund } from "@/lib/db";
import { syncService } from "@/lib/syncService";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface RepairRefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: CachedRepairTicket;
  maxRefundableAmount: number;
}

export const RepairRefundDialog = ({
  open,
  onOpenChange,
  ticket,
  maxRefundableAmount
}: RepairRefundDialogProps) => {
  const formatCurrency = useFormatCurrency();
  const [amount, setAmount] = useState<string>(ticket.deposit_paid ? String(ticket.deposit_paid) : "0");
  const [refundType, setRefundType] = useState<'service' | 'product' | 'deposit'>("deposit");
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'store_credit' | 'other'>("cash");
  const [reason, setReason] = useState<string>("");
  const [restockItem, setRestockItem] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);

  const handleProcessRefund = async () => {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast.error("Enter a valid refund amount greater than 0");
      return;
    }

    if (!reason.trim()) {
      toast.error("Please specify a reason for this refund");
      return;
    }

    setLoading(true);
    try {
      let activeUserId = "d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0";
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) activeUserId = user.id;
      } catch {
        // Fallback
      }

      const nowIso = new Date().toISOString();
      const nowTimestamp = Date.now();
      const refundNum = `RFD-${ticket.ticket_number}-${Date.now().toString().slice(-4)}`;

      // 1. Create Refund Record
      const refundRecord: CachedRefund = {
        id: crypto.randomUUID(),
        user_id: activeUserId,
        repair_ticket_id: ticket.id,
        refund_number: refundNum,
        amount: numericAmount,
        refund_type: refundType,
        payment_method: paymentMethod,
        reason: reason.trim(),
        restock_item: restockItem,
        processed_by: activeUserId,
        synced: false,
        lastModified: nowTimestamp,
        created_at: nowIso
      };

      await syncService.queueOperation('refunds', 'insert', refundRecord);

      // 2. If it's a deposit refund, update deposit_paid on ticket
      if (refundType === 'deposit') {
        const updatedTicket: CachedRepairTicket = {
          ...ticket,
          deposit_paid: Math.max(0, (ticket.deposit_paid || 0) - numericAmount),
          synced: false,
          lastModified: nowTimestamp,
          updated_at: nowIso
        };
        await syncService.queueOperation('repairTickets', 'update', updatedTicket);
      }

      // 3. Log into ticket history audit
      const historyEntry = {
        id: crypto.randomUUID(),
        repair_ticket_id: ticket.id,
        user_id: activeUserId,
        previous_status: ticket.status,
        new_status: ticket.status,
        notes: `Refund Processed (${refundNum}): ${formatCurrency(numericAmount)} via ${paymentMethod.toUpperCase()} — Reason: ${reason.trim()}`,
        synced: false,
        lastModified: nowTimestamp,
        created_at: nowIso
      };
      await syncService.queueOperation('repairTicketHistory', 'insert', historyEntry);

      toast.success(`Refund of ${formatCurrency(numericAmount)} processed (${refundNum})`);
      onOpenChange(false);
      setReason("");
    } catch (error: any) {
      toast.error(error.message || "Failed to process refund");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2 text-destructive">
            <RotateCcw className="h-5 w-5" />
            Process Repair Refund
          </DialogTitle>
          <DialogDescription className="text-xs">
            Issue a full or partial refund against Repair Ticket <span className="font-bold text-foreground">{ticket.ticket_number}</span> ({ticket.device_name}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Refund Type */}
          <div className="space-y-1">
            <Label className="text-xs">Refund Category</Label>
            <Select value={refundType} onValueChange={(val: any) => setRefundType(val)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deposit">Deposit Refund (Return customer deposit)</SelectItem>
                <SelectItem value="service">Labor / Service Refund (Money back, no stock affected)</SelectItem>
                <SelectItem value="product">Attached Part / Item Return (Product refund)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Amount */}
            <div className="space-y-1">
              <Label className="text-xs">Refund Amount ({formatCurrency(maxRefundableAmount)} Max)</Label>
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="pl-8 h-8 text-xs font-semibold"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-1">
              <Label className="text-xs">Refund Method</Label>
              <Select value={paymentMethod} onValueChange={(val: any) => setPaymentMethod(val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card / POS Terminal</SelectItem>
                  <SelectItem value="store_credit">Store Credit</SelectItem>
                  <SelectItem value="other">Other / Digital Wallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Restock checkbox for product returns */}
          {refundType === 'product' && (
            <div className="flex items-center space-x-2 bg-muted/40 p-2.5 rounded border">
              <Checkbox
                id="restock"
                checked={restockItem}
                onCheckedChange={(checked) => setRestockItem(checked as boolean)}
              />
              <Label htmlFor="restock" className="text-xs font-medium cursor-pointer">
                Physically restock returned item back to inventory
              </Label>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1">
            <Label className="text-xs">Refund Reason (Required)</Label>
            <Textarea
              placeholder="e.g. Customer cancelled repair, Unfixable motherboard, Defective screen..."
              className="text-xs min-h-[60px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleProcessRefund}
            disabled={loading}
          >
            {loading ? "Processing..." : "Issue Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
