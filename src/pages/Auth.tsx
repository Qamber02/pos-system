import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ShoppingCart, Loader2, Eye, EyeOff, CheckCircle2, Store, ArrowLeft } from "lucide-react";
import { db, UserProfile } from "@/lib/db";
import { syncService } from "@/lib/syncService";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";

// --- Zod Schemas ---
const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().default(false),
});

const signUpSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type SignInFormValues = z.infer<typeof signInSchema>;
type SignUpFormValues = z.infer<typeof signUpSchema>;
type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState("signin");

  // Forms
  const signInForm = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  const signUpForm = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const resetPasswordForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: "" },
  });

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/");
      }
    };
    checkUser();
  }, [navigate]);

  const onSignIn = async (data: SignInFormValues) => {
    setLoading(true);
    try {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;
      if (!signInData.user) throw new Error("No user data returned.");

      const user = signInData.user;

      // Fetch role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (roleError) console.error("Error fetching role:", roleError);

      // Save local profile
      const localProfile: UserProfile = {
        id: user.id,
        email: user.email,
        role: roleData?.role || 'user',
      };

      await db.userProfile.put(localProfile);

      // Trigger sync immediately to restore data if local DB was cleared
      syncService.syncAll();

      toast.success("Welcome back!");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const onSignUp = async (data: SignUpFormValues) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      toast.success("Account created! Please check your email to verify.");
      signUpForm.reset();
      setActiveTab("signin");
    } catch (error: any) {
      toast.error(error.message || "Error creating account");
    } finally {
      setLoading(false);
    }
  };

  const onResetPassword = async (data: ResetPasswordFormValues) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) throw error;

      toast.success("Password reset link sent! Check your email.");
      setActiveTab("signin");
    } catch (error: any) {
      toast.error(error.message || "Error sending reset link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Left Side - Hero Section */}
      <div className="hidden lg:flex w-1/2 bg-zinc-900 relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1556742049-0cfed4f7a07d?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-40 mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-br from-red-600/90 to-zinc-900/90" />

        <div className="relative z-10 p-12 text-white max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                <Store className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-4xl font-bold tracking-tight">POS Shopping</h1>
            </div>

            <h2 className="text-5xl font-extrabold mb-6 leading-tight">
              Manage your store with <span className="text-red-200">confidence</span>.
            </h2>

            <div className="space-y-4 text-lg text-zinc-200">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-red-400" />
                <span>Real-time inventory tracking</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-red-400" />
                <span>Seamless offline synchronization</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-red-400" />
                <span>Comprehensive sales analytics</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Side - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-zinc-50/50 dark:bg-zinc-950">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md space-y-8"
        >
          {activeTab === "reset" ? (
            <div className="text-center lg:text-left">
              <Button variant="ghost" className="pl-0 hover:bg-transparent mb-4" onClick={() => setActiveTab("signin")}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sign In
              </Button>
              <h2 className="text-3xl font-bold tracking-tight">Reset Password</h2>
              <p className="text-muted-foreground mt-2">
                Enter your email to receive a password reset link.
              </p>
            </div>
          ) : (
            <div className="text-center lg:text-left">
              <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
              <p className="text-muted-foreground mt-2">
                Enter your credentials to access your account
              </p>
            </div>
          )}

          {activeTab === "reset" ? (
            <motion.div
              key="reset"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <form onSubmit={resetPasswordForm.handleSubmit(onResetPassword)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="name@example.com"
                    {...resetPasswordForm.register("email")}
                    disabled={loading}
                  />
                  {resetPasswordForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{resetPasswordForm.formState.errors.email.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Reset Link
                </Button>
              </form>
            </motion.div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-8">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Create Account</TabsTrigger>
              </TabsList>

              <AnimatePresence mode="wait">
                <TabsContent value="signin" asChild>
                  <motion.div
                    key="signin"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <form onSubmit={signInForm.handleSubmit(onSignIn)} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="signin-email">Email</Label>
                        <Input
                          id="signin-email"
                          type="email"
                          placeholder="name@example.com"
                          {...signInForm.register("email")}
                          disabled={loading}
                        />
                        {signInForm.formState.errors.email && (
                          <p className="text-sm text-destructive">{signInForm.formState.errors.email.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="signin-password">Password</Label>
                          <Button variant="link" className="p-0 h-auto text-xs" type="button" onClick={() => setActiveTab("reset")}>
                            Forgot password?
                          </Button>
                        </div>
                        <div className="relative">
                          <Input
                            id="signin-password"
                            type={showPassword ? "text" : "password"}
                            {...signInForm.register("password")}
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
                        {signInForm.formState.errors.password && (
                          <p className="text-sm text-destructive">{signInForm.formState.errors.password.message}</p>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="remember"
                          checked={signInForm.watch("rememberMe")}
                          onCheckedChange={(c) => signInForm.setValue("rememberMe", c as boolean)}
                        />
                        <Label htmlFor="remember" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          Remember me for 30 days
                        </Label>
                      </div>

                      <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Sign In
                      </Button>
                    </form>
                  </motion.div>
                </TabsContent>

                <TabsContent value="signup" asChild>
                  <motion.div
                    key="signup"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <form onSubmit={signUpForm.handleSubmit(onSignUp)} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="signup-email">Email</Label>
                        <Input
                          id="signup-email"
                          type="email"
                          placeholder="name@example.com"
                          {...signUpForm.register("email")}
                          disabled={loading}
                        />
                        {signUpForm.formState.errors.email && (
                          <p className="text-sm text-destructive">{signUpForm.formState.errors.email.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-password">Password</Label>
                        <div className="relative">
                          <Input
                            id="signup-password"
                            type={showPassword ? "text" : "password"}
                            {...signUpForm.register("password")}
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
                        {signUpForm.formState.errors.password && (
                          <p className="text-sm text-destructive">{signUpForm.formState.errors.password.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirm Password</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          {...signUpForm.register("confirmPassword")}
                          disabled={loading}
                        />
                        {signUpForm.formState.errors.confirmPassword && (
                          <p className="text-sm text-destructive">{signUpForm.formState.errors.confirmPassword.message}</p>
                        )}
                      </div>

                      <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create Account
                      </Button>
                    </form>
                  </motion.div>
                </TabsContent>
              </AnimatePresence>
            </Tabs>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Auth;