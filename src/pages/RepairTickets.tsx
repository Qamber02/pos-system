import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, RefreshCw, Wrench, Clock, CheckCircle2, AlertCircle, Eye, Edit, Smartphone, DollarSign, Cpu, Code, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { db, CachedRepairTicket, RepairStatus } from "@/lib/db";
import { syncService } from "@/lib/syncService";
import { useLiveQuery } from "dexie-react-hooks";
import { RepairTicketDialog } from "@/components/repair/RepairTicketDialog";
import { RepairTicketDetailModal } from "@/components/repair/RepairTicketDetailModal";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

const statusColorMap: Record<RepairStatus, { label: string; className: string }> = {
  received: { label: "Received", className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800" },
  diagnosing: { label: "Diagnosing", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" },
  awaiting_approval: { label: "Awaiting Approval", className: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800" },
  approved: { label: "Approved", className: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800" },
  declined: { label: "Declined", className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800" },
  awaiting_parts: { label: "Awaiting Parts", className: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800" },
  in_repair: { label: "In Repair", className: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800" },
  qc_testing: { label: "QC / Testing", className: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800" },
  ready_for_pickup: { label: "Ready for Pickup", className: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 font-bold" },
  completed: { label: "Completed", className: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
  cancelled: { label: "Cancelled", className: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 line-through" },
};

const RepairTickets = () => {
  const navigate = useNavigate();
  const formatPrice = useFormatCurrency();
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("active");
  const [typeFilter, setTypeFilter] = useState<'all' | 'hardware' | 'software'>('all');

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<CachedRepairTicket | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<CachedRepairTicket | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState<CachedRepairTicket | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Live queries from local Dexie IndexedDB
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const deviceIdentifiers = useLiveQuery(() => db.deviceIdentifiers.toArray()) || [];
  const history = useLiveQuery(() => db.repairTicketHistory.toArray()) || [];

  const tickets = useLiveQuery(async () => {
    const list = await db.repairTickets.toArray();
    const custs = await db.customers.toArray();
    const custMap = new Map(custs.map(c => [c.id, c]));

    return list.map(t => ({
      ...t,
      customer: t.customer_id ? custMap.get(t.customer_id) : undefined
    })).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }) || [];

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncService.syncAll(true);
      toast.success("Sync completed");
    } catch {
      toast.error("Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  const confirmDeleteTicket = (ticket: CachedRepairTicket) => {
    setTicketToDelete(ticket);
    setDeleteConfirmOpen(true);
  };

  const executeDeleteTicket = async () => {
    if (!ticketToDelete) return;
    setDeleting(true);
    try {
      const ticketId = ticketToDelete.id;

      // 1. Delete parts and part history
      const parts = await db.repairTicketParts.where('repair_ticket_id').equals(ticketId).toArray();
      for (const part of parts) {
        await syncService.queueOperation('repairTicketParts', 'delete', { id: part.id });
      }
      await db.repairTicketParts.where('repair_ticket_id').equals(ticketId).delete();

      const partHistories = await db.repairTicketPartHistory.where('repair_ticket_id').equals(ticketId).toArray();
      for (const ph of partHistories) {
        await syncService.queueOperation('repairTicketPartHistory', 'delete', { id: ph.id });
      }
      await db.repairTicketPartHistory.where('repair_ticket_id').equals(ticketId).delete();

      // 2. Delete ticket history
      const histories = await db.repairTicketHistory.where('repair_ticket_id').equals(ticketId).toArray();
      for (const h of histories) {
        await syncService.queueOperation('repairTicketHistory', 'delete', { id: h.id });
      }
      await db.repairTicketHistory.where('repair_ticket_id').equals(ticketId).delete();

      // 3. Delete any refunds associated with this ticket
      const ticketRefunds = await db.refunds.where('repair_ticket_id').equals(ticketId).toArray();
      for (const r of ticketRefunds) {
        await syncService.queueOperation('refunds', 'delete', { id: r.id });
      }
      await db.refunds.where('repair_ticket_id').equals(ticketId).delete();

      // 4. Delete wholesaler intakes and payments associated with this ticket if any
      const intakes = await db.wholesalerIntakes.toArray();
      const ticketIntakes = intakes.filter(i => (i.notes && (i.notes.includes(ticketToDelete.ticket_number) || i.notes.includes(ticketId.slice(0, 8)))) || (i.item_name && i.item_name.includes(ticketToDelete.ticket_number)));
      for (const intake of ticketIntakes) {
        await syncService.queueOperation('wholesalerIntakes', 'delete', { id: intake.id });
        await db.wholesalerIntakes.delete(intake.id);
        if (navigator.onLine) {
          try {
            await (supabase as any).from('wholesaler_intakes').delete().eq('id', intake.id);
          } catch { /* sync will retry */ }
        }
      }

      const payments = await db.wholesalerPayments.toArray();
      const ticketPayments = payments.filter(p => p.notes && (p.notes.includes(ticketToDelete.ticket_number) || p.notes.includes(ticketId.slice(0, 8))));
      for (const payment of ticketPayments) {
        await syncService.queueOperation('wholesalerPayments', 'delete', { id: payment.id });
        await db.wholesalerPayments.delete(payment.id);
        if (navigator.onLine) {
          try {
            await (supabase as any).from('wholesaler_payments').delete().eq('id', payment.id);
          } catch { /* sync will retry */ }
        }
      }

      // 5. Delete the ticket itself
      await syncService.queueOperation('repairTickets', 'delete', { id: ticketId });
      await db.repairTickets.delete(ticketId);

      // 6. Direct Cloud delete if online (with proper Supabase table names & casting)
      if (navigator.onLine) {
        try {
          await (supabase as any).from('repair_ticket_part_history').delete().eq('repair_ticket_id', ticketId);
          await (supabase as any).from('repair_ticket_parts').delete().eq('repair_ticket_id', ticketId);
          await (supabase as any).from('repair_ticket_status_history').delete().eq('repair_ticket_id', ticketId);
          await (supabase as any).from('refunds').delete().eq('repair_ticket_id', ticketId);
          await (supabase as any).from('repair_tickets').delete().eq('id', ticketId);
        } catch (cloudErr) {
          console.warn('Cloud delete error (sync queue will retry):', cloudErr);
        }
      }

      toast.success(`Repair ticket #${ticketToDelete.ticket_number} (${ticketToDelete.device_name}) deleted permanently`);
      setDeleteConfirmOpen(false);
      setDetailModalOpen(false);
      setTicketToDelete(null);
    } catch (error: any) {
      console.error('Failed to delete repair ticket:', error);
      toast.error(error.message || 'Failed to delete repair ticket');
    } finally {
      setDeleting(false);
    }
  };

  const filteredTickets = tickets.filter(t => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      t.ticket_number.toLowerCase().includes(query) ||
      t.device_name.toLowerCase().includes(query) ||
      (t.serial_or_imei && t.serial_or_imei.toLowerCase().includes(query)) ||
      (t.customer?.name && t.customer.name.toLowerCase().includes(query)) ||
      (t.customer?.phone && t.customer.phone.toLowerCase().includes(query));

    if (!matchesSearch) return false;

    if (typeFilter !== 'all') {
      const ticketType = t.repair_type || 'hardware';
      if (ticketType !== typeFilter) return false;
    }

    if (activeTab === "active") return !['completed', 'cancelled'].includes(t.status);
    if (activeTab === "ready") return t.status === "ready_for_pickup";
    if (activeTab === "completed") return t.status === "completed";
    if (activeTab === "cancelled") return t.status === "cancelled";
    return true; // "all"
  });

  const activeCount = tickets.filter(t => !['completed', 'cancelled'].includes(t.status)).length;
  const hardwareActiveCount = tickets.filter(t => !['completed', 'cancelled'].includes(t.status) && (t.repair_type === 'hardware' || !t.repair_type)).length;
  const softwareActiveCount = tickets.filter(t => !['completed', 'cancelled'].includes(t.status) && t.repair_type === 'software').length;
  const readyCount = tickets.filter(t => t.status === 'ready_for_pickup').length;
  const completedCount = tickets.filter(t => t.status === 'completed').length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/80 backdrop-blur-md shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 pl-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" />
                Repair Job Management
              </h1>
              <p className="text-xs text-muted-foreground">Track intake, parts, warranty, and stage progress</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={handleSync} disabled={isSyncing}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync"}
            </Button>
            <Button size="sm" className="h-9 text-xs font-semibold shadow-sm" onClick={() => { setEditingTicket(null); setCreateDialogOpen(true); }}>
              <Plus className="mr-1.5 h-4 w-4" /> Log Repair Job
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <Navigation />
        <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
          {/* Executive Glanceable Stats Banner */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-primary/20 shadow-sm">
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Active Repair Jobs</p>
                  <p className="text-2xl font-extrabold text-foreground mt-0.5">{activeCount}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Wrench className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200/80 dark:border-blue-900/40 shadow-sm">
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Hardware Repairs</p>
                  <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">{hardwareActiveCount}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                  <Cpu className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-indigo-200/80 dark:border-indigo-900/40 shadow-sm">
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Software Services</p>
                  <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">{softwareActiveCount}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                  <Code className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 shadow-sm">
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold uppercase tracking-wider">Ready for Pickup</p>
                  <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">{readyCount}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search ticket #, IMEI, customer, phone, device..."
                className="pl-9 text-xs h-9 bg-card shadow-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Type Filter Tabs: All vs Hardware vs Software */}
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  typeFilter === 'all'
                    ? 'bg-background shadow-xs text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All Jobs
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('hardware')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                  typeFilter === 'hardware'
                    ? 'bg-blue-500 text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Cpu className="h-3.5 w-3.5" /> Hardware
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('software')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                  typeFilter === 'software'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Code className="h-3.5 w-3.5" /> Software
              </button>
            </div>
          </div>

          {/* Status Tabs & Job List Table */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="bg-card border shadow-2xs">
              <TabsTrigger value="active" className="text-xs">Active ({activeCount})</TabsTrigger>
              <TabsTrigger value="ready" className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Ready for Pickup ({readyCount})</TabsTrigger>
              <TabsTrigger value="completed" className="text-xs">Completed ({completedCount})</TabsTrigger>
              <TabsTrigger value="cancelled" className="text-xs">Cancelled</TabsTrigger>
              <TabsTrigger value="all" className="text-xs">All History ({tickets.length})</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              <Card className="border shadow-2xs overflow-hidden">
                <CardContent className="p-0">
                  {filteredTickets.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-xs">
                      No repair jobs found matching this criteria.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="text-xs font-bold py-3">Ticket #</TableHead>
                          <TableHead className="text-xs font-bold py-3">Device & IMEI</TableHead>
                          <TableHead className="text-xs font-bold py-3">Customer</TableHead>
                          <TableHead className="text-xs font-bold py-3">Reported Issue</TableHead>
                          <TableHead className="text-xs font-bold py-3">Stage Status</TableHead>
                          <TableHead className="text-xs font-bold py-3 text-right">Repair Cost & Deposit</TableHead>
                          <TableHead className="text-xs font-bold py-3 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTickets.map((ticket) => {
                          const statusConfig = statusColorMap[ticket.status] || { label: ticket.status, className: "bg-gray-100 text-gray-800" };

                          return (
                            <TableRow key={ticket.id} className="hover:bg-muted/20 transition-colors">
                              <TableCell className="font-mono font-bold text-primary text-xs">
                                <div>{ticket.ticket_number}</div>
                                <Badge variant="outline" className={`mt-1 text-[9px] px-1.5 py-0 inline-flex items-center gap-1 font-semibold ${
                                  ticket.repair_type === 'software'
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800'
                                    : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800'
                                }`}>
                                  {ticket.repair_type === 'software' ? <Code className="h-2.5 w-2.5 text-indigo-600" /> : <Cpu className="h-2.5 w-2.5 text-blue-600" />}
                                  {ticket.repair_type === 'software' ? 'Software' : 'Hardware'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="font-semibold text-xs text-foreground">{ticket.device_name}</div>
                                {ticket.serial_or_imei && (
                                  <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1 mt-0.5">
                                    <Smartphone className="h-3 w-3 text-muted-foreground/70" /> {ticket.serial_or_imei}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                {ticket.customer ? (
                                  <div>
                                    <div className="font-medium text-xs text-foreground">{ticket.customer.name}</div>
                                    <div className="text-[11px] text-muted-foreground">{ticket.customer.phone || 'No phone'}</div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground italic text-xs">Walk-in Customer</span>
                                )}
                              </TableCell>
                              <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                                {ticket.issue_description}
                              </TableCell>
                              <TableCell>
                                <Badge className={`${statusConfig.className} text-[11px] px-2 py-0.5 border font-medium capitalize shadow-2xs`}>
                                  {statusConfig.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="font-bold text-xs text-foreground">{formatPrice(ticket.estimated_cost || 0)}</div>
                                {(ticket.deposit_paid || 0) > 0 && (
                                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                    Paid: {formatPrice(ticket.deposit_paid || 0)}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right space-x-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2.5"
                                  onClick={() => { setSelectedTicket(ticket); setDetailModalOpen(true); }}
                                >
                                  <Eye className="h-3.5 w-3.5 mr-1" /> View
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => { setEditingTicket(ticket); setCreateDialogOpen(true); }}
                                  title="Edit Ticket"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs text-destructive hover:bg-destructive/10 border-destructive/30 px-2"
                                  onClick={() => confirmDeleteTicket(ticket)}
                                  title="Delete Repair Ticket"
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {/* Repair Ticket Creation / Edit Dialog */}
      <RepairTicketDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        customers={customers}
        deviceIdentifiers={deviceIdentifiers}
        ticketToEdit={editingTicket}
      />

      {/* Repair Ticket Detail & Workflow Audit Modal */}
      <RepairTicketDetailModal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        ticket={selectedTicket}
        history={history}
        customer={selectedTicket?.customer}
        onDeleteTicket={confirmDeleteTicket}
      />

      {/* Delete Repair Ticket Confirmation Alert Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Delete Repair Job?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-xs">
              <p>
                Are you sure you want to permanently delete ticket{" "}
                <strong className="text-foreground">#{ticketToDelete?.ticket_number}</strong> ({ticketToDelete?.device_name})?
              </p>
              <p className="text-destructive font-medium">
                This will delete the repair job, attached parts, part audit history, status workflow history, and any linked wholesaler intake records from both local offline database and cloud storage.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={(e) => {
                e.preventDefault();
                executeDeleteTicket();
              }}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Confirm & Delete Repair Job"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RepairTickets;
