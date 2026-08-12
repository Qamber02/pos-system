import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, RotateCcw, PackageCheck, AlertCircle, Wrench } from "lucide-react";
import { toast } from "sonner";
import { db, CachedProduct, CachedProductVariant, CachedRepairTicketPart } from "@/lib/db";
import { syncService } from "@/lib/syncService";
import { useLiveQuery } from "dexie-react-hooks";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface TicketPartsManagerProps {
  ticketId: string;
}

export const TicketPartsManager = ({ ticketId }: TicketPartsManagerProps) => {
  const formatCurrency = useFormatCurrency();
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [loading, setLoading] = useState(false);

  const products = useLiveQuery(() => db.products.toArray()) || [];
  const variants = useLiveQuery(() => db.productVariants.toArray()) || [];
  const reservedParts = useLiveQuery(async () => {
    const list = await db.repairTicketParts.where('repair_ticket_id').equals(ticketId).toArray();
    const prods = await db.products.toArray();
    const prodMap = new Map(prods.map(p => [p.id, p]));

    return list.map(part => ({
      ...part,
      product: prodMap.get(part.product_id)
    }));
  }) || [];

  const handleReservePart = async () => {
    if (!selectedProductId) {
      toast.error("Select a part product");
      return;
    }
    const qtyNum = parseInt(quantity) || 1;
    if (qtyNum <= 0) {
      toast.error("Quantity must be at least 1");
      return;
    }

    const product = products.find(p => p.id === selectedProductId);
    if (!product) {
      toast.error("Selected product not found");
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
        // Fallback to default
      }

      const nowIso = new Date().toISOString();
      const nowTimestamp = Date.now();

      // 1. Create repair ticket part record
      const partRecord: CachedRepairTicketPart = {
        id: crypto.randomUUID(),
        user_id: activeUserId,
        repair_ticket_id: ticketId,
        product_id: product.id,
        quantity: qtyNum,
        unit_cost: product.cost_price || 0,
        unit_price: product.retail_price,
        status: 'reserved',
        synced: false,
        lastModified: nowTimestamp,
        created_at: nowIso,
        updated_at: nowIso
      };

      await syncService.queueOperation('repairTicketParts', 'insert', partRecord);

      // 2. Decrement stock_quantity immediately in local db & queue product update
      const updatedProduct: CachedProduct = {
        ...product,
        stock_quantity: product.stock_quantity - qtyNum,
        lastModified: nowTimestamp,
        synced: false,
        updated_at: nowIso
      };

      await syncService.queueOperation('products', 'update', updatedProduct);

      toast.success(`Reserved ${qtyNum}x ${product.name} (Stock updated: ${product.stock_quantity} → ${updatedProduct.stock_quantity})`);
      setSelectedProductId("");
      setQuantity("1");
    } catch (error: any) {
      toast.error(error.message || "Failed to reserve part");
    } finally {
      setLoading(false);
    }
  };

  const handleReturnPart = async (part: CachedRepairTicketPart & { product?: CachedProduct }) => {
    if (part.status === 'returned') return;

    setLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const nowTimestamp = Date.now();

      // 1. Update part record status to returned
      const updatedPart: CachedRepairTicketPart = {
        ...part,
        status: 'returned',
        synced: false,
        lastModified: nowTimestamp,
        updated_at: nowIso
      };

      await syncService.queueOperation('repairTicketParts', 'update', updatedPart);

      // 2. Restore product stock_quantity
      const product = await db.products.get(part.product_id);
      if (product) {
        const updatedProduct: CachedProduct = {
          ...product,
          stock_quantity: product.stock_quantity + part.quantity,
          lastModified: nowTimestamp,
          synced: false,
          updated_at: nowIso
        };
        await syncService.queueOperation('products', 'update', updatedProduct);
        toast.success(`Returned ${part.quantity}x ${product.name} to stock (${product.stock_quantity} → ${updatedProduct.stock_quantity})`);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to return part");
    } finally {
      setLoading(false);
    }
  };

  const activePartsTotal = reservedParts
    .filter(p => p.status !== 'returned')
    .reduce((sum, p) => sum + (p.unit_price * p.quantity), 0);

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5" /> Consumable Repair Parts & Stock Reservation
        </Label>
        <span className="text-xs font-semibold">Parts Total: {formatCurrency(activePartsTotal)}</span>
      </div>

      {/* Part Attach Form */}
      <div className="flex gap-2 items-end bg-muted/20 p-2.5 rounded-lg border">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Select Part / Product</Label>
          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Choose repair part..." />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — Stock: {p.stock_quantity} ({formatCurrency(p.retail_price)})
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

        <Button size="sm" className="h-8 text-xs" onClick={handleReservePart} disabled={loading}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Reserve
        </Button>
      </div>

      {/* Reserved Parts List */}
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="h-8">
              <TableHead className="text-xs py-1">Part Name</TableHead>
              <TableHead className="text-xs py-1">Qty</TableHead>
              <TableHead className="text-xs py-1">Unit Price</TableHead>
              <TableHead className="text-xs py-1">Status</TableHead>
              <TableHead className="text-xs py-1 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservedParts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">
                  No repair parts attached to this ticket yet.
                </TableCell>
              </TableRow>
            ) : (
              reservedParts.map((part) => (
                <TableRow key={part.id} className="h-9 text-xs">
                  <TableCell className="font-medium py-1">
                    {part.product?.name || 'Unknown Part'}
                  </TableCell>
                  <TableCell className="py-1">{part.quantity}</TableCell>
                  <TableCell className="py-1">{formatCurrency(part.unit_price)}</TableCell>
                  <TableCell className="py-1">
                    <Badge variant={part.status === 'returned' ? 'outline' : 'secondary'} className="text-[10px] px-1.5 py-0">
                      {part.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1 text-right">
                    {part.status !== 'returned' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10"
                        disabled={loading}
                        onClick={() => handleReturnPart(part)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Return Stock
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
