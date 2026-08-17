import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Smartphone, User, DollarSign, ArrowRight, CheckCircle2, AlertCircle, Wrench, ShieldAlert, Cpu, Code, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { syncService } from "@/lib/syncService";
import { db, CachedCustomer, CachedRepairTicket, CachedRepairTicketHistory, RepairStatus } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { TicketPartsManager } from "@/components/repair/TicketPartsManager";
import { RepairRefundDialog } from "@/components/repair/RepairRefundDialog";

interface RepairTicketDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: CachedRepairTicket | null;
  history: CachedRepairTicketHistory[];
  customer?: CachedCustomer | null;
  onDeleteTicket?: (ticket: CachedRepairTicket) => void;
}

const statusColorMap: Record<RepairStatus, string> = {
  received: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  diagnosing: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  awaiting_approval: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  approved: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  declined: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  awaiting_parts: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  in_repair: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  qc_testing: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  ready_for_pickup: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-bold",
  completed: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
  cancelled: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 line-through",
};

const allStatuses: { value: RepairStatus; label: string }[] = [
  { value: 'received', label: 'Received' },
  { value: 'diagnosing', label: 'Diagnosing' },
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'awaiting_parts', label: 'Awaiting Parts' },
  { value: 'in_repair', label: 'In Repair' },
  { value: 'qc_testing', label: 'QC / Testing' },
  { value: 'ready_for_pickup', label: 'Ready for Pickup' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const RepairTicketDetailModal = ({
  open,
  onOpenChange,
  ticket,
  history,
  customer,
  onDeleteTicket
}: RepairTicketDetailModalProps) => {
  const formatCurrency = useFormatCurrency();
  const [updating, setUpdating] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);

  const partHistory = useLiveQuery(async () => {
    if (!ticket?.id) return [];
    return await db.repairTicketPartHistory
      .where('repair_ticket_id')
      .equals(ticket.id)
      .toArray();
  }, [ticket?.id]) || [];

  const attachedItems = useLiveQuery(async () => {
    if (!ticket?.id) return [];
    return await db.repairTicketParts
      .where('repair_ticket_id')
      .equals(ticket.id)
      .toArray();
  }, [ticket?.id]) || [];

  const refunds = useLiveQuery(async () => {
    if (!ticket?.id) return [];
    return await db.refunds
      .where('repair_ticket_id')
      .equals(ticket.id)
      .toArray();
  }, [ticket?.id]) || [];

  if (!ticket) return null;

  const activeItemsTotal = attachedItems
    .filter(item => !['returned', 'broken', 'returned_to_supplier'].includes(item.status))
    .reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

  const totalPartCost = attachedItems
    .filter(item => !['returned', 'broken', 'returned_to_supplier'].includes(item.status))
    .reduce((sum, item) => sum + ((item.unit_cost || 0) * item.quantity), 0);

  const totalRefundedSum = refunds.reduce((sum, r) => sum + r.amount, 0);
  const grandTotalInvoice = Math.max(ticket.estimated_cost || 0, activeItemsTotal > 0 ? (ticket.estimated_cost || 0) : (ticket.estimated_cost || 0)) + activeItemsTotal;
  const netProfit = grandTotalInvoice - totalPartCost;
  const balanceRemaining = Math.max(0, grandTotalInvoice - (ticket.deposit_paid || 0));

  const combinedAuditLogs = [
    ...history
      .filter(h => h.repair_ticket_id === ticket.id)
      .map(h => ({
        id: h.id,
        type: 'ticket' as const,
        title: h.previous_status ? `Status: ${h.previous_status.replace('_', ' ')} → ${h.new_status.replace('_', ' ')}` : `Status: ${h.new_status.replace('_', ' ')}`,
        notes: h.notes,
        created_at: h.created_at || new Date().toISOString()
      })),
    ...partHistory.map(ph => ({
      id: ph.id,
      type: 'part' as const,
      title: ph.previous_status ? `Part: ${ph.previous_status} → ${ph.new_status}` : `Part: ${ph.new_status}`,
      notes: ph.reason,
      created_at: ph.created_at || new Date().toISOString()
    }))
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());



  const handleStatusChange = async (newStatus: RepairStatus) => {
    if (newStatus === ticket.status) return;

    setUpdating(true);
    try {
      let activeUserId = "d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0";
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) activeUserId = user.id;
      } catch {
        // Fallback to default
      }

      const nowIso = new Date().toISOString();
      const nowTimestamp = Date.now();

      // Update ticket status
      const updatedTicket: CachedRepairTicket = {
        ...ticket,
        status: newStatus,
        synced: false,
        lastModified: nowTimestamp,
        updated_at: nowIso
      };

      await syncService.queueOperation('repairTickets', 'update', updatedTicket);

      // Create history audit entry
      const historyEntry: CachedRepairTicketHistory = {
        id: crypto.randomUUID(),
        repair_ticket_id: ticket.id,
        user_id: activeUserId,
        previous_status: ticket.status,
        new_status: newStatus,
        changed_by: activeUserId,
        notes: statusNote.trim() || `Moved to ${newStatus.replace('_', ' ')}`,
        synced: false,
        lastModified: nowTimestamp,
        created_at: nowIso
      };

      await syncService.queueOperation('repairTicketHistory', 'insert', historyEntry);
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
      setStatusNote("");
    } catch (error: any) {
      toast.error(error.message || "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-xl flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" />
                Ticket {ticket.ticket_number}
              </DialogTitle>
              <DialogDescription>
                Created on {new Date(ticket.created_at || Date.now()).toLocaleDateString()}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-xs px-2.5 py-1 flex items-center gap-1.5 font-semibold ${
                ticket.repair_type === 'software'
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800'
                  : 'bg-primary/10 text-primary border-primary/30'
              }`}>
                {ticket.repair_type === 'software' ? <Code className="h-3.5 w-3.5 text-indigo-600" /> : <Cpu className="h-3.5 w-3.5 text-primary" />}
                {ticket.repair_type === 'software' ? 'Software Service' : 'Hardware Repair'}
              </Badge>
              <Badge className={`${statusColorMap[ticket.status]} text-sm px-3 py-1 border-none capitalize`}>
                {ticket.status.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4 py-2">
          {/* Left Column: Device & Customer Details */}
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground border-b pb-2">
                  <Smartphone className="h-4 w-4" /> Device Information
                </div>
                <div>
                  <p className="text-base font-semibold">{ticket.device_name}</p>
                  {ticket.serial_or_imei && (
                    <p className="text-xs font-mono text-muted-foreground">IMEI/SN: {ticket.serial_or_imei}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Reported Problem</Label>
                  <p className="text-sm bg-muted/30 p-2 rounded mt-1">{ticket.issue_description}</p>
                </div>
                {ticket.notes && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <p className="text-xs text-muted-foreground italic mt-0.5">{ticket.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground border-b pb-2">
                  <span className="flex items-center gap-2"><User className="h-4 w-4" /> Customer Information</span>
                  <span className="flex items-center gap-2"><DollarSign className="h-4 w-4" /> Financials</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="font-medium">{customer ? customer.name : 'Walk-in Customer'}</p>
                    {customer?.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
                    {customer?.email && <p className="text-xs text-muted-foreground">{customer.email}</p>}
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-xs font-bold text-primary">Total Customer Charge: <span>{formatCurrency(grandTotalInvoice)}</span></p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">Wholesaler Part Cost: <span>-{formatCurrency(totalPartCost)}</span></p>
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Net Shop Repair Profit: <span>{formatCurrency(netProfit)}</span></p>
                    <div className="border-t pt-1 mt-1">
                      <p className="text-xs text-muted-foreground">Deposit Paid: <span className="font-medium text-emerald-600">-{formatCurrency(ticket.deposit_paid || 0)}</span></p>
                      {totalRefundedSum > 0 && (
                        <p className="text-xs text-muted-foreground">Refunded: <span className="font-medium text-destructive">-{formatCurrency(totalRefundedSum)}</span></p>
                      )}
                      <p className="text-xs font-bold text-foreground mt-0.5">Balance Due: <span className={balanceRemaining > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600"}>{formatCurrency(balanceRemaining)}</span></p>
                    </div>

                    <div className="pt-2 space-y-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10 border-destructive/30 w-full"
                        onClick={() => setRefundDialogOpen(true)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Process Refund
                      </Button>
                      {onDeleteTicket && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:bg-destructive hover:text-white border-destructive/40 w-full"
                          onClick={() => onDeleteTicket(ticket)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Delete Repair Job
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Status Workflow Actions */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Update Workflow Status</Label>
                <div className="grid grid-cols-2 gap-2">
                  {allStatuses.map((s) => (
                    <Button
                      key={s.value}
                      variant={ticket.status === s.value ? "default" : "outline"}
                      size="sm"
                      className="justify-start text-xs h-8"
                      disabled={updating}
                      onClick={() => handleStatusChange(s.value)}
                    >
                      {ticket.status === s.value && <CheckCircle2 className="h-3 w-3 mr-1.5 text-green-400" />}
                      {s.label}
                    </Button>
                  ))}
                </div>
                <div className="pt-2">
                  <Input
                    placeholder="Status update note (optional)"
                    className="text-xs h-8"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Consumable Parts & Status History Audit Log */}
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4">
                <TicketPartsManager ticketId={ticket.id} />
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardContent className="pt-4 flex-1 flex flex-col">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground border-b pb-2 mb-3">
                  <Clock className="h-4 w-4" /> Workflow Audit History Log
                </div>

                <div className="flex-1 overflow-y-auto max-h-[400px] space-y-3 pr-2">
                  {combinedAuditLogs.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-6">
                      No status history recorded yet.
                    </div>
                  ) : (
                    combinedAuditLogs.map((log) => (
                      <div key={log.id} className={`text-xs border-l-2 pl-3 py-1 space-y-1 ${log.type === 'part' ? 'border-amber-500' : 'border-primary/50'}`}>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="font-semibold text-foreground capitalize flex items-center gap-1.5">
                            {log.type === 'part' && <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-400 text-amber-600">Part</Badge>}
                            {log.title}
                          </span>
                          <span className="text-[10px]">
                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {log.notes && <p className="text-muted-foreground bg-muted/20 p-1.5 rounded">{log.notes}</p>}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>

      <RepairRefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        ticket={ticket}
        maxRefundableAmount={grandTotalInvoice}
      />
    </Dialog>
  );
};
