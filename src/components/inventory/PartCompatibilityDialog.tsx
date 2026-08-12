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

interface PartCompatibilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: CachedProduct[];
  variants: CachedProductVariant[];
}

export const PartCompatibilityDialog = ({ open, onOpenChange, products, variants }: PartCompatibilityDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [deviceModel, setDeviceModel] = useState("");
  const [notes, setNotes] = useState("");

  const filteredVariants = variants.filter(v => v.product_id === selectedProductId);

  const handleSave = async () => {
    if (!selectedProductId) {
      toast.error("Please select a product");
      return;
    }
    if (!deviceModel.trim()) {
      toast.error("Device model is required (e.g. iPhone 13 Pro)");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const compatData = {
        id: crypto.randomUUID(),
        user_id: user.id,
        product_id: selectedProductId,
        product_variant_id: selectedVariantId || null,
        device_model: deviceModel.trim(),
        notes: notes || null,
        synced: false,
        lastModified: Date.now(),
        updated_at: new Date().toISOString()
      };

      await syncService.queueOperation('partCompatibility', 'insert', compatData);
      toast.success(`Mapped compatibility for ${deviceModel}`);
      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to add compatibility mapping");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedProductId("");
    setSelectedVariantId("");
    setDeviceModel("");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Part Model Compatibility</DialogTitle>
          <DialogDescription>
            Map a repair part product to compatible phone models.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Repair Part / Product *</Label>
            <Select value={selectedProductId} onValueChange={(val) => { setSelectedProductId(val); setSelectedVariantId(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select repair part" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} {p.is_repair_part ? "(Repair Part)" : ""}
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

          <div className="space-y-2">
            <Label>Compatible Device Model *</Label>
            <Input
              placeholder="e.g. iPhone 13 Pro, Samsung A52, Redmi Note 11"
              value={deviceModel}
              onChange={(e) => setDeviceModel(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Input
              placeholder="e.g. Compatible only with A2638 global version"
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
            {loading ? "Saving..." : "Add Mapping"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
