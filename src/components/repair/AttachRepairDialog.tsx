import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Wrench, PlusCircle, Check } from "lucide-react";
import { db, CachedRepairTicket } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { CartItem } from "@/components/Cart";

interface AttachRepairDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttachRepair: (item: CartItem) => void;
}

export const AttachRepairDialog = ({
  open,
  onOpenChange,
  onAttachRepair
}: AttachRepairDialogProps) => {
  const formatCurrency = useFormatCurrency();
  const [search, setSearch] = useState("");

  const tickets = useLiveQuery(async () => {
    const list = await db.repairTickets.toArray();
    const custs = await db.customers.toArray();
    const custMap = new Map(custs.map(c => [c.id, c]));

    return list
      .filter(t => !['completed', 'cancelled'].includes(t.status))
      .map(t => ({
        ...t,
        customer: t.customer_id ? custMap.get(t.customer_id) : undefined
      }));
  }) || [];

  const filteredTickets = tickets.filter(t => {
    const query = search.toLowerCase();
    return (
      t.ticket_number.toLowerCase().includes(query) ||
      t.device_name.toLowerCase().includes(query) ||
      (t.serial_or_imei && t.serial_or_imei.toLowerCase().includes(query)) ||
      (t.customer?.name && t.customer.name.toLowerCase().includes(query))
    );
  });

  const handleSelectTicket = (ticket: CachedRepairTicket & { customer?: any }) => {
    const remainingBalance = Math.max(0, (ticket.estimated_cost || 0) - (ticket.deposit_paid || 0));

    const cartItem: CartItem = {
      id: `repair-${ticket.id}`,
      name: `Repair Ticket #${ticket.ticket_number} (${ticket.device_name})`,
      price: remainingBalance,
      quantity: 1,
      maxStock: 1,
      repairTicketId: ticket.id,
      serialOrImei: ticket.serial_or_imei || undefined,
      isRepairTicket: true,
    };

    onAttachRepair(cartItem);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Attach Repair Ticket to POS Cart
          </DialogTitle>
          <DialogDescription>
            Select an active or ready-for-pickup repair ticket to collect final balance payment.
          </DialogDescription>
        </DialogHeader>

        <div className="relative py-2">
          <Search className="absolute left-3 top-4 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search ticket #, IMEI, device, or customer name..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto border rounded-md min-h-[300px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket #</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Balance Due</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-xs">
                    No active repair tickets available.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTickets.map((ticket) => {
                  const balance = Math.max(0, (ticket.estimated_cost || 0) - (ticket.deposit_paid || 0));
                  return (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-mono font-bold text-primary text-xs">
                        {ticket.ticket_number}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {ticket.device_name}
                      </TableCell>
                      <TableCell className="text-xs">
                        {ticket.customer?.name || 'Walk-in'}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="secondary" className="capitalize text-[10px]">
                          {ticket.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-xs">
                        {formatCurrency(balance)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleSelectTicket(ticket)}
                        >
                          <PlusCircle className="h-3.5 w-3.5 mr-1" /> Add to Cart
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
};
