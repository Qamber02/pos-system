import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, RotateCcw, Wrench, AlertTriangle, Truck, CheckCircle, ShieldAlert, ShoppingBag, Layers } from "lucide-react";
import { toast } from "sonner";
import { db, CachedProduct, CachedRepairTicketPart, TicketPartStatus, CachedRepairTicketPartHistory } from "@/lib/db";
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
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [attachType, setAttachType] = useState<'part' | 'product'>("part");
  const [filterMode, setFilterMode] = useState<'parts' | 'products' | 'all'>("parts");
  const [loading, setLoading] = useState(false);

  // Status Change Dialog State
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [targetPart, setTargetPart] = useState<(CachedRepairTicketPart & { product?: CachedProduct }) | null>(null);
  const [newStatus, setNewStatus] = useState<TicketPartStatus>("returned");
  const [reason, setReason] = useState("");

  const products = useLiveQuery(() => db.products.toArray()) || [];
  const reservedParts = useLiveQuery(async () => {
    const list = await db.repairTicketParts.where('repair_ticket_id').equals(ticketId).toArray();
    const prods = await db.products.toArray();
    const prodMap = new Map(prods.map(p => [p.id, p]));

    return list.map(part => ({
      ...part,
      product: prodMap.get(part.product_id)
    }));
  }) || [];

  // Filter available products for selection based on tab mode
  const filteredProducts = products.filter(p => {
    if (filterMode === 'parts') return p.is_repair_part === true;
    if (filterMode === 'products') return !p.is_repair_part;
    return true; // 'all'
  });

  const handleReserveItem = async () => {
    if (!selectedProductId) {
      toast.error("Select an item to attach");
      return;
    }
    const qtyNum = parseInt(quantity) || 1;
    if (qtyNum <= 0) {
      toast.error("Quantity must be at least 1");
      return;
    }

    const product = products.find(p => p.id === selectedProductId);
    if (!product) {
      toast.error("Selected item not found");
      return;
    }

    if (product.stock_quantity < qtyNum) {
      toast.error(`Insufficient stock! Available: ${product.stock_quantity}, requested: ${qtyNum}`);
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

      // 1. Create repair ticket part record with price/cost snapshot & item_type
      const partRecord: CachedRepairTicketPart = {
        id: crypto.randomUUID(),
        user_id: activeUserId,
        repair_ticket_id: ticketId,
        product_id: product.id,
        quantity: qtyNum,
        unit_cost: product.cost_price || 0,
        unit_price: product.retail_price,
        status: 'reserved',
        item_type: attachType,
        synced: false,
        lastModified: nowTimestamp,
        created_at: nowIso,
        updated_at: nowIso
      };

      await syncService.queueOperation('repairTicketParts', 'insert', partRecord);

      // 2. Log initial history
      const historyEntry: CachedRepairTicketPartHistory = {
        id: crypto.randomUUID(),
        repair_ticket_part_id: partRecord.id,
        repair_ticket_id: ticketId,
        user_id: activeUserId,
        previous_status: null,
        new_status: 'reserved',
        reason: `Attached ${attachType === 'product' ? 'Product/Accessory' : 'Repair Part'} (Cost: ${product.cost_price || 0}, Price: ${product.retail_price})`,
        changed_by: activeUserId,
        synced: false,
        lastModified: nowTimestamp,
        created_at: nowIso
      };
      await syncService.queueOperation('repairTicketPartHistory', 'insert', historyEntry);

      // 3. Decrement stock_quantity immediately
      const updatedProduct: CachedProduct = {
        ...product,
        stock_quantity: product.stock_quantity - qtyNum,
        lastModified: nowTimestamp,
        synced: false,
        updated_at: nowIso
      };

      await syncService.queueOperation('products', 'update', updatedProduct);

      toast.success(`Attached ${qtyNum}x ${product.name} (${attachType === 'product' ? 'Product' : 'Part'}) — Stock: ${product.stock_quantity} → ${updatedProduct.stock_quantity}`);
      setSelectedProductId("");
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
    <div className="space-y-4 pt-2">
      {/* Header & Financial breakdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-primary" /> Attached Parts & POS Accessories
        </Label>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Parts: <strong className="text-foreground">{formatCurrency(activePartsTotal)}</strong></span>
          <span className="text-muted-foreground">Accessories: <strong className="text-foreground">{formatCurrency(activeProductsTotal)}</strong></span>
          <Badge variant="secondary" className="font-bold text-xs bg-primary/10 text-primary border-primary/20">
            Total Items: {formatCurrency(totalItemsSum)}
          </Badge>
        </div>
      </div>

      {/* Part / Product Attach Section with Mode Switcher */}
      <div className="bg-muted/20 p-3 rounded-lg border space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Catalog Mode:</span>
          <Tabs value={filterMode} onValueChange={(val: any) => { setFilterMode(val); setAttachType(val === 'products' ? 'product' : 'part'); setSelectedProductId(""); }} className="h-7">
            <TabsList className="h-7 p-0.5 text-xs">
              <TabsTrigger value="parts" className="text-[11px] h-6 px-2 flex items-center gap-1">
                <Wrench className="h-3 w-3" /> Parts
              </TabsTrigger>
              <TabsTrigger value="products" className="text-[11px] h-6 px-2 flex items-center gap-1">
                <ShoppingBag className="h-3 w-3" /> Accessories
              </TabsTrigger>
              <TabsTrigger value="all" className="text-[11px] h-6 px-2">
                All Inventory
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">
              {filterMode === 'products' ? 'Select Accessory / POS Product' : filterMode === 'parts' ? 'Select Repair Part' : 'Select Item from Catalog'}
            </Label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={filterMode === 'products' ? "Choose accessory (case, cable, charger)..." : "Choose repair part (screen, battery)..."} />
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

          <div className="w-20 space-y-1">
            <Label className="text-xs">Qty</Label>
            <Input
              type="number"
              min="1"
              className="h-8 text-xs"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <Button size="sm" className="h-8 text-xs" onClick={handleReserveItem} disabled={loading}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Attach
          </Button>
        </div>
      </div>

      {/* Reserved Parts & Products List */}
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="h-8 bg-muted/30">
              <TableHead className="text-xs py-1">Type & Item Name</TableHead>
              <TableHead className="text-xs py-1">Qty</TableHead>
              <TableHead className="text-xs py-1">Cost / Price</TableHead>
              <TableHead className="text-xs py-1">Status</TableHead>
              <TableHead className="text-xs py-1 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservedParts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">
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
                        <SelectTrigger className="h-7 text-[11px] w-[140px] ml-auto">
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
