import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Wrench, Truck, Package, Edit3, List, ShieldCheck, Sparkles, Cpu, Code, X, PlusCircle, DollarSign, Percent, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { syncService } from "@/lib/syncService";
import { db, CachedCustomer, CachedDeviceIdentifier, CachedRepairTicket, RepairStatus, CachedRepairTicketPart, CachedRepairTicketPartHistory, CachedWholesalerIntake, CachedWholesalerPayment, CachedProduct } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface RepairTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: CachedCustomer[];
  deviceIdentifiers: CachedDeviceIdentifier[];
  ticketToEdit?: CachedRepairTicket | null;
}

const SOFTWARE_PRESETS = [
  "OS Reinstall / Flashing",
  "FRP / Google Account Unlock",
  "Bootloop / Restart Fix",
  "Screen Lock / Password Bypass",
  "Data Backup & Recovery",
  "Software Bug / Freeze Fix",
  "Network / SIM Unlock"
];

const ADDON_PRESETS = [
  { name: "9D Tempered Glass", defaultPrice: "200", defaultCost: "100" },
  { name: "UV Screen Protector", defaultPrice: "400", defaultCost: "200" },
  { name: "Camera Lens Guard", defaultPrice: "150", defaultCost: "50" },
  { name: "Shockproof Case", defaultPrice: "300", defaultCost: "120" },
  { name: "Software License Key", defaultPrice: "500", defaultCost: "250" },
];

