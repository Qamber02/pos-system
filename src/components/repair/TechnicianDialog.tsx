import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { UserCheck, Plus, Edit, Trash2, Phone, Mail, Wrench } from "lucide-react";
import { db, CachedTechnician } from "@/lib/db";
import { syncService } from "@/lib/syncService";
import { useLiveQuery } from "dexie-react-hooks";

interface TechnicianDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TechnicianDialog = ({ open, onOpenChange }: TechnicianDialogProps) => {
  const [activeTab, setActiveTab] = useState<string>("list");
  const [loading, setLoading] = useState(false);
  const [editingTech, setEditingTech] = useState<CachedTechnician | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  const technicians = useLiveQuery(() => db.technicians.toArray()) || [];

  const handleOpenEdit = (tech: CachedTechnician) => {
    setEditingTech(tech);
    setName(tech.name);
    setEmail(tech.email || "");
    setPhone(tech.phone || "");
    setSpecialty(tech.specialty || "");
    setStatus(tech.status);
    setActiveTab("form");
  };

  const handleOpenAdd = () => {
    resetForm();
    setActiveTab("form");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Technician name is required");
      return;
    }

    setLoading(true);
    try {
      let activeUserId = "d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0";
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) activeUserId = user.id;
      } catch {}

      const nowIso = new Date().toISOString();
      const nowTs = Date.now();

      if (editingTech) {
        const updatedTech: CachedTechnician = {
          ...editingTech,
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          specialty: specialty.trim() || null,
          status,
          lastModified: nowTs,
          synced: false,
          updated_at: nowIso
        };
        await syncService.queueOperation("technicians", "update", updatedTech);
        toast.success(`Technician ${name} updated`);
      } else {
        const techData: CachedTechnician = {
          id: crypto.randomUUID(),
          user_id: activeUserId,
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          specialty: specialty.trim() || null,
          status,
          synced: false,
          lastModified: nowTs,
          created_at: nowIso,
          updated_at: nowIso
        };
        await syncService.queueOperation("technicians", "insert", techData);
        toast.success(`Technician ${name} registered`);
      }

      resetForm();
      setActiveTab("list");
    } catch (error: any) {
      toast.error(error.message || "Failed to save technician");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, techName: string) => {
    if (!confirm(`Delete technician "${techName}"?`)) return;
    try {
      await syncService.queueOperation("technicians", "delete", { id });
      toast.success(`Technician "${techName}" deleted`);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete technician");
    }
  };

  const resetForm = () => {
    setEditingTech(null);
    setName("");
    setEmail("");
    setPhone("");
    setSpecialty("");
    setStatus("active");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Shop Technicians Management
          </DialogTitle>
          <DialogDescription>
            Manage repair technicians, skills, and active availability for ticket assignments.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center pb-2">
            <TabsList>
              <TabsTrigger value="list">All Technicians ({technicians.length})</TabsTrigger>
              <TabsTrigger value="form">{editingTech ? "Edit Technician" : "Add Technician"}</TabsTrigger>
            </TabsList>
            {activeTab === "list" && (
              <Button size="sm" onClick={handleOpenAdd} className="h-8 text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Technician
              </Button>
            )}
          </div>

          <TabsContent value="list" className="flex-1 overflow-y-auto mt-2">
            {technicians.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground space-y-2">
                <UserCheck className="h-10 w-10 mx-auto text-muted-foreground/30" />
                <p className="font-semibold">No technicians registered yet</p>
                <Button size="sm" onClick={handleOpenAdd} className="mt-2">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add First Technician
                </Button>
              </div>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Specialty</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {technicians.map((tech) => (
                      <TableRow key={tech.id}>
                        <TableCell className="font-semibold text-xs">{tech.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {tech.specialty || <span className="italic">General Repair</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {tech.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" /> {tech.phone}</div>}
                          {tech.email && <div className="flex items-center gap-1 text-muted-foreground"><Mail className="h-3 w-3" /> {tech.email}</div>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={tech.status === 'active' ? 'default' : 'secondary'} className="text-[10px] capitalize">
                            {tech.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenEdit(tech)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(tech.id, tech.name)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="form" className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input
                placeholder="e.g. Alex Tech"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  placeholder="+1 555-0199"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="tech@shop.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Specialties / Skills</Label>
              <Input
                placeholder="e.g. Micro-soldering, iPhone OLED, Android Board Repair"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active (Available for assignments)</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => { resetForm(); setActiveTab("list"); }}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? "Saving..." : editingTech ? "Update Technician" : "Add Technician"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
