import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, User } from "lucide-react";

interface StaffMember {
    id: string;
    email: string;
    full_name?: string;
    role: 'admin' | 'user';
}

const Staff = () => {
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        checkAccess();
    }, []);

    const checkAccess = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            toast.error("Unauthorized Access");
            return;
        }

        const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .single();

        if (roleData?.role !== 'admin' && roleData?.role !== 'developer') {
            toast.error("Unauthorized Access");
            return;
        }
        fetchStaff();
    };

    const fetchStaff = async () => {
        try {
            setErrorMsg(null);
            // 1. Fetch profiles
            const { data: profiles, error: profilesError } = await supabase
                .from('profiles' as any)
                .select('*');

            if (profilesError) throw new Error(`Profiles Error: ${profilesError.message}`);

            // 2. Fetch roles
            const { data: roles, error: rolesError } = await supabase
                .from('user_roles')
                .select('*');

            if (rolesError) throw new Error(`Roles Error: ${rolesError.message}`);

            // 3. Merge data
            const mergedStaff = profiles.map((profile: any) => {
                const userRole = roles.find(r => r.user_id === profile.id);
                return {
                    id: profile.id,
                    email: profile.email,
                    full_name: profile.full_name,
                    role: userRole?.role || 'user'
                };
            });

            setStaff(mergedStaff);
        } catch (error: any) {
            console.error("Error fetching staff:", error);
            setErrorMsg(error.message || "Unknown error");
            toast.error("Failed to load staff members");
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = async (userId: string, newRole: 'admin' | 'user') => {
        try {
            // Upsert role
            const { error } = await supabase
                .from('user_roles')
                .upsert({
                    user_id: userId,
                    role: newRole
                }, { onConflict: 'user_id' });

            if (error) throw error;

            toast.success("Role updated successfully");
            fetchStaff(); // Refresh list
        } catch (error: any) {
            toast.error("Failed to update role");
            console.error(error);
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    }

    if (errorMsg) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
                <div className="text-destructive font-bold text-lg">Error Loading Staff</div>
                <div className="bg-destructive/10 p-4 rounded-md text-destructive font-mono text-sm max-w-lg break-words">
                    {errorMsg}
                </div>
                <Button onClick={fetchStaff}>Retry</Button>
                <Navigation />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="border-b bg-card shadow-sm sticky top-0 z-50">
                <div className="container mx-auto px-4 py-4 flex items-center gap-4">
                    <Navigation />
                    <h1 className="text-2xl font-bold">Staff Management</h1>
                </div>
            </header>

            <div className="flex flex-1">
                <Navigation />
                <main className="flex-1 container mx-auto px-4 py-6 max-w-4xl space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5" />
                                Staff Members
                            </CardTitle>
                            <CardDescription>
                                Manage user roles and permissions. Only Admins and Developers can view this page.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {staff.map((member) => (
                                        <TableRow key={member.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                        <User className="h-4 w-4 text-primary" />
                                                    </div>
                                                    {member.full_name || "Unknown"}
                                                </div>
                                            </TableCell>
                                            <TableCell>{member.email}</TableCell>
                                            <TableCell>
                                                <Badge variant={member.role === 'admin' ? "default" : "secondary"}>
                                                    {member.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Select
                                                    defaultValue={member.role}
                                                    onValueChange={(val) => handleRoleChange(member.id, val as 'admin' | 'user')}
                                                >
                                                    <SelectTrigger className="w-[120px] ml-auto">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="user">User</SelectItem>
                                                        <SelectItem value="admin">Admin</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </main>
            </div>
        </div>
    );
};

export default Staff;