export const RepairTicketDialog = ({
  open,
  onOpenChange,
  customers,
  deviceIdentifiers,
  ticketToEdit
}: RepairTicketDialogProps) => {
  const formatCurrency = useFormatCurrency();
  const [loading, setLoading] = useState(false);

  // Repair Type: Hardware (parts + labor) vs Software (flashing/OS/unlocks)
  const [repairType, setRepairType] = useState<'hardware' | 'software'>('hardware');

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

  // Part & Wholesaler Attachment State (Hardware Repairs)
  const [partSourceMode, setPartSourceMode] = useState<'inventory' | 'custom'>('custom');
  const [attachPartProductId, setAttachPartProductId] = useState<string>("");
  const [customPartName, setCustomPartName] = useState<string>("");
  const [attachWholesalerId, setAttachWholesalerId] = useState<string>("");
  const [attachWholesalerPaid, setAttachWholesalerPaid] = useState<boolean>(false);
  const [attachPartQty, setAttachPartQty] = useState<string>("1");
  const [attachPartUnitCost, setAttachPartUnitCost] = useState<string>(""); // Wholesaler Cost (e.g. 1800)

  // Add-on State with Dedicated Separate Wholesaler Option & Explicit Toggle
  const [includeAddon, setIncludeAddon] = useState<boolean>(false);
  const [addonName, setAddonName] = useState<string>("");
  const [addonPrice, setAddonPrice] = useState<string>(""); // Customer Retail Charge e.g. 200
  const [addonSourceMode, setAddonSourceMode] = useState<'shop' | 'wholesaler'>('wholesaler');
  const [addonWholesalerId, setAddonWholesalerId] = useState<string>(""); // Separate Addon Wholesaler
  const [addonWholesalerPaid, setAddonWholesalerPaid] = useState<boolean>(false);
  const [addonUnitCost, setAddonUnitCost] = useState<string>(""); // Addon Wholesaler cost e.g. 100

  const products = useLiveQuery(() => db.products.toArray()) || [];
  const wholesalers = useLiveQuery(() => db.wholesalers.toArray()) || [];

  useEffect(() => {
    if (ticketToEdit) {
      setRepairType(ticketToEdit.repair_type || 'hardware');
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

  const handleClearHardwarePart = () => {
    setAttachPartProductId("");
    setCustomPartName("");
    setAttachWholesalerId("");
    setAttachWholesalerPaid(false);
    setAttachPartQty("1");
    setAttachPartUnitCost("");
  };

  const handleClearAddon = () => {
    setIncludeAddon(false);
    setAddonName("");
    setAddonPrice("");
    setAddonUnitCost("");
    setAddonWholesalerId("");
    setAddonWholesalerPaid(false);
    setAddonSourceMode("wholesaler");
  };

  const handleSelectAddonPreset = (preset: typeof ADDON_PRESETS[0]) => {
    setIncludeAddon(true);
    setAddonName(preset.name);
    setAddonPrice(preset.defaultPrice);
    setAddonUnitCost(preset.defaultCost);
  };

  const applySoftwarePreset = (preset: string) => {
    if (!issueDescription.trim()) {
      setIssueDescription(preset);
    } else if (!issueDescription.includes(preset)) {
      setIssueDescription(`${issueDescription}, ${preset}`);
    }
  };

  // Strict Real-time Financial Calculations (Zero lingering costs)
  const isPartConfigured = repairType === 'hardware' && Boolean(customPartName.trim() || attachPartProductId);
  const partCostNum = isPartConfigured ? ((parseFloat(attachPartUnitCost) || 0) * (parseInt(attachPartQty) || 1)) : 0;

  // Add-on cost is counted when includeAddon is true AND addonName is specified
  const isAddonActive = includeAddon && addonName.trim().length > 0;
  const addonCostNum = isAddonActive ? (parseFloat(addonUnitCost) || 0) : 0;
  const addonPriceNum = isAddonActive ? (parseFloat(addonPrice) || 0) : 0;

  const customerTotalNum = parseFloat(totalCustomerPrice) || 0;
  const totalDirectCosts = partCostNum + addonCostNum;
  const netShopProfit = customerTotalNum - totalDirectCosts;
  const profitMarginPercent = customerTotalNum > 0 ? Math.round((netShopProfit / customerTotalNum) * 100) : 0;

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
          repair_type: repairType,
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
        const ticketNumber = `REP-${Date.now().toString().slice(-6)}`;

        const newTicket: CachedRepairTicket = {
          id: ticketId,
          user_id: activeUserId,
          ticket_number: ticketNumber,
          customer_id: selectedCustomerId || null,
          device_identifier_id: selectedDeviceId || null,
          device_name: deviceName.trim(),
          serial_or_imei: serialOrImei.trim() || null,
          issue_description: issueDescription.trim(),
          repair_type: repairType,
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
          notes: `Ticket created (${repairType === 'software' ? 'Software Service' : 'Hardware Repair'})`,
          synced: false,
          lastModified: nowTimestamp,
          created_at: nowIso
        };
        await syncService.queueOperation('repairTicketHistory', 'insert', historyEntry);

        // 1. HANDLE REPAIR PART (Hardware Repairs only)
        if (repairType === 'hardware' && isPartConfigured) {
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

            // Audit history log for part
            const partHistoryEntry: CachedRepairTicketPartHistory = {
              id: crypto.randomUUID(),
              repair_ticket_part_id: partRecord.id,
              repair_ticket_id: ticketId,
              user_id: activeUserId,
              previous_status: null,
              new_status: 'reserved',
              reason: `Attached part ${resolvedPartName} (Cost: ${partCost}, Price: ${partCost})${attachWholesalerId ? ' [Wholesaler Consignment]' : ''}`,
              changed_by: activeUserId,
              synced: false,
              lastModified: nowTimestamp,
              created_at: nowIso
            };
            await syncService.queueOperation('repairTicketPartHistory', 'insert', partHistoryEntry);

            // Record to main part wholesaler screen
            if (attachWholesalerId) {
              const wholesaler = wholesalers.find(w => w.id === attachWholesalerId);
              const totalCost = qty * partCost;
              const isPaid = attachWholesalerPaid;
              const intakeId = crypto.randomUUID();

              const intakeRecord: CachedWholesalerIntake = {
                id: intakeId,
                user_id: activeUserId,
                wholesaler_id: attachWholesalerId,
                product_id: resolvedProductId,
                item_name: `${resolvedPartName} (Ticket ${ticketNumber})`,
                quantity: qty,
                agreed_unit_cost: partCost,
                total_cost: totalCost,
                amount_paid: isPaid ? totalCost : 0,
                intake_date: nowIso,
                status: isPaid ? 'paid' : 'pending',
                notes: `Sourced for Repair Ticket ${ticketNumber} (${deviceName.trim()})${isPaid ? ' - Paid upfront' : ' - Pending credit'}`,
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
                  wholesaler_id: attachWholesalerId,
                  intake_id: intakeId,
                  amount: totalCost,
                  payment_method: 'cash',
                  payment_date: nowIso,
                  notes: `Upfront payment for ${resolvedPartName} (Ticket ${ticketNumber})`,
                  synced: false,
                  lastModified: nowTimestamp,
                  created_at: nowIso
                };
                await syncService.queueOperation('wholesalerPayments', 'insert', paymentRecord);
              }

              toast.success(`Logged ${formatCurrency(totalCost)} part cost to Wholesaler "${wholesaler?.name || 'Wholesaler'}" (${isPaid ? 'PAID' : 'PENDING CREDIT'})`);
            }
          }
        }

        // 2. HANDLE ADD-ON ACCESSORY (Separate Wholesaler Option)
        if (isAddonActive) {
          const addonCost = parseFloat(addonUnitCost) || 0;
          const targetAddonWholesalerId = addonSourceMode === 'wholesaler' ? (addonWholesalerId || null) : null;

          const addonProdId = crypto.randomUUID();
          const addonProduct: CachedProduct = {
            id: addonProdId,
            user_id: activeUserId,
            name: addonName.trim(),
            sku: `ADDON-${Math.floor(10000 + Math.random() * 90000)}`,
            cost_price: addonCost,
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
            unit_cost: addonCost,
            unit_price: addonPriceNum,
            status: 'reserved',
            item_type: 'product',
            wholesaler_id: targetAddonWholesalerId,
            synced: false,
            lastModified: nowTimestamp,
            created_at: nowIso,
            updated_at: nowIso
          };
          await syncService.queueOperation('repairTicketParts', 'insert', addonPartRecord);

          // Add history entry for addon part
          const addonPartHistory: CachedRepairTicketPartHistory = {
            id: crypto.randomUUID(),
            repair_ticket_part_id: addonPartRecord.id,
            repair_ticket_id: ticketId,
            user_id: activeUserId,
            previous_status: null,
            new_status: 'reserved',
            reason: `Attached add-on ${addonName.trim()} (Cost: ${addonCost}, Price: ${addonPriceNum})${targetAddonWholesalerId ? ' [Wholesaler Consignment]' : ''}`,
            changed_by: activeUserId,
            synced: false,
            lastModified: nowTimestamp,
            created_at: nowIso
          };
          await syncService.queueOperation('repairTicketPartHistory', 'insert', addonPartHistory);

          // IF SOURCED FROM SEPARATE ADD-ON WHOLESALER, LOG TO THAT WHOLESALER'S INTAKE SCREEN
          if (targetAddonWholesalerId) {
            const addonWholesaler = wholesalers.find(w => w.id === targetAddonWholesalerId);
            const isAddonPaid = addonWholesalerPaid;
            const addonIntakeId = crypto.randomUUID();

            const intakeRecord: CachedWholesalerIntake = {
              id: addonIntakeId,
              user_id: activeUserId,
              wholesaler_id: targetAddonWholesalerId,
              product_id: addonProdId,
              item_name: `${addonName.trim()} (Ticket ${ticketNumber})`,
              quantity: 1,
              agreed_unit_cost: addonCost,
              total_cost: addonCost,
              amount_paid: isAddonPaid ? addonCost : 0,
              intake_date: nowIso,
              status: isAddonPaid ? 'paid' : 'pending',
              notes: `Add-on accessory sourced for Repair Ticket ${ticketNumber} (${deviceName.trim()})${isAddonPaid ? ' - Paid upfront' : ' - Pending credit'}`,
              synced: false,
              lastModified: nowTimestamp,
              created_at: nowIso,
              updated_at: nowIso
            };

            await syncService.queueOperation('wholesalerIntakes', 'insert', intakeRecord);

            if (isAddonPaid && addonCost > 0) {
              const paymentRecord: CachedWholesalerPayment = {
                id: crypto.randomUUID(),
                user_id: activeUserId,
                wholesaler_id: targetAddonWholesalerId,
                intake_id: addonIntakeId,
                amount: addonCost,
                payment_method: 'cash',
                payment_date: nowIso,
                notes: `Upfront payment for add-on ${addonName.trim()} (Ticket ${ticketNumber})`,
                synced: false,
                lastModified: nowTimestamp,
                created_at: nowIso
              };
              await syncService.queueOperation('wholesalerPayments', 'insert', paymentRecord);
            }

            toast.success(`Logged ${formatCurrency(addonCost)} Add-on cost to Wholesaler "${addonWholesaler?.name || 'Wholesaler'}" (${isAddonPaid ? 'PAID' : 'PENDING CREDIT'})`);
          }

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
    setRepairType("hardware");
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
    setAttachWholesalerPaid(false);
    setAttachPartQty("1");
    setAttachPartUnitCost("");

    setIncludeAddon(false);
    setAddonName("");
    setAddonPrice("");
    setAddonSourceMode("wholesaler");
    setAddonWholesalerId("");
    setAddonWholesalerPaid(false);
    setAddonUnitCost("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto bg-card text-foreground">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2 text-foreground font-bold">
            <Wrench className="h-5 w-5 text-primary" />
            {ticketToEdit ? `Edit Ticket ${ticketToEdit.ticket_number}` : "Log New Repair Ticket"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Select repair mode, specify device details, parts/wholesalers, add-ons, and customer pricing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1 text-xs">
          {/* Repair Service Type Toggle: Hardware vs Software */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted/60 rounded-lg border">
            <button
              type="button"
              onClick={() => { setRepairType("hardware"); }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                repairType === "hardware"
                  ? "bg-background text-primary shadow-sm border border-primary/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Cpu className="h-4 w-4" />
              <span>Hardware Repair</span>
              <span className="text-[10px] font-normal opacity-80">(Parts / Screen / Battery)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRepairType("software");
                handleClearHardwarePart();
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                repairType === "software"
                  ? "bg-background text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-500/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Code className="h-4 w-4" />
              <span>Software Service</span>
              <span className="text-[10px] font-normal opacity-80">(Flashing / OS / Unlock)</span>
            </button>
          </div>

          {/* Customer & Registered Device */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">Customer (Optional)</Label>
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger className="h-8 text-xs bg-background text-foreground border-input">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground">
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">Registered Device (Optional)</Label>
              <Select value={selectedDeviceId} onValueChange={handleDeviceSelection}>
                <SelectTrigger className="h-8 text-xs bg-background text-foreground border-input">
                  <SelectValue placeholder="Select IMEI device" />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground">
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
              <Label className="text-xs font-medium text-foreground">Device Name / Model *</Label>
              <Input
                placeholder="e.g. iPhone 13 Pro Max"
                className="h-8 text-xs bg-background text-foreground"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">IMEI / Serial Number</Label>
              <Input
                placeholder="15-digit IMEI or S/N"
                className="h-8 text-xs bg-background text-foreground"
                value={serialOrImei}
                onChange={(e) => setSerialOrImei(e.target.value)}
              />
            </div>
          </div>

          {/* Reported Issue / Problem */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-foreground">
                {repairType === 'software' ? "Software Service / Issue Description *" : "Reported Problem / Issue *"}
              </Label>
              {repairType === 'software' && (
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1">
                  <Code className="h-3 w-3" /> Quick Presets Available Below
                </span>
              )}
            </div>
            <Textarea
              placeholder={repairType === 'software' ? "e.g. Android FRP Bypass, iOS Restore, Bootloop fix" : "e.g. Cracked screen, battery drain, liquid damage diagnosis"}
              rows={2}
              className="text-xs bg-background text-foreground"
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              required
            />
            {/* Quick Software Service Preset Chips */}
            {repairType === 'software' && (
              <div className="flex flex-wrap gap-1 pt-1">
                {SOFTWARE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applySoftwarePreset(preset)}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 1. HARDWARE REPAIR PART & WHOLESALER SECTION (Only shown when Hardware repair is selected) */}
          {repairType === 'hardware' && !ticketToEdit && (
            <div className="p-3 bg-muted/40 rounded-lg border border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> 1. Sourced Repair Part & Wholesaler
                </Label>
                <div className="flex items-center gap-2">
                  {isPartConfigured && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearHardwarePart}
                      className="h-5 px-1.5 text-[10px] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <X className="h-2.5 w-2.5 mr-0.5" /> Clear Part
                    </Button>
                  )}
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
              </div>

              <div className="grid grid-cols-2 gap-2">
                {partSourceMode === 'custom' ? (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-foreground">Part Name (e.g. iPhone 13 Screen)</Label>
                    <Input
                      placeholder="e.g. iPhone 13 OLED Screen"
                      className="h-8 text-xs bg-background text-foreground"
                      value={customPartName}
                      onChange={(e) => setCustomPartName(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-foreground">Select Inventory Part</Label>
                    <Select value={attachPartProductId} onValueChange={handleProductSelection}>
                      <SelectTrigger className="h-8 text-xs bg-background text-foreground border-input">
                        <SelectValue placeholder="Choose inventory part..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover text-popover-foreground">
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
                  <Label className="text-[11px] flex items-center gap-1 text-foreground">
                    <Truck className="h-3 w-3 text-purple-600" /> Sourced Wholesaler / Reseller
                  </Label>
                  <Select value={attachWholesalerId} onValueChange={setAttachWholesalerId}>
                    <SelectTrigger className="h-8 text-xs bg-background text-foreground border-input">
                      <SelectValue placeholder="Select Wholesaler..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover text-popover-foreground">
                      {wholesalers.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} {w.contact_person ? `(${w.contact_person})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isPartConfigured && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-foreground">Qty</Label>
                    <Input
                      type="number"
                      min="1"
                      className="h-7 text-xs bg-background text-foreground"
                      value={attachPartQty}
                      onChange={(e) => setAttachPartQty(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      Wholesaler Part Cost (e.g. 1800)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="1800"
                      className="h-7 text-xs font-bold border-amber-300 text-amber-700 dark:text-amber-300 bg-background"
                      value={attachPartUnitCost}
                      onChange={(e) => setAttachPartUnitCost(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Wholesaler Payment Status (Paid vs Unpaid Credit) */}
              {attachWholesalerId && isPartConfigured && (
                <div className="flex items-center justify-between pt-1.5 border-t border-border/60">
                  <Label className="text-[10px] font-medium text-foreground flex items-center gap-1">
                    <DollarSign className="h-3 w-3 text-emerald-600" /> Reseller Payment Status:
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAttachWholesalerPaid(false)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1 ${
                        !attachWholesalerPaid
                          ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 font-bold'
                          : 'bg-background text-muted-foreground border-input hover:bg-muted'
                      }`}
                    >
                      <Clock className="h-2.5 w-2.5" /> Unpaid (Credit Consignment)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttachWholesalerPaid(true)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1 ${
                        attachWholesalerPaid
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 font-bold'
                          : 'bg-background text-muted-foreground border-input hover:bg-muted'
                      }`}
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" /> Paid in Full
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. ADD-ON ACCESSORIES SECTION WITH EXPLICIT TOGGLE */}
          {!ticketToEdit && (
            <div className="p-3 bg-blue-50/40 dark:bg-blue-950/20 rounded-lg border border-blue-200/60 dark:border-blue-900/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    id="addon-toggle"
                    checked={includeAddon}
                    onCheckedChange={(checked) => {
                      setIncludeAddon(checked);
                      if (!checked) {
                        handleClearAddon();
                      }
                    }}
                  />
                  <Label htmlFor="addon-toggle" className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5 cursor-pointer">
                    <Sparkles className="h-3.5 w-3.5 text-blue-600" /> 2. Add-on Accessory / Glass Protector
                  </Label>
                </div>

                {isAddonActive && (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] bg-background text-blue-600 border-blue-300">
                      {addonSourceMode === 'wholesaler' ? 'Wholesaler' : 'In-House'}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearAddon}
                      className="h-5 px-1.5 text-[10px] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <X className="h-2.5 w-2.5 mr-0.5" /> Remove
                    </Button>
                  </div>
                )}
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1">
                {ADDON_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleSelectAddonPreset(p)}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100/60 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-200/70 transition-colors"
                  >
                    + {p.name} ({formatCurrency(Number(p.defaultPrice))})
                  </button>
                ))}
              </div>

              {includeAddon && (
                <div className="space-y-2.5 pt-1 border-t border-blue-200/50 dark:border-blue-900/40">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-foreground">Add-on Item Name</Label>
                      <Input
                        placeholder="e.g. 9D Tempered Glass, UV Protector"
                        className="h-8 text-xs bg-background text-foreground"
                        value={addonName}
                        onChange={(e) => setAddonName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-foreground">Customer Retail Price (e.g. 200)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="200"
                        className="h-8 text-xs font-bold text-foreground bg-background"
                        value={addonPrice}
                        onChange={(e) => setAddonPrice(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-medium text-foreground">Sourced From</Label>
                      <Select value={addonSourceMode} onValueChange={(val: any) => setAddonSourceMode(val)}>
                        <SelectTrigger className="h-7 text-xs bg-background text-foreground border-input">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-popover text-popover-foreground">
                          <SelectItem value="wholesaler">Wholesaler Supplier</SelectItem>
                          <SelectItem value="shop">In-House Stock</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {addonSourceMode === 'wholesaler' ? (
                      <>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-medium text-foreground flex items-center gap-1">
                            <Truck className="h-3 w-3 text-purple-600" /> Reseller / Wholesaler
                          </Label>
                          <Select value={addonWholesalerId} onValueChange={setAddonWholesalerId}>
                            <SelectTrigger className="h-7 text-xs font-medium border-purple-300 dark:border-purple-800 bg-background text-foreground">
                              <SelectValue placeholder="Select Wholesaler..." />
                            </SelectTrigger>
                            <SelectContent className="bg-popover text-popover-foreground">
                              {wholesalers.map(w => (
                                <SelectItem key={w.id} value={w.id}>
                                  {w.name} {w.contact_person ? `(${w.contact_person})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                            Wholesaler Cost (e.g. 100)
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="100"
                            className="h-7 text-xs font-bold border-amber-300 text-amber-700 dark:text-amber-300 bg-background"
                            value={addonUnitCost}
                            onChange={(e) => setAddonUnitCost(e.target.value)}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1 col-span-2">
                        <Label className="text-[10px] font-medium text-foreground">In-House Cost Price (Optional)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 50"
                          className="h-7 text-xs bg-background text-foreground"
                          value={addonUnitCost}
                          onChange={(e) => setAddonUnitCost(e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Addon Wholesaler Payment Status (Paid vs Unpaid Credit) */}
                  {addonSourceMode === 'wholesaler' && addonWholesalerId && (
                    <div className="flex items-center justify-between pt-1.5 border-t border-blue-200/50 dark:border-blue-900/40">
                      <Label className="text-[10px] font-medium text-foreground flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-emerald-600" /> Add-on Reseller Payment Status:
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAddonWholesalerPaid(false)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1 ${
                            !addonWholesalerPaid
                              ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 font-bold'
                              : 'bg-background text-muted-foreground border-input hover:bg-muted'
                          }`}
                        >
                          <Clock className="h-2.5 w-2.5" /> Unpaid (Credit)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddonWholesalerPaid(true)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1 ${
                            addonWholesalerPaid
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 font-bold'
                              : 'bg-background text-muted-foreground border-input hover:bg-muted'
                          }`}
                        >
                          <CheckCircle2 className="h-2.5 w-2.5" /> Paid in Full
                        </button>
                      </div>
                    </div>
                  )}

                  {addonPriceNum > 0 && addonCostNum > 0 && (
                    <div className="text-[10px] flex items-center justify-between text-muted-foreground bg-background/80 px-2.5 py-1.5 rounded-md border border-blue-200/50">
                      <span>Customer Charged: <strong className="text-foreground">{formatCurrency(addonPriceNum)}</strong></span>
                      <span>Supplier Cost: <strong className="text-amber-600">-{formatCurrency(addonCostNum)}</strong></span>
                      <span className="text-emerald-600 font-bold">Add-on Margin: +{formatCurrency(addonPriceNum - addonCostNum)}</span>
                    </div>
                  )}
                </div>
              )}
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
                className="h-8 text-xs font-bold text-primary text-sm bg-background"
                value={totalCustomerPrice}
                onChange={(e) => setTotalCustomerPrice(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">Deposit Paid</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                className="h-8 text-xs font-semibold text-emerald-600 bg-background"
                value={depositPaid}
                onChange={(e) => setDepositPaid(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">Initial Status</Label>
              <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                <SelectTrigger className="h-8 text-xs bg-background text-foreground border-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground">
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
                Net Shop {repairType === 'software' ? 'Software Service' : 'Repair'} Profit:
              </span>
              <div className="flex items-center gap-2">
                {customerTotalNum > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300">
                    <Percent className="h-2.5 w-2.5 mr-0.5" />
                    {profitMarginPercent}% Margin
                  </Badge>
                )}
                <span className={`text-base font-extrabold ${netShopProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                  {formatCurrency(netShopProfit)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-emerald-200 dark:border-emerald-900/50 pt-1">
              <span>Customer Charge: <strong>{formatCurrency(customerTotalNum)}</strong></span>
              {isPartConfigured && partCostNum > 0 && (
                <span>Part Cost: <strong className="text-amber-600">-{formatCurrency(partCostNum)}</strong></span>
              )}
              {isAddonActive && addonCostNum > 0 && (
                <span>Add-on Cost: <strong className="text-purple-600">-{formatCurrency(addonCostNum)}</strong></span>
              )}
              {partCostNum === 0 && addonCostNum === 0 && (
                <span className="text-emerald-600 font-medium italic">100% Service Labor / Profit</span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-foreground">Repair / Internal Notes</Label>
            <Textarea
              placeholder="Additional repair notes, diagnostic details, or condition upon intake"
              rows={2}
              className="text-xs bg-background text-foreground"
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
            {loading ? "Saving..." : (ticketToEdit ? "Save Changes" : `Create ${repairType === 'software' ? 'Software' : 'Hardware'} Ticket`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
