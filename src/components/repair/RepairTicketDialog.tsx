import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wrench, Truck, Package, Edit3, List, DollarSign, ShieldCheck, Sparkles } from "lucide-react";
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
  
  // Total Price charged to Customer
  const [totalCustomerPrice, setTotalCustomerPrice] = useState("");
  const [depositPaid, setDepositPaid] = useState("");
  const [status, setStatus] = useState<RepairStatus>("received");
  const [notes, setNotes] = useState("");

  // Part & Wholesaler Attachment State
  const [partSourceMode, setPartSourceMode] = useState<'inventory' | 'custom'>('custom');
  const [attachPartProductId, setAttachPartProductId] = useState<string>("");
  const [customPartName, setCustomPartName] = useState<string>("");
  const [attachWholesalerId, setAttachWholesalerId] = useState<string>("");
  const [attachPartQty, setAttachPartQty] = useState<string>("1");
  const [attachPartUnitCost, setAttachPartUnitCost] = useState<string>(""); // Wholesaler Cost (e.g. 1800)

  // Add-on State (e.g., Tempered Glass, Protector)
  const [addonName, setAddonName] = useState<string>("");
  const [addonPrice, setAddonPrice] = useState<string>(""); // e.g. 200

  const products = useLiveQuery(() => db.products.toArray()) || [];
  const wholesalers = useLiveQuery(() => db.wholesalers.toArray()) || [];

  useEffect(() => {
    if (ticketToEdit) {
      setSelectedCustomerId(ticketToEdit.customer_id || "");
      setSelectedDeviceId(ticketToEdit.device_identifier_id || "");
      setDeviceName(ticketToEdit.device_name);
      setSerialOrImei(ticketToEdit.serial_or_imei || "");
      setIssueDescription(ticketToEdit.issue_description);
      setTotalCustomerPrice(ticketToEdit.estimated_cost?.toString() || "");
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
      setAttachPartUnitCost(String(prod.cost_price || prod.retail_price || 0));
    }
  };

  // Real-time Financial Calculations
  const partCostNum = (parseFloat(attachPartUnitCost) || 0) * (parseInt(attachPartQty) || 1);
  const addonPriceNum = parseFloat(addonPrice) || 0;
  const customerTotalNum = parseFloat(totalCustomerPrice) || 0;
  const netShopProfit = customerTotalNum - partCostNum - addonPriceNum;

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
          estimated_cost: customerTotalNum,
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
          estimated_cost: customerTotalNum,
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

        // 1. HANDLE REPAIR PART (Wholesaler / Inventory / Custom)
        let resolvedProductId = attachPartProductId;
        let resolvedPartName = "";
        const qty = parseInt(attachPartQty) || 1;
        const partCost = parseFloat(attachPartUnitCost) || 0;

        if (partSourceMode === 'custom' && customPartName.trim()) {
          const newProdId = crypto.randomUUID();
          resolvedPartName = customPartName.trim();
          const newProduct: CachedProduct = {
            id: newProdId,
            user_id: activeUserId,
            name: resolvedPartName,
            sku: `PART-${Math.floor(10000 + Math.random() * 90000)}`,
            cost_price: partCost,
            retail_price: partCost,
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
          const partRecord: CachedRepairTicketPart = {
            id: crypto.randomUUID(),
            user_id: activeUserId,
            repair_ticket_id: ticketId,
            product_id: resolvedProductId,
            quantity: qty,
            unit_cost: partCost,
            unit_price: partCost,
            status: 'reserved',
            item_type: 'part',
            wholesaler_id: attachWholesalerId || null,
            synced: false,
            lastModified: nowTimestamp,
            created_at: nowIso,
            updated_at: nowIso
          };
          await syncService.queueOperation('repairTicketParts', 'insert', partRecord);

          // RECORD TO WHOLESALER SCREEN
          if (attachWholesalerId) {
            const wholesaler = wholesalers.find(w => w.id === attachWholesalerId);
            const intakeRecord: CachedWholesalerIntake = {
              id: crypto.randomUUID(),
              user_id: activeUserId,
              wholesaler_id: attachWholesalerId,
              product_id: resolvedProductId,
              item_name: `${resolvedPartName} (Ticket ${ticketNumber})`,
              quantity: qty,
              agreed_unit_cost: partCost,
              total_cost: qty * partCost,
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
            toast.success(`Logged ${formatCurrency(qty * partCost)} cost to Wholesaler "${wholesaler?.name || 'Wholesaler'}" screen`);
          }
        }

        // 2. HANDLE ADD-ON (e.g. Tempered Glass, Protector)
        if (addonName.trim() && addonPriceNum > 0) {
          const addonProdId = crypto.randomUUID();
          const addonProduct: CachedProduct = {
            id: addonProdId,
            user_id: activeUserId,
            name: addonName.trim(),
            sku: `ADDON-${Math.floor(10000 + Math.random() * 90000)}`,
            cost_price: 0,
            retail_price: addonPriceNum,
            stock_quantity: 0,
            is_repair_part: false,
            synced: false,
            lastModified: nowTimestamp,
            created_at: nowIso,
            updated_at: nowIso
          };
          await syncService.queueOperation('products', 'insert', addonProduct);

          const addonPartRecord: CachedRepairTicketPart = {
            id: crypto.randomUUID(),
            user_id: activeUserId,
            repair_ticket_id: ticketId,
            product_id: addonProdId,
            quantity: 1,
            unit_cost: 0,
            unit_price: addonPriceNum,
            status: 'reserved',
            item_type: 'product',
            wholesaler_id: null,
            synced: false,
            lastModified: nowTimestamp,
            created_at: nowIso,
            updated_at: nowIso
          };
          await syncService.queueOperation('repairTicketParts', 'insert', addonPartRecord);
          toast.success(`Add-on "${addonName.trim()}" attached (${formatCurrency(addonPriceNum)})`);
        }

        toast.success(`Repair Ticket ${ticketNumber} created! Net Profit: ${formatCurrency(netShopProfit)}`);
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
    setTotalCustomerPrice("");
    setDepositPaid("");
    setStatus("received");
    setNotes("");

    setPartSourceMode("custom");
    setAttachPartProductId("");
    setCustomPartName("");
    setAttachWholesalerId("");
    setAttachPartQty("1");
    setAttachPartUnitCost("");

    setAddonName("");
    setAddonPrice("");
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
            Enter device details, wholesaler part cost, add-ons, and total customer price.
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

          {/* 1. REPAIR PART & WHOLESALER SECTION */}
          {!ticketToEdit && (
            <div className="p-3 bg-muted/30 rounded-lg border space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> 1. Sourced Repair Part & Wholesaler
                </Label>
                <Tabs value={partSourceMode} onValueChange={(v: any) => setPartSourceMode(v)} className="h-6">
                  <TabsList className="h-6 p-0.5 text-[10px]">
                    <TabsTrigger value="custom" className="text-[10px] h-5 px-2 flex items-center gap-1">
                      <Edit3 className="h-3 w-3" /> Custom Part
                    </TabsTrigger>
                    <TabsTrigger value="inventory" className="text-[10px] h-5 px-2 flex items-center gap-1">
                      <List className="h-3 w-3" /> From Inventory
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {partSourceMode === 'custom' ? (
                  <div className="space-y-1">
                    <Label className="text-[11px]">Part Name (e.g. iPhone 13 Screen)</Label>
                    <Input
                      placeholder="e.g. iPhone 13 OLED Screen"
                      className="h-8 text-xs"
                      value={customPartName}
                      onChange={(e) => setCustomPartName(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-[11px]">Select Inventory Part</Label>
                    <Select value={attachPartProductId} onValueChange={handleProductSelection}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Choose inventory part..." />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({formatCurrency(p.cost_price || p.retail_price)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Qty</Label>
                    <Input type="number" min="1" className="h-7 text-xs" value={attachPartQty} onChange={(e) => setAttachPartQty(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      Wholesaler Part Cost (e.g. 1800)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="1800"
                      className="h-7 text-xs font-bold border-amber-300 text-amber-700 dark:text-amber-300"
                      value={attachPartUnitCost}
                      onChange={(e) => setAttachPartUnitCost(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. ADD-ON ACCESSORIES SECTION (e.g. Tempered Glass) */}
          {!ticketToEdit && (
            <div className="p-3 bg-muted/20 rounded-lg border space-y-2">
              <Label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" /> 2. Add-on Accessory (Optional, e.g. Tempered Glass)
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Add-on Item Name</Label>
                  <Input
                    placeholder="e.g. Tempered Glass 9D"
                    className="h-8 text-xs"
                    value={addonName}
                    onChange={(e) => setAddonName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Add-on Price (e.g. 200)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="200"
                    className="h-8 text-xs font-semibold"
                    value={addonPrice}
                    onChange={(e) => setAddonPrice(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. TOTAL CUSTOMER PRICE & DEPOSIT */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-primary">Total Price Charged to Customer *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g. 4000"
                className="h-8 text-xs font-bold text-primary text-sm"
                value={totalCustomerPrice}
                onChange={(e) => setTotalCustomerPrice(e.target.value)}
                required
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

          {/* REAL-TIME PROFIT ACCOUNTING SUMMARY BANNER */}
          <div className="p-3 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent rounded-lg border border-emerald-300 dark:border-emerald-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Net Shop Repair Profit:
              </span>
              <span className={`text-base font-extrabold ${netShopProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                {formatCurrency(netShopProfit)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-emerald-200 dark:border-emerald-900/50 pt-1">
              <span>Customer Charge: <strong>{formatCurrency(customerTotalNum)}</strong></span>
              <span>Wholesaler Cost: <strong className="text-amber-600">-{formatCurrency(partCostNum)}</strong></span>
              {addonPriceNum > 0 && <span>Add-on: <strong>-{formatCurrency(addonPriceNum)}</strong></span>}
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
