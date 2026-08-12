import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { syncService } from "@/lib/syncService";
import { CachedProduct, CachedProductVariant } from "@/lib/db";

interface DeviceIdentifierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: CachedProduct[];
  variants: CachedProductVariant[];
}

export const DeviceIdentifierDialog = ({ open, onOpenChange, products, variants }: DeviceIdentifierDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [imei, setImei] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [conditionGrade, setConditionGrade] = useState<string>("new");
  const [status, setStatus] = useState<string>("in_stock");
  const [cost, setCost] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [notes, setNotes] = useState("");

  const filteredVariants = variants.filter(v => v.product_id === selectedProductId);

  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    setSelectedVariantId("");
    const p = products.find(prod => prod.id === productId);
    if (p) {
      if (p.cost_price) setCost(p.cost_price.toString());
      if (p.retail_price) setSellPrice(p.retail_price.toString());
    }
  };

  const handleSave = async () => {
    if (!selectedProductId) {
      toast.error("Please select a product");
      return;
    }
    if (!imei && !serialNumber) {
      toast.error("Either IMEI or Serial Number is required");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const deviceData = {
        id: crypto.randomUUID(),
        user_id: user.id,
        product_id: selectedProductId,
        product_variant_id: selectedVariantId || null,
        imei: imei || null,
        serial_number: serialNumber || null,
        condition_grade: conditionGrade as any,
        status: status as any,
        cost: parseFloat(cost) || 0,
        sell_price: parseFloat(sellPrice) || 0,
        notes: notes || null,
        synced: false,
        lastModified: Date.now(),
        updated_at: new Date().toISOString()
      };

      await syncService.queueOperation('deviceIdentifiers', 'insert', deviceData);
      toast.success("Device identifier registered successfully");
      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to register device");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedProductId("");
    setSelectedVariantId("");
    setImei("");
    setSerialNumber("");
    setConditionGrade("new");
    setStatus("in_stock");
    setCost("");
    setSellPrice("");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Register Serialized Device (IMEI/Serial)</DialogTitle>
          <DialogDescription>
            Add a unique IMEI or serial number for inventory tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Product *</Label>
            <Select value={selectedProductId} onValueChange={handleProductChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} {p.is_serialized ? "(Serialized)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredVariants.length > 0 && (
            <div className="space-y-2">
              <Label>Variant (Optional)</Label>
              <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select variant" />
                </SelectTrigger>
                <SelectContent>
                  {filteredVariants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.variant_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>IMEI</Label>
              <Input
                placeholder="15-digit IMEI"
                value={imei}
                onChange={(e) => setImei(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Serial Number</Label>
              <Input
                placeholder="S/N"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Condition Grade</Label>
              <Select value={conditionGrade} onValueChange={setConditionGrade}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Brand New</SelectItem>
                  <SelectItem value="refurbished_a">Refurbished Grade A</SelectItem>
                  <SelectItem value="refurbished_b">Refurbished Grade B</SelectItem>
                  <SelectItem value="used">Used / Open Box</SelectItem>
                  <SelectItem value="defective">Defective / Parts</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_stock">In Stock</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="in_repair">In Repair</SelectItem>
                  <SelectItem value="scrapped">Scrapped</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Cost Price</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Target Sell Price</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Input
              placeholder="e.g. Minor scratches on back glass"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Registering..." : "Register Device"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
