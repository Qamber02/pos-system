import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, Truck, Plus, Package } from "lucide-react";
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
  const [estimatedCost, setEstimatedCost] = useState("");
  const [depositPaid, setDepositPaid] = useState("");
  const [status, setStatus] = useState<RepairStatus>("received");
  const [notes, setNotes] = useState("");

  // Part & Wholesaler Attachment State (Direct from ticket creation)
  const [attachPartProductId, setAttachPartProductId] = useState<string>("");
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
      setEstimatedCost(ticketToEdit.estimated_cost?.toString() || "");
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
      // Auto adjust estimated cost if 0
      if (!estimatedCost || parseFloat(estimatedCost) === 0) {
        setEstimatedCost(String(prod.retail_price || 0));
      }
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
          estimated_cost: parseFloat(estimatedCost) || 0,
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
          estimated_cost: parseFloat(estimatedCost) || 0,
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

        // If a part/product was selected during intake, attach it!
        if (attachPartProductId) {
          const selectedProd = products.find(p => p.id === attachPartProductId);
          const qty = parseInt(attachPartQty) || 1;
          const cost = parseFloat(attachPartUnitCost) || selectedProd?.cost_price || 0;
          const price = parseFloat(attachPartUnitPrice) || selectedProd?.retail_price || 0;

          // 1. Create Repair Ticket Part
          const partId = crypto.randomUUID();
          const partRecord: CachedRepairTicketPart = {
            id: partId,
            user_id: activeUserId,
            repair_ticket_id: ticketId,
            product_id: attachPartProductId,
            quantity: qty,
            unit_cost: cost,
            unit_price: price,
            status: 'reserved',
            item_type: selectedProd?.is_repair_part ? 'part' : 'product',
            wholesaler_id: attachWholesalerId || null,
            synced: false,
            lastModified: nowTimestamp,
            created_at: nowIso,
            updated_at: nowIso
          };
          await syncService.queueOperation('repairTicketParts', 'insert', partRecord);

          // 2. If stock exists, decrement
          if (selectedProd) {
            const updatedProd: CachedProduct = {
              ...selectedProd,
              stock_quantity: Math.max(0, selectedProd.stock_quantity - qty),
              lastModified: nowTimestamp,
              synced: false,
              updated_at: nowIso
            };
            await syncService.queueOperation('products', 'update', updatedProd);
          }

          // 3. IF A WHOLESALER WAS SELECTED, UPDATE WHOLESALER SCREEN (CONSIGNMENT INTAKE)
          if (attachWholesalerId) {
            const wholesaler = wholesalers.find(w => w.id === attachWholesalerId);
            const intakeId = crypto.randomUUID();
            const totalCost = qty * cost;

            const intakeRecord: CachedWholesalerIntake = {
              id: intakeId,
              user_id: activeUserId,
              wholesaler_id: attachWholesalerId,
              product_id: attachPartProductId,
              item_name: selectedProd ? `${selectedProd.name} (For Ticket ${ticketNumber})` : `Part for Ticket ${ticketNumber}`,
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
            toast.success(`Consignment entry added to Wholesaler screen (${wholesaler?.name || 'Wholesaler'})`);
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
    setEstimatedCost("");
    setDepositPaid("");
    setStatus("received");
    setNotes("");

    setAttachPartProductId("");
    setAttachWholesalerId("");
    setAttachPartQty("1");
    setAttachPartUnitCost("0");
    setAttachPartUnitPrice("0");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            {ticketToEdit ? `Edit Ticket ${ticketToEdit.ticket_number}` : "Log New Repair Ticket"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Record device details, customer information, reported issues, and attach parts.
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

          {/* ATTACH PART & WHOLESALER SECTION (NEW FEATURE) */}
          {!ticketToEdit && (
            <div className="p-3 bg-muted/30 rounded-lg border space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Attach Repair Part / Wholesaler (Optional)
                </Label>
                <span className="text-[10px] text-muted-foreground">Auto-updates Wholesaler Screen</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Select Part / Product</Label>
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

                <div className="space-y-1">
                  <Label className="text-[11px] flex items-center gap-1">
                    <Truck className="h-3 w-3 text-purple-600" /> Sourced Wholesaler
                  </Label>
                  <Select value={attachWholesalerId} onValueChange={setAttachWholesalerId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Taken from Wholesaler?" />
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

              {attachPartProductId && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Qty</Label>
                    <Input type="number" min="1" className="h-7 text-xs" value={attachPartQty} onChange={(e) => setAttachPartQty(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Agreed Unit Cost (Wholesaler)</Label>
                    <Input type="number" step="0.01" className="h-7 text-xs font-semibold" value={attachPartUnitCost} onChange={(e) => setAttachPartUnitCost(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Part Retail Price</Label>
                    <Input type="number" step="0.01" className="h-7 text-xs font-semibold" value={attachPartUnitPrice} onChange={(e) => setAttachPartUnitPrice(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Financials & Status */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Estimated Cost</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                className="h-8 text-xs font-semibold"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
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
