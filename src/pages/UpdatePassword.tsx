import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";

const updatePasswordSchema = z.object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

type UpdatePasswordFormValues = z.infer<typeof updatePasswordSchema>;

const UpdatePassword = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const form = useForm<UpdatePasswordFormValues>({
        resolver: zodResolver(updatePasswordSchema),
        defaultValues: { password: "", confirmPassword: "" },
    });

    useEffect(() => {
        // Check if we have a session (which happens after clicking the email link)
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                toast.error("Invalid or expired reset link.");
                navigate("/auth");
            }
        };
        checkSession();
    }, [navigate]);

    const onUpdatePassword = async (data: UpdatePasswordFormValues) => {
        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({
                password: data.password,
            });

            if (error) throw error;

            toast.success("Password updated successfully!");
            navigate("/");
        } catch (error: any) {
            toast.error(error.message || "Error updating password");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-white dark:bg-zinc-900 p-8 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800"
            >
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-4">
                        <Lock className="w-6 h-6" />
                    </div>
                    <h1 className="text-2xl font-bold">Set New Password</h1>
                    <p className="text-muted-foreground mt-2">
                        Please enter your new password below.
                    </p>
                </div>

                <form onSubmit={form.handleSubmit(onUpdatePassword)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="password">New Password</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                {...form.register("password")}
                                disabled={loading}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                            </Button>
                        </div>
                        {form.formState.errors.password && (
                            <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            {...form.register("confirmPassword")}
                            disabled={loading}
                        />
                        {form.formState.errors.confirmPassword && (
                            <p className="text-sm text-destructive">{form.formState.errors.confirmPassword.message}</p>
                        )}
                    </div>

                    <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Update Password
                    </Button>
                </form>
            </motion.div>
        </div>
    );
};

export default UpdatePassword;
