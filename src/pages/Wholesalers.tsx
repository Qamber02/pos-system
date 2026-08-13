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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Truck, Plus, Search, DollarSign, CreditCard, RefreshCw, Layers, Phone, User, Package, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { db, CachedWholesaler, CachedWholesalerIntake, CachedWholesalerPayment, CachedProduct } from "@/lib/db";
import { syncService } from "@/lib/syncService";
import { useLiveQuery } from "dexie-react-hooks";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

const Wholesalers = () => {
  const navigate = useNavigate();
  const formatCurrency = useFormatCurrency();

  const [activeTab, setActiveTab] = useState<string>("wholesalers");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  // Dialog States
  const [addWholesalerOpen, setAddWholesalerOpen] = useState(false);
  const [logIntakeOpen, setLogIntakeOpen] = useState(false);
  const [logPaymentOpen, setLogPaymentOpen] = useState(false);
  const [selectedWholesalerId, setSelectedWholesalerId] = useState<string>("");
  const [selectedIntakeId, setSelectedIntakeId] = useState<string>("");

  // Form States
  const [wName, setWName] = useState("");
  const [wContact, setWContact] = useState("");
  const [wPhone, setWPhone] = useState("");
  const [wNotes, setWNotes] = useState("");

  const [iWholesalerId, setIWholesalerId] = useState("");
  const [iItemName, setIItemName] = useState("");
  const [iProductId, setIProductId] = useState("");
  const [iQuantity, setIQuantity] = useState("1");
  const [iUnitCost, setIUnitCost] = useState("0");
  const [iNotes, setINotes] = useState("");
  const [iUpdateStock, setIUpdateStock] = useState(true);

  const [pIntakeId, setPIntakeId] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pMethod, setPMethod] = useState("cash");
  const [pNotes, setPNotes] = useState("");

  // Live Queries
  const wholesalers = useLiveQuery(() => db.wholesalers.toArray()) || [];
  const intakes = useLiveQuery(() => db.wholesalerIntakes.toArray()) || [];
  const payments = useLiveQuery(() => db.wholesalerPayments.toArray()) || [];
  const products = useLiveQuery(() => db.products.toArray()) || [];

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) navigate("/auth");
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

  // Helper Calculations
  const getWholesalerStats = (wholesalerId: string) => {
    const wIntakes = intakes.filter(i => i.wholesaler_id === wholesalerId);
    const totalOwed = wIntakes.reduce((sum, i) => sum + i.total_cost, 0);
    const totalPaid = wIntakes.reduce((sum, i) => sum + i.amount_paid, 0);
    const remaining = totalOwed - totalPaid;
    return { totalOwed, totalPaid, remaining, intakeCount: wIntakes.length };
  };

  const grandTotalOwed = intakes.reduce((sum, i) => sum + i.total_cost, 0);
  const grandTotalPaid = intakes.reduce((sum, i) => sum + i.amount_paid, 0);
  const grandRemainingOwed = grandTotalOwed - grandTotalPaid;

  // Add Wholesaler
  const handleAddWholesaler = async () => {
    if (!wName.trim()) {
      toast.error("Wholesaler name is required");
      return;
    }
    try {
      let activeUserId = "d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0";
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) activeUserId = user.id;
      } catch {}

      const nowIso = new Date().toISOString();
      const newWholesaler: CachedWholesaler = {
        id: crypto.randomUUID(),
        user_id: activeUserId,
        name: wName.trim(),
        contact_person: wContact.trim() || null,
        phone: wPhone.trim() || null,
        notes: wNotes.trim() || null,
        synced: false,
        lastModified: Date.now(),
        created_at: nowIso,
        updated_at: nowIso
      };

      await syncService.queueOperation('wholesalers', 'insert', newWholesaler);
      toast.success(`Wholesaler "${newWholesaler.name}" registered`);
      setAddWholesalerOpen(false);
      setWName(""); setWContact(""); setWPhone(""); setWNotes("");
    } catch (err: any) {
      toast.error(err.message || "Failed to add wholesaler");
    }
  };

  // Log Consignment Intake
  const handleLogIntake = async () => {
    if (!iWholesalerId) {
      toast.error("Select a wholesaler");
      return;
    }
    if (!iItemName.trim()) {
      toast.error("Item name is required");
      return;
    }
    const qty = parseInt(iQuantity) || 0;
    const cost = parseFloat(iUnitCost) || 0;

    if (qty <= 0 || cost < 0) {
      toast.error("Enter valid quantity and unit cost");
      return;
    }

    try {
      let activeUserId = "d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0";
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) activeUserId = user.id;
      } catch {}

      const nowIso = new Date().toISOString();
      const nowTs = Date.now();
      const totalCost = qty * cost;

      const intakeRecord: CachedWholesalerIntake = {
        id: crypto.randomUUID(),
        user_id: activeUserId,
        wholesaler_id: iWholesalerId,
        product_id: iProductId || null,
        item_name: iItemName.trim(),
        quantity: qty,
        agreed_unit_cost: cost,
        total_cost: totalCost,
        amount_paid: 0,
        intake_date: nowIso,
        status: 'pending',
        notes: iNotes.trim() || null,
        synced: false,
        lastModified: nowTs,
        created_at: nowIso,
        updated_at: nowIso
      };

      await syncService.queueOperation('wholesalerIntakes', 'insert', intakeRecord);

      // Optionally increment product stock if linked
      if (iProductId && iUpdateStock) {
        const product = await db.products.get(iProductId);
        if (product) {
          const updatedProd: CachedProduct = {
            ...product,
            stock_quantity: product.stock_quantity + qty,
            cost_price: cost, // update cost basis
            lastModified: nowTs,
            synced: false,
            updated_at: nowIso
          };
          await syncService.queueOperation('products', 'update', updatedProd);
          toast.success(`Updated stock for ${product.name} (+${qty})`);
        }
      }

      toast.success(`Logged intake: ${qty}x ${iItemName} (${formatCurrency(totalCost)})`);
      setLogIntakeOpen(false);
      setIWholesalerId(""); setIItemName(""); setIProductId(""); setIQuantity("1"); setIUnitCost("0"); setINotes("");
    } catch (err: any) {
      toast.error(err.message || "Failed to log intake");
    }
  };

  // Log Payment against Intake
  const handleLogPayment = async () => {
    const targetIntake = intakes.find(i => i.id === pIntakeId);
    if (!targetIntake) {
      toast.error("Select an intake entry to pay against");
      return;
    }

    const payAmount = parseFloat(pAmount);
    if (isNaN(payAmount) || payAmount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }

    const remainingOwed = targetIntake.total_cost - targetIntake.amount_paid;
    if (payAmount > remainingOwed + 0.01) {
      toast.error(`Payment exceeds remaining owed balance (${formatCurrency(remainingOwed)})`);
      return;
    }

    try {
      let activeUserId = "d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0";
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) activeUserId = user.id;
      } catch {}

      const nowIso = new Date().toISOString();
      const nowTs = Date.now();

      // 1. Log payment
      const paymentRecord: CachedWholesalerPayment = {
        id: crypto.randomUUID(),
        user_id: activeUserId,
        wholesaler_id: targetIntake.wholesaler_id,
        intake_id: targetIntake.id,
        amount: payAmount,
        payment_method: pMethod,
        payment_date: nowIso,
        notes: pNotes.trim() || null,
        synced: false,
        lastModified: nowTs,
        created_at: nowIso
      };

      await syncService.queueOperation('wholesalerPayments', 'insert', paymentRecord);

      // 2. Update intake amount_paid & status
      const newPaid = targetIntake.amount_paid + payAmount;
      const newStatus = newPaid >= targetIntake.total_cost - 0.01 ? 'paid' : 'partial';

      const updatedIntake: CachedWholesalerIntake = {
        ...targetIntake,
        amount_paid: newPaid,
        status: newStatus,
        synced: false,
        lastModified: nowTs,
        updated_at: nowIso
      };

      await syncService.queueOperation('wholesalerIntakes', 'update', updatedIntake);

      toast.success(`Payment of ${formatCurrency(payAmount)} recorded! (${newStatus.toUpperCase()})`);
      setLogPaymentOpen(false);
      setPAmount(""); setPNotes("");
    } catch (err: any) {
      toast.error(err.message || "Failed to record payment");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Navigation />
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" />
            Wholesaler Credit & Consignment Tracking
          </h1>
        </div>
      </header>

      <div className="flex flex-1">
        <Navigation />
        <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
          {/* Quick Stats Banner */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Total Agreed Cost</p>
                  <p className="text-2xl font-bold">{formatCurrency(grandTotalOwed)}</p>
                </div>
                <Layers className="h-8 w-8 text-muted-foreground/30" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Total Paid</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(grandTotalPaid)}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500/30" />
              </CardContent>
            </Card>

            <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200">
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-medium uppercase">Outstanding Owed</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatCurrency(grandRemainingOwed)}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-amber-500/40" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Suppliers / Wholesalers</p>
                  <p className="text-2xl font-bold text-primary">{wholesalers.length}</p>
                </div>
                <Truck className="h-8 w-8 text-primary/30" />
              </CardContent>
            </Card>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search wholesalers, items..."
                className="pl-9 text-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={handleSync} disabled={isSyncing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync"}
              </Button>
              <Button variant="outline" onClick={() => setAddWholesalerOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add Wholesaler
              </Button>
              <Button onClick={() => setLogIntakeOpen(true)}>
                <Package className="mr-2 h-4 w-4" /> Log Consignment Intake
              </Button>
            </div>
          </div>

          {/* Main Navigation Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="wholesalers">Wholesalers ({wholesalers.length})</TabsTrigger>
              <TabsTrigger value="intakes">Consignment Intakes ({intakes.length})</TabsTrigger>
              <TabsTrigger value="payments">Payment Log ({payments.length})</TabsTrigger>
            </TabsList>

            {/* Tab 1: Wholesalers List */}
            <TabsContent value="wholesalers">
              <Card>
                <CardContent className="pt-6">
                  {wholesalers.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground space-y-2">
                      <Truck className="h-10 w-10 mx-auto text-muted-foreground/30" />
                      <p className="font-semibold">No wholesalers registered yet</p>
                      <p className="text-xs">Click "Add Wholesaler" to add your first supplier.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Wholesaler Name</TableHead>
                          <TableHead>Contact & Phone</TableHead>
                          <TableHead>Intakes</TableHead>
                          <TableHead>Total Agreed</TableHead>
                          <TableHead>Total Paid</TableHead>
                          <TableHead>Balance Owed</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {wholesalers.map((w) => {
                          const stats = getWholesalerStats(w.id);

                          return (
                            <TableRow key={w.id}>
                              <TableCell className="font-bold text-primary">
                                {w.name}
                              </TableCell>
                              <TableCell className="text-xs">
                                <div>{w.contact_person || 'No contact person'}</div>
                                {w.phone && <div className="text-muted-foreground">{w.phone}</div>}
                              </TableCell>
                              <TableCell className="text-xs">{stats.intakeCount} entries</TableCell>
                              <TableCell className="text-xs font-semibold">{formatCurrency(stats.totalOwed)}</TableCell>
                              <TableCell className="text-xs font-semibold text-emerald-600">{formatCurrency(stats.totalPaid)}</TableCell>
                              <TableCell className="text-xs font-bold text-amber-600">
                                {formatCurrency(stats.remaining)}
                              </TableCell>
                              <TableCell className="text-right space-x-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => { setIWholesalerId(w.id); setLogIntakeOpen(true); }}
                                >
                                  <Package className="h-3 w-3 mr-1" /> Intake
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

            {/* Tab 2: Intakes List */}
            <TabsContent value="intakes">
              <Card>
                <CardContent className="pt-6">
                  {intakes.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground space-y-2">
                      <Layers className="h-10 w-10 mx-auto text-muted-foreground/30" />
                      <p className="font-semibold">No consignment intakes recorded</p>
                      <p className="text-xs">Log intakes of parts or devices taken on credit.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Wholesaler</TableHead>
                          <TableHead>Item / Part Name</TableHead>
                          <TableHead>Qty x Unit Cost</TableHead>
                          <TableHead>Total Cost</TableHead>
                          <TableHead>Amount Paid</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {intakes.map((intake) => {
                          const w = wholesalers.find(x => x.id === intake.wholesaler_id);
                          const remaining = intake.total_cost - intake.amount_paid;

                          return (
                            <TableRow key={intake.id}>
                              <TableCell className="text-xs font-mono">
                                {new Date(intake.intake_date || intake.created_at || Date.now()).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="font-medium text-xs">{w?.name || 'Unknown'}</TableCell>
                              <TableCell className="font-bold text-xs">{intake.item_name}</TableCell>
                              <TableCell className="text-xs">
                                {intake.quantity}x @ {formatCurrency(intake.agreed_unit_cost)}
                              </TableCell>
                              <TableCell className="text-xs font-semibold">{formatCurrency(intake.total_cost)}</TableCell>
                              <TableCell className="text-xs font-semibold text-emerald-600">{formatCurrency(intake.amount_paid)}</TableCell>
                              <TableCell>
                                <Badge variant={intake.status === 'paid' ? 'default' : intake.status === 'partial' ? 'outline' : 'secondary'} className="text-[10px] capitalize">
                                  {intake.status} ({formatCurrency(remaining)} left)
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {intake.status !== 'paid' && (
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => { setPIntakeId(intake.id); setPAmount(String(remaining)); setLogPaymentOpen(true); }}
                                  >
                                    <DollarSign className="h-3 w-3 mr-1" /> Pay
                                  </Button>
                                )}
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

            {/* Tab 3: Payment History */}
            <TabsContent value="payments">
              <Card>
                <CardContent className="pt-6">
                  {payments.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground space-y-2">
                      <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/30" />
                      <p className="font-semibold">No wholesaler payments recorded yet</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Wholesaler</TableHead>
                          <TableHead>Intake Item</TableHead>
                          <TableHead>Amount Paid</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map((p) => {
                          const w = wholesalers.find(x => x.id === p.wholesaler_id);
                          const intake = intakes.find(i => i.id === p.intake_id);

                          return (
                            <TableRow key={p.id}>
                              <TableCell className="text-xs font-mono">
                                {new Date(p.payment_date || p.created_at || Date.now()).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="font-medium text-xs">{w?.name || 'Unknown'}</TableCell>
                              <TableCell className="text-xs">{intake?.item_name || 'General Payment'}</TableCell>
                              <TableCell className="text-xs font-bold text-emerald-600">{formatCurrency(p.amount)}</TableCell>
                              <TableCell className="text-xs uppercase">{p.payment_method}</TableCell>
                              <TableCell className="text-xs text-muted-foreground italic">{p.notes || '-'}</TableCell>
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

      {/* Modal 1: Add Wholesaler */}
      <Dialog open={addWholesalerOpen} onOpenChange={setAddWholesalerOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" /> Register Wholesaler / Supplier
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs">Wholesaler Company / Name *</Label>
              <Input placeholder="e.g. Master Screen Traders" value={wName} onChange={(e) => setWName(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Contact Person</Label>
                <Input placeholder="Manager name" value={wContact} onChange={(e) => setWContact(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone Number</Label>
                <Input placeholder="+92 300 0000000" value={wPhone} onChange={(e) => setWPhone(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes / Terms</Label>
              <Textarea placeholder="Consignment credit terms, payment frequency..." value={wNotes} onChange={(e) => setWNotes(e.target.value)} className="text-xs min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddWholesalerOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAddWholesaler}>Save Wholesaler</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Log Consignment Intake */}
      <Dialog open={logIntakeOpen} onOpenChange={setLogIntakeOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" /> Log Consignment Intake Entry
            </DialogTitle>
            <DialogDescription className="text-xs">Record parts/items taken on credit from a wholesaler.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs">Wholesaler / Supplier *</Label>
              <Select value={iWholesalerId} onValueChange={setIWholesalerId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose wholesaler..." /></SelectTrigger>
                <SelectContent>
                  {wholesalers.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Link to Inventory Product (Optional)</Label>
              <Select value={iProductId} onValueChange={(val) => { setIProductId(val); const p = products.find(x => x.id === val); if (p) { setIItemName(p.name); setIUnitCost(String(p.cost_price || 0)); } }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Link existing inventory product..." /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} (Stock: {p.stock_quantity})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Item / Part Name *</Label>
              <Input placeholder="e.g. iPhone 14 Pro Original OLED Screen" value={iItemName} onChange={(e) => setIItemName(e.target.value)} className="h-8 text-xs" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Quantity Taken *</Label>
                <Input type="number" min="1" value={iQuantity} onChange={(e) => setIQuantity(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Agreed Unit Cost *</Label>
                <Input type="number" step="0.01" value={iUnitCost} onChange={(e) => setIUnitCost(e.target.value)} className="h-8 text-xs font-semibold" />
              </div>
            </div>

            <div className="p-2.5 bg-muted/40 rounded border flex items-center justify-between text-xs">
              <span>Total Credit Cost Owed:</span>
              <span className="font-bold text-primary text-sm">{formatCurrency((parseInt(iQuantity) || 0) * (parseFloat(iUnitCost) || 0))}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLogIntakeOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleLogIntake}>Log Intake</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 3: Log Payment */}
      <Dialog open={logPaymentOpen} onOpenChange={setLogPaymentOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 text-emerald-600">
              <DollarSign className="h-5 w-5" /> Record Wholesaler Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs">Payment Amount *</Label>
              <Input type="number" step="0.01" value={pAmount} onChange={(e) => setPAmount(e.target.value)} className="h-8 text-xs font-bold" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Payment Method</Label>
              <Select value={pMethod} onValueChange={setPMethod}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card">Card / Terminal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes / Reference</Label>
              <Input placeholder="Receipt ref, bank reference #..." value={pNotes} onChange={(e) => setPNotes(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLogPaymentOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleLogPayment} className="bg-emerald-600 hover:bg-emerald-700">Submit Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Wholesalers;
