import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, RotateCcw, Wrench, AlertTriangle, Truck, CheckCircle, ShieldAlert, ShoppingBag, Layers, Edit3, List, DollarSign, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { db, CachedProduct, CachedRepairTicketPart, TicketPartStatus, CachedRepairTicketPartHistory, CachedWholesalerIntake, CachedWholesalerPayment } from "@/lib/db";
import { syncService } from "@/lib/syncService";
import { useLiveQuery } from "dexie-react-hooks";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface TicketPartsManagerProps {
  ticketId: string;
}

const statusBadgeStyles: Record<TicketPartStatus, { label: string; className: string; icon: any }> = {
  reserved: { label: "Reserved", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300", icon: Wrench },
  consumed: { label: "Installed / Sold", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", icon: CheckCircle },
  returned: { label: "Returned to Stock", className: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300", icon: RotateCcw },
  broken: { label: "Broken / Defective", className: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 font-semibold", icon: AlertTriangle },
  returned_to_supplier: { label: "Returned to Supplier", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300", icon: Truck },
};

export const TicketPartsManager = ({ ticketId }: TicketPartsManagerProps) => {
  const formatCurrency = useFormatCurrency();
  const [partSourceMode, setPartSourceMode] = useState<'inventory' | 'custom'>('inventory');
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [customPartName, setCustomPartName] = useState<string>("");
  const [customUnitCost, setCustomUnitCost] = useState<string>("0");
  const [customUnitPrice, setCustomUnitPrice] = useState<string>("0");
  const [inventoryUnitCost, setInventoryUnitCost] = useState<string>("");
  const [selectedWholesalerId, setSelectedWholesalerId] = useState<string>("");
  const [wholesalerPaid, setWholesalerPaid] = useState<boolean>(false);
  const [quantity, setQuantity] = useState<string>("1");
  const [attachType, setAttachType] = useState<'part' | 'product'>("part");
  const [filterMode, setFilterMode] = useState<'parts' | 'products' | 'all'>("parts");
  const [loading, setLoading] = useState(false);

  // Status Change Dialog State
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [targetPart, setTargetPart] = useState<(CachedRepairTicketPart & { product?: CachedProduct }) | null>(null);
  const [newStatus, setNewStatus] = useState<TicketPartStatus>("returned");
  const [reason, setReason] = useState("");

  const ticket = useLiveQuery(() => db.repairTickets.get(ticketId), [ticketId]);
  const products = useLiveQuery(() => db.products.toArray()) || [];
  const wholesalers = useLiveQuery(() => db.wholesalers.toArray()) || [];

  const reservedParts = useLiveQuery(async () => {
    const list = await db.repairTicketParts.where('repair_ticket_id').equals(ticketId).toArray();
    const prods = await db.products.toArray();
    const wholes = await db.wholesalers.toArray();

    const prodMap = new Map(prods.map(p => [p.id, p]));
    const wholeMap = new Map(wholes.map(w => [w.id, w]));

    return list.map(part => ({
      ...part,
      product: prodMap.get(part.product_id),
      wholesaler: part.wholesaler_id ? wholeMap.get(part.wholesaler_id) : undefined
    }));
  }) || [];

  // Filter available products for selection based on tab mode
  const filteredProducts = products.filter(p => {
    if (filterMode === 'parts') return p.is_repair_part === true;
    if (filterMode === 'products') return !p.is_repair_part;
    return true; // 'all'
  });

  const handleProductSelectChange = (prodId: string) => {
    setSelectedProductId(prodId);
    const prod = products.find(p => p.id === prodId);
    if (prod) {
      setInventoryUnitCost(String(prod.cost_price || 0));
    }
  };

  const handleReserveItem = async () => {
    const qtyNum = parseInt(quantity) || 1;
    if (qtyNum <= 0) {
      toast.error("Quantity must be at least 1");
      return;
    }

    const isFromWholesaler = Boolean(selectedWholesalerId && selectedWholesalerId !== 'none');

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

      let targetProduct: CachedProduct | undefined;
      let cost = 0;
      let price = 0;

      if (partSourceMode === 'custom') {
        if (!customPartName.trim()) {
          toast.error("Enter a custom part name");
          setLoading(false);
          return;
        }
        cost = parseFloat(customUnitCost) || 0;
        price = parseFloat(customUnitPrice) || 0;

        // Auto-create product in catalog
        const newProdId = crypto.randomUUID();
        targetProduct = {
          id: newProdId,
          user_id: activeUserId,
          name: customPartName.trim(),
          sku: `PART-${Math.floor(10000 + Math.random() * 90000)}`,
          cost_price: cost,
          retail_price: price,
          stock_quantity: 0,
          is_repair_part: true,
          synced: false,
          lastModified: nowTimestamp,
          created_at: nowIso,
          updated_at: nowIso
        };
        await syncService.queueOperation('products', 'insert', targetProduct);
      } else {
        if (!selectedProductId) {
          toast.error("Select an item to attach");
          setLoading(false);
          return;
        }
        targetProduct = products.find(p => p.id === selectedProductId);
        if (!targetProduct) {
          toast.error("Selected item not found");
          setLoading(false);
          return;
        }
        cost = inventoryUnitCost !== "" ? (parseFloat(inventoryUnitCost) || 0) : (targetProduct.cost_price || 0);
        price = targetProduct.retail_price || 0;

        // If not sourced from a wholesaler, check local inventory and decrement
        if (!isFromWholesaler) {
          if (targetProduct.stock_quantity < qtyNum) {
            toast.error(`Insufficient stock! Available: ${targetProduct.stock_quantity}, requested: ${qtyNum}`);
            setLoading(false);
            return;
          }

          // Decrement stock for inventory product
          const updatedProduct: CachedProduct = {
            ...targetProduct,
            stock_quantity: targetProduct.stock_quantity - qtyNum,
            lastModified: nowTimestamp,
            synced: false,
            updated_at: nowIso
          };
          await syncService.queueOperation('products', 'update', updatedProduct);
        }
      }

      // 1. Create repair ticket part record
      const partRecord: CachedRepairTicketPart = {
        id: crypto.randomUUID(),
        user_id: activeUserId,
        repair_ticket_id: ticketId,
        product_id: targetProduct.id,
        quantity: qtyNum,
        unit_cost: cost,
        unit_price: price,
        status: 'reserved',
        item_type: attachType,
        wholesaler_id: isFromWholesaler ? selectedWholesalerId : null,
        synced: false,
        lastModified: nowTimestamp,
        created_at: nowIso,
        updated_at: nowIso
      };

      await syncService.queueOperation('repairTicketParts', 'insert', partRecord);

      // 2. Log history
      const historyEntry: CachedRepairTicketPartHistory = {
        id: crypto.randomUUID(),
        repair_ticket_part_id: partRecord.id,
        repair_ticket_id: ticketId,
        user_id: activeUserId,
        previous_status: null,
        new_status: 'reserved',
        reason: `Attached ${targetProduct.name} (Cost: ${cost}, Price: ${price})${isFromWholesaler ? ' [Wholesaler Consignment]' : ''}`,
        changed_by: activeUserId,
        synced: false,
        lastModified: nowTimestamp,
        created_at: nowIso
      };
      await syncService.queueOperation('repairTicketPartHistory', 'insert', historyEntry);

      // 3. IF WHOLESALER WAS SELECTED, LOG INTAKE FOR WHOLESALER SCREEN
      if (isFromWholesaler) {
        const wholesaler = wholesalers.find(w => w.id === selectedWholesalerId);
        const totalCost = qtyNum * cost;
        const isPaid = wholesalerPaid;
        const intakeId = crypto.randomUUID();
        const ticketNum = ticket?.ticket_number || ticketId.slice(0, 8);

        const intakeRecord: CachedWholesalerIntake = {
          id: intakeId,
          user_id: activeUserId,
          wholesaler_id: selectedWholesalerId,
          product_id: targetProduct.id,
          item_name: `${targetProduct.name} (Ticket ${ticketNum})`,
          quantity: qtyNum,
          agreed_unit_cost: cost,
          total_cost: totalCost,
          amount_paid: isPaid ? totalCost : 0,
          intake_date: nowIso,
          status: isPaid ? 'paid' : 'pending',
          notes: `Attached to Repair Ticket ${ticketNum} (${ticket?.device_name || 'Device'})${isPaid ? ' - Paid upfront' : ' - Pending credit'}`,
          synced: false,
          lastModified: nowTimestamp,
          created_at: nowIso,
          updated_at: nowIso
        };
        await syncService.queueOperation('wholesalerIntakes', 'insert', intakeRecord);

        if (isPaid && totalCost > 0) {
          const paymentRecord: CachedWholesalerPayment = {
            id: crypto.randomUUID(),
            user_id: activeUserId,
            wholesaler_id: selectedWholesalerId,
            intake_id: intakeId,
            amount: totalCost,
            payment_method: 'cash',
            payment_date: nowIso,
            notes: `Upfront payment for ${targetProduct.name} (Ticket ${ticketNum})`,
            synced: false,
            lastModified: nowTimestamp,
            created_at: nowIso
          };
          await syncService.queueOperation('wholesalerPayments', 'insert', paymentRecord);
        }

        toast.success(`Consignment logged for ${wholesaler?.name || 'Wholesaler'} (${isPaid ? 'PAID' : 'PENDING CREDIT'})`);
      }

      toast.success(`Attached ${qtyNum}x ${targetProduct.name}`);
      setSelectedProductId("");
      setCustomPartName("");
      setInventoryUnitCost("");
      setSelectedWholesalerId("");
      setWholesalerPaid(false);
      setQuantity("1");
    } catch (error: any) {
      toast.error(error.message || "Failed to attach item");
    } finally {
      setLoading(false);
    }
  };

  const openChangeStatusDialog = (part: CachedRepairTicketPart & { product?: CachedProduct }, targetStatus: TicketPartStatus) => {
    setTargetPart(part);
    setNewStatus(targetStatus);
    setReason("");
    setStatusDialogOpen(true);
  };

  const handleApplyStatusChange = async () => {
    if (!targetPart) return;

    if (newStatus === targetPart.status) {
      toast.error("Item already has this status");
      return;
    }

    if (!reason.trim()) {
      toast.error("Please enter a reason for this status update");
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
      const prevStatus = targetPart.status;

      // 1. Update part status & reason
      const updatedPart: CachedRepairTicketPart = {
        ...targetPart,
        status: newStatus,
        status_reason: reason.trim(),
        status_updated_at: nowIso,
        synced: false,
        lastModified: nowTimestamp,
        updated_at: nowIso
      };

      await syncService.queueOperation('repairTicketParts', 'update', updatedPart);

      // 2. Insert audit log history entry
      const historyEntry: CachedRepairTicketPartHistory = {
        id: crypto.randomUUID(),
        repair_ticket_part_id: targetPart.id,
        repair_ticket_id: ticketId,
        user_id: activeUserId,
        previous_status: prevStatus,
        new_status: newStatus,
        reason: reason.trim(),
        changed_by: activeUserId,
        synced: false,
        lastModified: nowTimestamp,
        created_at: nowIso
      };

      await syncService.queueOperation('repairTicketPartHistory', 'insert', historyEntry);

      // 3. Handle stock updates based on status transitions
      if (newStatus === 'returned' && prevStatus !== 'returned') {
        const product = await db.products.get(targetPart.product_id);
        if (product) {
          const updatedProduct: CachedProduct = {
            ...product,
            stock_quantity: product.stock_quantity + targetPart.quantity,
            lastModified: nowTimestamp,
            synced: false,
            updated_at: nowIso
          };
          await syncService.queueOperation('products', 'update', updatedProduct);
          toast.success(`Restored ${targetPart.quantity}x ${product.name} to stock`);
        }
      } else if (prevStatus === 'returned' && newStatus !== 'returned') {
        const product = await db.products.get(targetPart.product_id);
        if (product) {
          const updatedProduct: CachedProduct = {
            ...product,
            stock_quantity: Math.max(0, product.stock_quantity - targetPart.quantity),
            lastModified: nowTimestamp,
            synced: false,
            updated_at: nowIso
          };
          await syncService.queueOperation('products', 'update', updatedProduct);
        }
      }

      toast.success(`Updated item status to: ${statusBadgeStyles[newStatus].label}`);
      setStatusDialogOpen(false);
      setTargetPart(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to update status");
    } finally {
      setLoading(false);
    }
  };

  const activePartsTotal = reservedParts
    .filter(p => (p.item_type === 'part' || !p.item_type) && !['returned', 'broken', 'returned_to_supplier'].includes(p.status))
    .reduce((sum, p) => sum + (p.unit_price * p.quantity), 0);

  const activeProductsTotal = reservedParts
    .filter(p => p.item_type === 'product' && !['returned', 'broken', 'returned_to_supplier'].includes(p.status))
    .reduce((sum, p) => sum + (p.unit_price * p.quantity), 0);

  const totalItemsSum = activePartsTotal + activeProductsTotal;

  return (
    <div className="space-y-4">
      {/* Header Summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b pb-2">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Wrench className="h-4 w-4 text-primary" /> Consumable Parts & Accessories
          </h3>
          <p className="text-[11px] text-muted-foreground">Manage replaced components, glass protectors, and sourcing</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Parts: <strong className="text-foreground">{formatCurrency(activePartsTotal)}</strong></span>
          <span className="text-muted-foreground">Accessories: <strong className="text-foreground">{formatCurrency(activeProductsTotal)}</strong></span>
          <Badge variant="secondary" className="font-bold text-xs bg-primary/10 text-primary border-primary/20">
            Total Items: {formatCurrency(totalItemsSum)}
          </Badge>
        </div>
      </div>

      {/* Part / Product Attach Section with Wholesaler Selection */}
      <div className="bg-muted/20 p-3 rounded-lg border space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Select Source Mode:</span>
          <Tabs value={partSourceMode} onValueChange={(val: any) => setPartSourceMode(val)} className="h-7">
            <TabsList className="h-7 p-0.5 text-xs">
              <TabsTrigger value="inventory" className="text-[11px] h-6 px-2 flex items-center gap-1">
                <List className="h-3 w-3" /> From Inventory
              </TabsTrigger>
              <TabsTrigger value="custom" className="text-[11px] h-6 px-2 flex items-center gap-1">
                <Edit3 className="h-3 w-3" /> Write Custom Part Name
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {partSourceMode === 'inventory' ? (
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Select Inventory Item *</Label>
              <Select value={selectedProductId} onValueChange={handleProductSelectChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose repair part or accessory..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.is_repair_part ? '(Part)' : '(Product)'} — Stock: {p.stock_quantity} ({formatCurrency(p.retail_price)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Write Custom Part Name *</Label>
              <Input
                placeholder="e.g. iPhone 13 Original OLED Display"
                className="h-8 text-xs"
                value={customPartName}
                onChange={(e) => setCustomPartName(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Truck className="h-3 w-3 text-purple-600" /> Sourced Reseller / Wholesaler
            </Label>
            <Select value={selectedWholesalerId} onValueChange={setSelectedWholesalerId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select Wholesaler..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Wholesaler (Shop Stock)</SelectItem>
                {wholesalers.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} {w.contact_person ? `(${w.contact_person})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Cost & Price fields */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              {selectedWholesalerId && selectedWholesalerId !== 'none' ? "Wholesaler Unit Cost" : "Unit Cost Price"}
            </Label>
            <Input
              type="number"
              step="0.01"
              className="h-7 text-xs font-semibold"
              value={partSourceMode === 'custom' ? customUnitCost : inventoryUnitCost}
              onChange={(e) => partSourceMode === 'custom' ? setCustomUnitCost(e.target.value) : setInventoryUnitCost(e.target.value)}
              placeholder="0.00"
            />
          </div>
          {partSourceMode === 'custom' && (
            <div className="space-y-1">
              <Label className="text-[11px]">Part Retail Price</Label>
              <Input type="number" step="0.01" className="h-7 text-xs font-semibold" value={customUnitPrice} onChange={(e) => setCustomUnitPrice(e.target.value)} />
            </div>
          )}
        </div>

        {/* Reseller Payment Status Toggle (if wholesaler is selected) */}
        {selectedWholesalerId && selectedWholesalerId !== 'none' && (
          <div className="flex items-center justify-between pt-1.5 border-t border-border/60">
            <Label className="text-[10px] font-medium text-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3 text-emerald-600" /> Reseller Payment Status:
            </Label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setWholesalerPaid(false)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1 ${
                  !wholesalerPaid
                    ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 font-bold'
                    : 'bg-background text-muted-foreground border-input hover:bg-muted'
                }`}
              >
                <Clock className="h-2.5 w-2.5" /> Unpaid (Credit Consignment)
              </button>
              <button
                type="button"
                onClick={() => setWholesalerPaid(true)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1 ${
                  wholesalerPaid
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 font-bold'
                    : 'bg-background text-muted-foreground border-input hover:bg-muted'
                }`}
              >
                <CheckCircle2 className="h-2.5 w-2.5" /> Paid in Full
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 items-end justify-between pt-1">
          <div className="w-24 space-y-1">
            <Label className="text-xs">Qty</Label>
            <Input
              type="number"
              min="1"
              className="h-8 text-xs"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <Button size="sm" className="h-8 text-xs font-semibold" onClick={handleReserveItem} disabled={loading}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Attach Item
          </Button>
        </div>
      </div>

      {/* Reserved Parts & Products List */}
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="h-8 bg-muted/30">
              <TableHead className="text-xs py-1">Type & Item Name</TableHead>
              <TableHead className="text-xs py-1">Wholesaler</TableHead>
              <TableHead className="text-xs py-1">Qty</TableHead>
              <TableHead className="text-xs py-1">Cost / Price</TableHead>
              <TableHead className="text-xs py-1">Status</TableHead>
              <TableHead className="text-xs py-1 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservedParts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-4">
                  No parts or accessories attached to this repair ticket yet.
                </TableCell>
              </TableRow>
            ) : (
              reservedParts.map((part) => {
                const style = statusBadgeStyles[part.status] || statusBadgeStyles.reserved;
                const StatusIcon = style.icon;
                const isAccessory = part.item_type === 'product';

                return (
                  <TableRow key={part.id} className="h-9 text-xs">
                    <TableCell className="font-medium py-1">
                      <div className="flex items-center gap-1.5">
                        {isAccessory ? (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-400 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                            <ShoppingBag className="h-2.5 w-2.5" /> Product
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-400 text-blue-700 dark:text-blue-300 flex items-center gap-1">
                            <Wrench className="h-2.5 w-2.5" /> Part
                          </Badge>
                        )}
                        <span>{part.product?.name || 'Unknown Item'}</span>
                      </div>
                      {part.status_reason && (
                        <div className="text-[10px] text-muted-foreground italic truncate max-w-[200px] mt-0.5">
                          Note: {part.status_reason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-1">
                      {part.wholesaler ? (
                        <Badge variant="secondary" className="text-[10px] bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1 w-fit">
                          <Truck className="h-2.5 w-2.5" />
                          {part.wholesaler.name}
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">Shop Stock</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1">{part.quantity}</TableCell>
                    <TableCell className="py-1">
                      <div>{formatCurrency(part.unit_price)}</div>
                      <div className="text-[10px] text-muted-foreground">Cost: {formatCurrency(part.unit_cost)}</div>
                    </TableCell>
                    <TableCell className="py-1">
                      <Badge className={`${style.className} text-[10px] px-1.5 py-0 border-none flex items-center gap-1 w-fit`}>
                        <StatusIcon className="h-3 w-3" />
                        {style.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1 text-right">
                      <Select
                        value={part.status}
                        onValueChange={(val: TicketPartStatus) => openChangeStatusDialog(part, val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] w-[130px] ml-auto">
                          <SelectValue placeholder="Update status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reserved">Reserved</SelectItem>
                          <SelectItem value="consumed">Installed / Sold</SelectItem>
                          <SelectItem value="returned">Return Stock</SelectItem>
                          <SelectItem value="broken">Broken / Defective</SelectItem>
                          <SelectItem value="returned_to_supplier">Return to Supplier</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Status Update Reason Modal */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              Update Item Status
            </DialogTitle>
            <DialogDescription className="text-xs">
              Changing status for <span className="font-semibold text-foreground">{targetPart?.product?.name}</span> to{" "}
              <span className="font-semibold text-primary">{statusBadgeStyles[newStatus]?.label}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            {newStatus === 'returned' && (
              <div className="p-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 text-blue-800 dark:text-blue-300 rounded text-[11px]">
                ℹ️ This will return <strong>{targetPart?.quantity} unit(s)</strong> back to shop inventory stock.
              </div>
            )}
            {newStatus === 'broken' && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 text-rose-800 dark:text-rose-300 rounded text-[11px]">
                ⚠️ Stock will NOT be restored. Item will be written off as defective/broken.
              </div>
            )}
            {newStatus === 'returned_to_supplier' && (
              <div className="p-2.5 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 text-purple-800 dark:text-purple-300 rounded text-[11px]">
                📦 Stock will NOT be restored to sellable inventory. Linked for wholesaler return credit.
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Reason / Explanation (Required)</Label>
              <Input
                placeholder="e.g. Screen cable torn during installation, Customer changed mind..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApplyStatusChange} disabled={loading}>
              Save Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
