import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, RefreshCw, Wrench, Clock, CheckCircle2, AlertCircle, Eye, Edit, Smartphone, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { db, CachedRepairTicket, RepairStatus } from "@/lib/db";
import { syncService } from "@/lib/syncService";
import { useLiveQuery } from "dexie-react-hooks";
import { RepairTicketDialog } from "@/components/repair/RepairTicketDialog";
import { RepairTicketDetailModal } from "@/components/repair/RepairTicketDetailModal";
import { TechnicianDialog } from "@/components/repair/TechnicianDialog";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

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
    } catch (error) {
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

    if (activeTab === "active") {
      return !['completed', 'cancelled'].includes(t.status);
    }
    if (activeTab === "ready") {
      return t.status === "ready_for_pickup";
    }
    if (activeTab === "completed") {
      return t.status === "completed";
    }
    if (activeTab === "cancelled") {
      return t.status === "cancelled";
    }
    return true; // "all"
  });

  const activeCount = tickets.filter(t => !['completed', 'cancelled'].includes(t.status)).length;
  const inRepairCount = tickets.filter(t => t.status === 'in_repair').length;
  const readyCount = tickets.filter(t => t.status === 'ready_for_pickup').length;
  const completedCount = tickets.filter(t => t.status === 'completed').length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Navigation />
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="h-6 w-6 text-primary" />
            Repair Ticket Management
          </h1>
        </div>
      </header>

      <div className="flex flex-1">
        <Navigation />
        <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
          {/* Quick Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Active Repairs</p>
                  <p className="text-2xl font-bold text-primary">{activeCount}</p>
                </div>
                <Clock className="h-8 w-8 text-primary/30" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">In Repair Bench</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{inRepairCount}</p>
                </div>
                <Wrench className="h-8 w-8 text-purple-500/30" />
              </CardContent>
            </Card>

            <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200">
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium uppercase">Ready for Pickup</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{readyCount}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500/40" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Completed Jobs</p>
                  <p className="text-2xl font-bold">{completedCount}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-muted-foreground/20" />
              </CardContent>
            </Card>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search ticket #, IMEI, customer, device..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={() => setTechDialogOpen(true)}>
                <UserCheck className="mr-2 h-4 w-4 text-primary" />
                Add Tech
              </Button>
              <Button variant="outline" onClick={handleSync} disabled={isSyncing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync"}
              </Button>
              <Button onClick={() => { setEditingTicket(null); setCreateDialogOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Log Repair Job
              </Button>
            </div>
          </div>

          {/* Tabs & Ticket List */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
              <TabsTrigger value="ready">Ready for Pickup ({readyCount})</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
              <TabsTrigger value="all">All Tickets ({tickets.length})</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              <Card>
                <CardContent className="pt-6">
                  {filteredTickets.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground space-y-2">
                      <Wrench className="h-10 w-10 mx-auto text-muted-foreground/30" />
                      <p className="font-semibold">No repair tickets found</p>
                      <p className="text-xs">Click "Log Repair Job" to create a new ticket.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticket #</TableHead>
                          <TableHead>Device & IMEI</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Issue Summary</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Est. Cost</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTickets.map((ticket) => (
                          <TableRow key={ticket.id}>
                            <TableCell className="font-mono font-bold text-primary">
                              {ticket.ticket_number}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{ticket.device_name}</div>
                              {ticket.serial_or_imei && (
                                <div className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                                  <Smartphone className="h-3 w-3" /> {ticket.serial_or_imei}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {ticket.customer ? (
                                <div>
                                  <div className="font-medium">{ticket.customer.name}</div>
                                  <div className="text-xs text-muted-foreground">{ticket.customer.phone || 'No phone'}</div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground italic text-xs">Walk-in</span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-xs">
                              {ticket.issue_description}
                            </TableCell>
                            <TableCell>
                              <Badge className={`${statusColorMap[ticket.status]} border-none capitalize`}>
                                {ticket.status.replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-semibold text-sm">
                              {formatPrice(ticket.estimated_cost || 0)}
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setSelectedTicket(ticket); setDetailModalOpen(true); }}
                              >
                                <Eye className="h-4 w-4 mr-1" /> View
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setEditingTicket(ticket); setCreateDialogOpen(true); }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
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
