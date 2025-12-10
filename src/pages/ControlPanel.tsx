import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Shield, User, Ban, Activity, Database, Trash2 } from "lucide-react";
import { db } from "@/lib/db";

type AppRole = 'admin' | 'user' | 'developer' | 'restricted';

interface UserData {
    id: string;
    email: string;
    full_name?: string;
    role: AppRole;
    status: string;
}

interface Profile {
    id: string;
    email: string;
    full_name?: string;
    status?: string;
    updated_at?: string;
}

interface UserRole {
    id: string;
    user_id: string;
    role: AppRole;
}

const ControlPanel = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUserEmail, setCurrentUserEmail] = useState<string>("");

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            // Fetch profiles - casting to any because 'profiles' might be missing in generated types
            const { data: profiles, error: profilesError } = await supabase
                .from('profiles' as any)
                .select('*');

            if (profilesError) throw profilesError;

            // Fetch roles
            const { data: roles, error: rolesError } = await supabase
                .from('user_roles')
                .select('*');

            if (rolesError) throw rolesError;

            // Merge
            const merged = (profiles as any[]).map(p => {
                const r = roles.find(role => role.user_id === p.id);
                // Validate role against AppRole type, default to 'user'
                const roleValue = (r?.role && ['admin', 'user', 'developer', 'restricted'].includes(r.role))
                    ? (r.role as AppRole)
                    : 'user';

                return {
                    id: p.id,
                    email: p.email,
                    full_name: p.full_name,
                    role: roleValue,
                    status: p.status || 'active'
                };
            });

            setUsers(merged);
        } catch (error: any) {
            toast.error("Error fetching users: " + (error.message || "Unknown error"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const checkAccess = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate("/");
                return;
            }

            // Check if user has developer role
            const { data: roleData } = await supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', user.id)
                .single();

            if (roleData?.role !== 'developer') {
                toast.error("Unauthorized Access");
                navigate("/");
                return;
            }

            setCurrentUserEmail(user.email || "");
            fetchUsers();
        };
        checkAccess();
    }, [navigate, fetchUsers]);

    const handleRoleChange = async (userId: string, newRole: string) => {
        try {
            // Validate newRole is a valid AppRole
            if (!['admin', 'user', 'developer', 'restricted'].includes(newRole)) {
                throw new Error("Invalid role selected");
            }

            // Check if role entry exists
            const { data: existingRole } = await supabase
                .from('user_roles')
                .select('id')
                .eq('user_id', userId)
                .maybeSingle();

            let error;
            if (existingRole) {
                // Update - cast to any to allow extended roles
                const { error: updateError } = await supabase
                    .from('user_roles')
                    .update({ role: newRole as any })
                    .eq('user_id', userId);
                error = updateError;
            } else {
                // Insert - cast to any to allow extended roles
                const { error: insertError } = await supabase
                    .from('user_roles')
                    .insert({ user_id: userId, role: newRole as any });
                error = insertError;
            }

            if (error) throw error;
            toast.success("Role updated");
            fetchUsers();
        } catch (error: any) {
            toast.error("Failed to update role: " + (error.message || "Unknown error"));
        }
    };

    const handleStatusChange = async (userId: string, newStatus: string) => {
        try {
            const { error } = await supabase
                .from('profiles' as any)
                .update({ status: newStatus })
                .eq('id', userId);

            if (error) throw error;
            toast.success(`User ${newStatus}`);
            fetchUsers();
        } catch (error: any) {
            toast.error("Failed to update status");
        }
    };

    const handleResetCache = async () => {
        if (confirm("Are you sure? This will clear all local data.")) {
            await db.delete();
            await db.open();
            toast.success("Local database cleared");
            window.location.reload();
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center">Loading Control Panel...</div>;

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="border-b bg-card shadow-sm sticky top-0 z-50 border-l-4 border-l-red-500">
                <div className="container mx-auto px-4 py-4 flex items-center gap-4">
                    <Navigation />
                    <div>
                        <h1 className="text-2xl font-bold text-red-600 flex items-center gap-2">
                            <Shield className="h-6 w-6" />
                            Developer Control Panel
                        </h1>
                        <div className="flex items-center gap-2">
                            <p className="text-xs text-muted-foreground">Restricted Access: {currentUserEmail}</p>
                            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={fetchUsers}>
                                Refresh Data
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex flex-1">
                <Navigation />
                <main className="flex-1 container mx-auto px-4 py-6 max-w-6xl space-y-6">

                    <Tabs defaultValue="users">
                        <TabsList>
                            <TabsTrigger value="users">User Management</TabsTrigger>
                            <TabsTrigger value="system">System Maintenance</TabsTrigger>
                        </TabsList>

                        <TabsContent value="users" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>All Users</CardTitle>
                                    <CardDescription>Manage roles and access status.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>User</TableHead>
                                                <TableHead>Role</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {users.map(user => (
                                                <TableRow key={user.id} className={user.status === 'suspended' ? 'bg-destructive/5' : ''}>
                                                    <TableCell>
                                                        <div className="font-medium">{user.full_name || 'Unknown'}</div>
                                                        <div className="text-xs text-muted-foreground">{user.email}</div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Select defaultValue={user.role} onValueChange={(v) => handleRoleChange(user.id, v)}>
                                                            <SelectTrigger className="w-[130px]">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="user">User</SelectItem>
                                                                <SelectItem value="admin">Admin</SelectItem>
                                                                <SelectItem value="developer">Developer</SelectItem>
                                                                <SelectItem value="restricted">Restricted</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={user.status === 'active' ? 'default' : 'destructive'}>
                                                            {user.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex gap-2">
                                                            {user.status === 'active' ? (
                                                                <Button size="sm" variant="destructive" onClick={() => handleStatusChange(user.id, 'suspended')}>
                                                                    <Ban className="h-4 w-4 mr-1" /> Suspend
                                                                </Button>
                                                            ) : (
                                                                <Button size="sm" variant="outline" onClick={() => handleStatusChange(user.id, 'active')}>
                                                                    <Activity className="h-4 w-4 mr-1" /> Activate
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="system" className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Database className="h-5 w-5" />
                                            Local Database
                                        </CardTitle>
                                        <CardDescription>Manage local Dexie storage</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Button variant="destructive" onClick={handleResetCache}>
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Clear Local Cache & Reload
                                        </Button>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>
                    </Tabs>

                </main>
            </div>
        </div>
    );
};

export default ControlPanel;
