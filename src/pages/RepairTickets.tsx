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
import { Plus, Search, RefreshCw, Wrench, Clock, CheckCircle2, AlertCircle, Eye, Edit, Smartphone, UserCheck, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { db, CachedRepairTicket, RepairStatus } from "@/lib/db";
import { syncService } from "@/lib/syncService";
import { useLiveQuery } from "dexie-react-hooks";
import { RepairTicketDialog } from "@/components/repair/RepairTicketDialog";
import { RepairTicketDetailModal } from "@/components/repair/RepairTicketDetailModal";
import { TechnicianDialog } from "@/components/repair/TechnicianDialog";
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

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [techDialogOpen, setTechDialogOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<CachedRepairTicket | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<CachedRepairTicket | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Live queries from local Dexie IndexedDB
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const deviceIdentifiers = useLiveQuery(() => db.deviceIdentifiers.toArray()) || [];
  const technicians = useLiveQuery(() => db.technicians.toArray()) || [];
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

  const filteredTickets = tickets.filter(t => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      t.ticket_number.toLowerCase().includes(query) ||
      t.device_name.toLowerCase().includes(query) ||
      (t.serial_or_imei && t.serial_or_imei.toLowerCase().includes(query)) ||
      (t.customer?.name && t.customer.name.toLowerCase().includes(query));

    if (!matchesSearch) return false;

    if (activeTab === "active") return !['completed', 'cancelled'].includes(t.status);
    if (activeTab === "ready") return t.status === "ready_for_pickup";
    if (activeTab === "completed") return t.status === "completed";
    if (activeTab === "cancelled") return t.status === "cancelled";
    return true; // "all"
  });

  const activeCount = tickets.filter(t => !['completed', 'cancelled'].includes(t.status)).length;
  const inRepairCount = tickets.filter(t => t.status === 'in_repair').length;
  const readyCount = tickets.filter(t => t.status === 'ready_for_pickup').length;
  const completedCount = tickets.filter(t => t.status === 'completed').length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Navigation />
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" />
                Repair Job Management
              </h1>
              <p className="text-xs text-muted-foreground">Track intake, parts, technician assignment, and stage progress</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setTechDialogOpen(true)}>
              <UserCheck className="mr-1.5 h-3.5 w-3.5 text-primary" /> Technicians
            </Button>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-zinc-200/80 dark:border-zinc-800 shadow-sm">
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Active Repairs</p>
                  <p className="text-2xl font-extrabold text-primary mt-0.5">{activeCount}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Clock className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-purple-200/80 dark:border-purple-900/40 shadow-sm">
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">On Bench</p>
                  <p className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-0.5">{inRepairCount}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500">
                  <Wrench className="h-5 w-5" />
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

            <Card className="border-zinc-200/80 dark:border-zinc-800 shadow-sm">
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Completed Jobs</p>
                  <p className="text-2xl font-extrabold text-foreground mt-0.5">{completedCount}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
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
                placeholder="Search ticket #, IMEI, customer, device..."
                className="pl-9 text-xs h-9 bg-card shadow-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Tabs & Ticket List */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="bg-card border shadow-xs h-10 p-1">
              <TabsTrigger value="active" className="text-xs px-3 py-1">Active ({activeCount})</TabsTrigger>
              <TabsTrigger value="ready" className="text-xs px-3 py-1">Ready ({readyCount})</TabsTrigger>
              <TabsTrigger value="completed" className="text-xs px-3 py-1">Completed ({completedCount})</TabsTrigger>
              <TabsTrigger value="cancelled" className="text-xs px-3 py-1">Cancelled</TabsTrigger>
              <TabsTrigger value="all" className="text-xs px-3 py-1">All ({tickets.length})</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              <Card className="border-zinc-200/80 dark:border-zinc-800 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  {filteredTickets.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground space-y-2">
                      <Wrench className="h-10 w-10 mx-auto text-muted-foreground/30" />
                      <p className="font-semibold text-sm">No repair tickets found</p>
                      <p className="text-xs">Click "Log Repair Job" to create a new ticket.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="text-xs font-bold py-3">Ticket #</TableHead>
                          <TableHead className="text-xs font-bold py-3">Device & SN / IMEI</TableHead>
                          <TableHead className="text-xs font-bold py-3">Customer</TableHead>
                          <TableHead className="text-xs font-bold py-3">Reported Issue</TableHead>
                          <TableHead className="text-xs font-bold py-3">Stage Status</TableHead>
                          <TableHead className="text-xs font-bold py-3 text-right">Estimate & Deposit</TableHead>
                          <TableHead className="text-xs font-bold py-3 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTickets.map((ticket) => {
                          const statusConfig = statusColorMap[ticket.status] || { label: ticket.status, className: "bg-gray-100 text-gray-800" };

                          return (
                            <TableRow key={ticket.id} className="hover:bg-muted/20 transition-colors">
                              <TableCell className="font-mono font-bold text-primary text-xs">
                                {ticket.ticket_number}
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
                                >
                                  <Edit className="h-3.5 w-3.5" />
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
        technicians={technicians}
      />

      {/* Technician Registration Dialog */}
      <TechnicianDialog
        open={techDialogOpen}
        onOpenChange={setTechDialogOpen}
      />
    </div>
  );
};

export default RepairTickets;
