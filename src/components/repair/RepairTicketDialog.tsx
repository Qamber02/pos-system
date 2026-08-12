import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { syncService } from "@/lib/syncService";
import { CachedCustomer, CachedDeviceIdentifier, CachedRepairTicket, RepairStatus } from "@/lib/db";

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

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
            user_id: user.id,
            previous_status: ticketToEdit.status,
            new_status: status,
            changed_by: user.id,
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
          user_id: user.id,
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
          user_id: user.id,
          previous_status: null,
          new_status: status,
          changed_by: user.id,
          notes: "Ticket created and received at shop",
          synced: false,
          lastModified: nowTimestamp,
          created_at: nowIso
        };
        await syncService.queueOperation('repairTicketHistory', 'insert', historyEntry);

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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ticketToEdit ? `Edit Ticket ${ticketToEdit.ticket_number}` : "Log New Repair Ticket"}</DialogTitle>
          <DialogDescription>
            Record device details, customer information, and reported issues.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Customer (Optional)</Label>
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger>
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

            <div className="space-y-2">
              <Label>Registered Device (Optional)</Label>
              <Select value={selectedDeviceId} onValueChange={handleDeviceSelection}>
                <SelectTrigger>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Device Name / Model *</Label>
              <Input
                placeholder="e.g. iPhone 13 Pro Max"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>IMEI / Serial Number</Label>
              <Input
                placeholder="15-digit IMEI or S/N"
                value={serialOrImei}
                onChange={(e) => setSerialOrImei(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reported Problem / Issue *</Label>
            <Textarea
              placeholder="e.g. Cracked screen, battery drain, liquid damage diagnosis"
              rows={3}
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Estimated Cost</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Deposit Paid</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={depositPaid}
                onChange={(e) => setDepositPaid(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Initial Status</Label>
              <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                <SelectTrigger>
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

          <div className="space-y-2">
            <Label>Technician Notes</Label>
            <Textarea
              placeholder="Additional repair notes or condition details upon intake"
              rows={2}
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
            {loading ? "Saving..." : (ticketToEdit ? "Save Changes" : "Create Ticket")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
