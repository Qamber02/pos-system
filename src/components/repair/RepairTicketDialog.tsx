import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wrench, Truck, Package, Edit3, List, Calculator } from "lucide-react";
import { toast } from "sonner";
import { syncService } from "@/lib/syncService";
import { db, CachedCustomer, CachedDeviceIdentifier, CachedRepairTicket, RepairStatus, CachedRepairTicketPart, CachedWholesalerIntake, CachedProduct } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface RepairTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: CachedCustomer[];
  deviceIdentifiers: CachedDeviceIdentifier[];
  ticketToEdit?: CachedRepairTicket | null;
}

export const RepairTicketDialog = ({
  open,
  onOpenChange,
  customers,
  deviceIdentifiers,
  ticketToEdit
}: RepairTicketDialogProps) => {
  const formatCurrency = useFormatCurrency();
  const [loading, setLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [deviceName, setDeviceName] = useState("");
  const [serialOrImei, setSerialOrImei] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [repairCost, setRepairCost] = useState("");
  const [depositPaid, setDepositPaid] = useState("");
  const [status, setStatus] = useState<RepairStatus>("received");
  const [notes, setNotes] = useState("");

  // Part & Wholesaler Attachment State (Direct from ticket creation)
  const [partSourceMode, setPartSourceMode] = useState<'inventory' | 'custom'>('inventory');
  const [attachPartProductId, setAttachPartProductId] = useState<string>("");
  const [customPartName, setCustomPartName] = useState<string>("");
  const [attachWholesalerId, setAttachWholesalerId] = useState<string>("");
  const [attachPartQty, setAttachPartQty] = useState<string>("1");
  const [attachPartUnitCost, setAttachPartUnitCost] = useState<string>("0");
  const [attachPartUnitPrice, setAttachPartUnitPrice] = useState<string>("0");

  const products = useLiveQuery(() => db.products.toArray()) || [];
  const wholesalers = useLiveQuery(() => db.wholesalers.toArray()) || [];

  useEffect(() => {
    if (ticketToEdit) {
      setSelectedCustomerId(ticketToEdit.customer_id || "");
      setSelectedDeviceId(ticketToEdit.device_identifier_id || "");
      setDeviceName(ticketToEdit.device_name);
      setSerialOrImei(ticketToEdit.serial_or_imei || "");
      setIssueDescription(ticketToEdit.issue_description);
      setRepairCost(ticketToEdit.estimated_cost?.toString() || "");
      setDepositPaid(ticketToEdit.deposit_paid?.toString() || "");
      setStatus(ticketToEdit.status);
      setNotes(ticketToEdit.notes || "");
    } else {
      resetForm();
    }
  }, [ticketToEdit, open]);

  const handleDeviceSelection = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    const dev = deviceIdentifiers.find(d => d.id === deviceId);
    if (dev) {
      if (dev.imei || dev.serial_number) {
        setSerialOrImei(dev.imei || dev.serial_number || "");
      }
    }
  };

  const handleProductSelection = (productId: string) => {
    setAttachPartProductId(productId);
    const prod = products.find(p => p.id === productId);
    if (prod) {
      setAttachPartUnitCost(String(prod.cost_price || 0));
      setAttachPartUnitPrice(String(prod.retail_price || 0));
    }
  };

  const handleSave = async () => {
    if (!deviceName.trim()) {
      toast.error("Device name is required (e.g. iPhone 13 Pro)");
      return;
    }
    if (!issueDescription.trim()) {
      toast.error("Issue description is required");
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

      if (ticketToEdit) {
        // Update existing ticket
        const updatedTicket: CachedRepairTicket = {
          ...ticketToEdit,
          customer_id: selectedCustomerId || null,
          device_identifier_id: selectedDeviceId || null,
          device_name: deviceName.trim(),
          serial_or_imei: serialOrImei.trim() || null,
          issue_description: issueDescription.trim(),
          estimated_cost: parseFloat(repairCost) || 0,
          deposit_paid: parseFloat(depositPaid) || 0,
          status,
          notes: notes.trim() || null,
          synced: false,
          lastModified: nowTimestamp,
          updated_at: nowIso
        };

        await syncService.queueOperation('repairTickets', 'update', updatedTicket);

        // Record history log if status changed
        if (ticketToEdit.status !== status) {
          const historyEntry = {
            id: crypto.randomUUID(),
            repair_ticket_id: ticketToEdit.id,
            user_id: activeUserId,
            previous_status: ticketToEdit.status,
            new_status: status,
            changed_by: activeUserId,
            notes: notes.trim() || `Status updated to ${status.replace('_', ' ')}`,
            synced: false,
            lastModified: nowTimestamp,
            created_at: nowIso
          };
          await syncService.queueOperation('repairTicketHistory', 'insert', historyEntry);
        }

        toast.success(`Ticket ${ticketToEdit.ticket_number} updated`);
      } else {
        // Create new ticket
        const ticketId = crypto.randomUUID();
        const ticketNumber = `REP-${Math.floor(1000 + Math.random() * 9000)}`;

        const newTicket: CachedRepairTicket = {
          id: ticketId,
          user_id: activeUserId,
          ticket_number: ticketNumber,
          customer_id: selectedCustomerId || null,
          device_identifier_id: selectedDeviceId || null,
          device_name: deviceName.trim(),
          serial_or_imei: serialOrImei.trim() || null,
          issue_description: issueDescription.trim(),
          estimated_cost: parseFloat(repairCost) || 0,
          deposit_paid: parseFloat(depositPaid) || 0,
          status,
          notes: notes.trim() || null,
          synced: false,
          lastModified: nowTimestamp,
          created_at: nowIso,
          updated_at: nowIso
        };

        await syncService.queueOperation('repairTickets', 'insert', newTicket);

        // Initial history log entry
        const historyEntry = {
          id: crypto.randomUUID(),
          repair_ticket_id: ticketId,
          user_id: activeUserId,
          previous_status: null,
          new_status: status,
          changed_by: activeUserId,
          notes: "Ticket created and received at shop",
          synced: false,
          lastModified: nowTimestamp,
          created_at: nowIso
        };
        await syncService.queueOperation('repairTicketHistory', 'insert', historyEntry);

        // Handle Part / Wholesaler Attachment (Inventory OR Custom Part Name)
        let resolvedProductId = attachPartProductId;
        let resolvedPartName = "";
        const qty = parseInt(attachPartQty) || 1;
        const cost = parseFloat(attachPartUnitCost) || 0;
        const price = parseFloat(attachPartUnitPrice) || 0;

        if (partSourceMode === 'custom' && customPartName.trim()) {
          // Auto-create product in catalog for custom part
          const newProdId = crypto.randomUUID();
          resolvedPartName = customPartName.trim();
          const newProduct: CachedProduct = {
            id: newProdId,
            user_id: activeUserId,
            name: resolvedPartName,
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
          await syncService.queueOperation('products', 'insert', newProduct);
          resolvedProductId = newProdId;
        } else if (attachPartProductId) {
          const selectedProd = products.find(p => p.id === attachPartProductId);
          resolvedPartName = selectedProd?.name || "Repair Part";
        }

        if (resolvedProductId) {
          // 1. Create Repair Ticket Part record
          const partId = crypto.randomUUID();
          const partRecord: CachedRepairTicketPart = {
            id: partId,
            user_id: activeUserId,
            repair_ticket_id: ticketId,
            product_id: resolvedProductId,
            quantity: qty,
            unit_cost: cost,
            unit_price: price,
            status: 'reserved',
            item_type: 'part',
            wholesaler_id: attachWholesalerId || null,
            synced: false,
            lastModified: nowTimestamp,
            created_at: nowIso,
            updated_at: nowIso
          };
          await syncService.queueOperation('repairTicketParts', 'insert', partRecord);

          // 2. IF A WHOLESALER WAS SELECTED, RECORD CONSIGNMENT INTAKE TO WHOLESALER SCREEN
          if (attachWholesalerId) {
            const wholesaler = wholesalers.find(w => w.id === attachWholesalerId);
            const intakeId = crypto.randomUUID();
            const totalCost = qty * cost;

            const intakeRecord: CachedWholesalerIntake = {
              id: intakeId,
              user_id: activeUserId,
              wholesaler_id: attachWholesalerId,
              product_id: resolvedProductId,
              item_name: `${resolvedPartName} (Ticket ${ticketNumber})`,
              quantity: qty,
              agreed_unit_cost: cost,
              total_cost: totalCost,
              amount_paid: 0,
              intake_date: nowIso,
              status: 'pending',
              notes: `Sourced for Repair Ticket ${ticketNumber} (${deviceName.trim()})`,
              synced: false,
              lastModified: nowTimestamp,
              created_at: nowIso,
              updated_at: nowIso
            };

            await syncService.queueOperation('wholesalerIntakes', 'insert', intakeRecord);
            toast.success(`Consignment entry recorded for ${wholesaler?.name || 'Wholesaler'} screen`);
          }
        }

        toast.success(`Repair Ticket ${ticketNumber} created`);
      }

      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save repair ticket");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedCustomerId("");
    setSelectedDeviceId("");
    setDeviceName("");
    setSerialOrImei("");
    setIssueDescription("");
    setRepairCost("");
    setDepositPaid("");
    setStatus("received");
    setNotes("");

    setPartSourceMode("inventory");
    setAttachPartProductId("");
    setCustomPartName("");
    setAttachWholesalerId("");
    setAttachPartQty("1");
    setAttachPartUnitCost("0");
    setAttachPartUnitPrice("0");
  };

  // Financial Calculations Preview
  const numRepairCost = parseFloat(repairCost) || 0;
  const numPartPrice = (attachPartProductId || customPartName.trim()) ? ((parseFloat(attachPartUnitPrice) || 0) * (parseInt(attachPartQty) || 1)) : 0;
  const totalCalculatedInvoice = numRepairCost + numPartPrice;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            {ticketToEdit ? `Edit Ticket ${ticketToEdit.ticket_number}` : "Log New Repair Ticket"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Record device details, customer information, repair cost, and attach parts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3.5 py-1 text-xs">
          {/* Customer & Registered Device */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Customer (Optional)</Label>
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Registered Device (Optional)</Label>
              <Select value={selectedDeviceId} onValueChange={handleDeviceSelection}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select IMEI device" />
                </SelectTrigger>
                <SelectContent>
                  {deviceIdentifiers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.imei || d.serial_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Device Name & IMEI */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Device Name / Model *</Label>
              <Input
                placeholder="e.g. iPhone 13 Pro Max"
                className="h-8 text-xs"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">IMEI / Serial Number</Label>
              <Input
                placeholder="15-digit IMEI or S/N"
                className="h-8 text-xs"
                value={serialOrImei}
                onChange={(e) => setSerialOrImei(e.target.value)}
              />
            </div>
          </div>

          {/* Reported Issue */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">Reported Problem / Issue *</Label>
            <Textarea
              placeholder="e.g. Cracked screen, battery drain, liquid damage diagnosis"
              rows={2}
              className="text-xs"
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              required
            />
          </div>

          {/* ATTACH PART & WHOLESALER SECTION (INVENTORY OR CUSTOM PART NAME) */}
          {!ticketToEdit && (
            <div className="p-3 bg-muted/30 rounded-lg border space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Attach Repair Part / Wholesaler (Optional)
                </Label>
                <Tabs value={partSourceMode} onValueChange={(v: any) => setPartSourceMode(v)} className="h-6">
                  <TabsList className="h-6 p-0.5 text-[10px]">
                    <TabsTrigger value="inventory" className="text-[10px] h-5 px-2 flex items-center gap-1">
                      <List className="h-3 w-3" /> Inventory
                    </TabsTrigger>
                    <TabsTrigger value="custom" className="text-[10px] h-5 px-2 flex items-center gap-1">
                      <Edit3 className="h-3 w-3" /> Custom Part
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {partSourceMode === 'inventory' ? (
                  <div className="space-y-1">
                    <Label className="text-[11px]">Select Inventory Part</Label>
                    <Select value={attachPartProductId} onValueChange={handleProductSelection}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Choose inventory part..." />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({formatCurrency(p.retail_price)}) — Stock: {p.stock_quantity}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-[11px]">Write Custom Part Name *</Label>
                    <Input
                      placeholder="e.g. iPhone 13 OLED Screen"
                      className="h-8 text-xs"
                      value={customPartName}
                      onChange={(e) => setCustomPartName(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-[11px] flex items-center gap-1">
                    <Truck className="h-3 w-3 text-purple-600" /> Sourced Wholesaler
                  </Label>
                  <Select value={attachWholesalerId} onValueChange={setAttachWholesalerId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select Wholesaler..." />
                    </SelectTrigger>
                    <SelectContent>
                      {wholesalers.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} {w.contact_person ? `(${w.contact_person})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(attachPartProductId || customPartName.trim()) && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Qty</Label>
                    <Input type="number" min="1" className="h-7 text-xs" value={attachPartQty} onChange={(e) => setAttachPartQty(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Part Cost (Wholesaler)</Label>
                    <Input type="number" step="0.01" className="h-7 text-xs font-semibold text-amber-600" value={attachPartUnitCost} onChange={(e) => setAttachPartUnitCost(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Part Price (Customer)</Label>
                    <Input type="number" step="0.01" className="h-7 text-xs font-semibold text-primary" value={attachPartUnitPrice} onChange={(e) => setAttachPartUnitPrice(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Financial Summary & Live Total Breakdown */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">Repair Cost (Labor Fee) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                className="h-8 text-xs font-bold"
                value={repairCost}
                onChange={(e) => setRepairCost(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Deposit Paid</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                className="h-8 text-xs font-semibold text-emerald-600"
                value={depositPaid}
                onChange={(e) => setDepositPaid(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Initial Status</Label>
              <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="diagnosing">Diagnosing</SelectItem>
                  <SelectItem value="awaiting_approval">Awaiting Approval</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="awaiting_parts">Awaiting Parts</SelectItem>
                  <SelectItem value="in_repair">In Repair</SelectItem>
                  <SelectItem value="qc_testing">QC / Testing</SelectItem>
                  <SelectItem value="ready_for_pickup">Ready for Pickup</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Live Total Invoice Calculation Preview */}
          <div className="p-2.5 bg-primary/5 rounded border border-primary/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-medium">
              <Calculator className="h-4 w-4 text-primary" />
              <span>Total Invoice Preview:</span>
              <span className="text-muted-foreground">
                (Repair: {formatCurrency(numRepairCost)} + Part: {formatCurrency(numPartPrice)})
              </span>
            </div>
            <div className="font-extrabold text-sm text-primary">
              {formatCurrency(totalCalculatedInvoice)}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">Technician Notes</Label>
            <Textarea
              placeholder="Additional repair notes or condition details upon intake"
              rows={2}
              className="text-xs"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : (ticketToEdit ? "Save Changes" : "Create Ticket")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
