import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, Upload, Image as ImageIcon, Key, Mail, Shield, AlertTriangle } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import defaultLogo from "@/assets/default-logo.png";
import { db } from "@/lib/db";

const Settings = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const { role, isAdmin } = useUserRole();

  const [form, setForm] = useState({
    business_name: "My Store",
    tax_rate: "0",
    currency_symbol: "PKR",
    receipt_footer: "Thank you for your business!",
    logo_url: "",
  });
  const [logoPreview, setLogoPreview] = useState<string>(defaultLogo);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Account settings
  const [currentEmail, setCurrentEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [showEmailOtp, setShowEmailOtp] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingAccount, setUpdatingAccount] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchSettings();
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      setCurrentEmail(user.email);
    }
  };

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettingsId(data.id);
        setForm({
          business_name: data.business_name || "My Store",
          tax_rate: data.tax_rate?.toString() || "0",
          currency_symbol: data.currency_symbol || "PKR",
          receipt_footer: data.receipt_footer || "Thank you for your business!",
          logo_url: data.logo_url || "",
        });
        if (data.logo_url) {
          setLogoPreview(data.logo_url);
        }
      }
    } catch (error: any) {
      console.error("Error loading settings:", error);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setLogoPreview(result);
        setForm({ ...form, logo_url: result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const settingsData = {
        business_name: form.business_name,
        tax_rate: parseFloat(form.tax_rate) || 0,
        currency_symbol: form.currency_symbol,
        receipt_footer: form.receipt_footer || null,
        logo_url: form.logo_url || null,
        user_id: user.id,
      };

      if (settingsId) {
        const { error } = await supabase
          .from("settings")
          .update(settingsData)
          .eq("id", settingsId);
        if (error) throw error;

        // Update local IndexedDB
        await db.settings.put({
          id: settingsId,
          ...settingsData,
          synced: true,
          lastModified: Date.now(),
        });
      } else {
        const { data, error } = await supabase
          .from("settings")
          .insert(settingsData)
          .select()
          .single();
        if (error) throw error;
        if (data) {
          setSettingsId(data.id);

          // Add to local IndexedDB
          await db.settings.put({
            id: data.id,
            ...settingsData,
            synced: true,
            lastModified: Date.now(),
          });
        }
      }

      toast.success("Settings saved successfully");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail || !newEmail.includes('@')) {
      toast.error("Please enter a valid email");
      return;
    }

    setUpdatingAccount(true);
    try {
      const { error } = await supabase.auth.updateUser(
        { email: newEmail },
        { emailRedirectTo: `${window.location.origin}/settings` }
      );

      if (error) throw error;

      setShowEmailOtp(true);
      toast.success("Verification code sent to your new email");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUpdatingAccount(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!emailOtp || emailOtp.length < 6) {
      toast.error("Please enter a valid 6-digit code");
      return;
    }

    setUpdatingAccount(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: newEmail,
        token: emailOtp,
        type: 'email_change',
      });

      if (error) throw error;

      toast.success("Email updated successfully!");
      setCurrentEmail(newEmail);
      setNewEmail("");
      setEmailOtp("");
      setShowEmailOtp(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUpdatingAccount(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    setUpdatingAccount(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast.success("Password updated successfully!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUpdatingAccount(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Navigation />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
      </header>

      <div className="flex flex-1">
        <Navigation />
        <main className="flex-1 container mx-auto px-4 py-6 max-w-4xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Account Settings
              </CardTitle>
              <CardDescription>
                Manage your email, password, and account details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Label>Account Role:</Label>
                <Badge variant={isAdmin ? "default" : "secondary"}>
                  {role || "Loading..."}
                </Badge>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <Label className="text-base font-semibold">Change Email</Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="current_email">Current Email</Label>
                  <Input
                    id="current_email"
                    type="email"
                    value={currentEmail}
                    disabled
                  />
                </div>
                {!showEmailOtp ? (
                  <div className="space-y-2">
                    <Label htmlFor="new_email">New Email</Label>
                    <div className="flex gap-2">
                      <Input
                        id="new_email"
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="Enter new email"
                      />
                      <Button
                        onClick={handleChangeEmail}
                        disabled={updatingAccount || !newEmail}
                      >
                        {updatingAccount ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Send Code"
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="email_otp">Verification Code</Label>
                    <div className="flex gap-2">
                      <Input
                        id="email_otp"
                        type="text"
                        value={emailOtp}
                        onChange={(e) => setEmailOtp(e.target.value)}
                        placeholder="Enter 6-digit code"
                        maxLength={6}
                      />
                      <Button
                        onClick={handleVerifyEmailOtp}
                        disabled={updatingAccount || emailOtp.length < 6}
                      >
                        {updatingAccount ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Verify"
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Check your new email for the verification code
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  <Label className="text-base font-semibold">Change Password</Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_password">New Password</Label>
                  <Input
                    id="new_password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Confirm Password</Label>
                  <Input
                    id="confirm_password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>
                <Button
                  onClick={handleChangePassword}
                  disabled={updatingAccount || !newPassword || !confirmPassword}
                >
                  {updatingAccount ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Key className="mr-2 h-4 w-4" />
                      Update Password
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Business Settings</CardTitle>
              <CardDescription>
                Configure your POS system preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="logo">Business Logo</Label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center overflow-hidden bg-muted">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                      id="logo-upload"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Logo
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Recommended: Square image, max 500KB
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="business_name">Business Name</Label>
                <Input
                  id="business_name"
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  placeholder="My Store"
                />
                <p className="text-xs text-muted-foreground">
                  This will appear on receipts
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax_rate">Tax Rate (%)</Label>
                <Input
                  id="tax_rate"
                  type="number"
                  step="0.01"
                  value={form.tax_rate}
                  onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  Default tax rate applied to sales
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency_symbol">Currency Symbol</Label>
                <Input
                  id="currency_symbol"
                  value={form.currency_symbol}
                  onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })}
                  placeholder="$"
                  maxLength={3}
                />
                <p className="text-xs text-muted-foreground">
                  Symbol used for displaying prices
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="receipt_footer">Receipt Footer</Label>
                <Textarea
                  id="receipt_footer"
                  value={form.receipt_footer}
                  onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
                  placeholder="Thank you for your business!"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Custom message displayed at the bottom of receipts
                </p>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Settings
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/20">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Data Management
              </CardTitle>
              <CardDescription>
                Manage your local data and synchronization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg bg-destructive/5 border-destructive/10">
                <div className="space-y-1">
                  <h4 className="font-medium text-destructive">Reset Local Data</h4>
                  <p className="text-sm text-muted-foreground">
                    Clear all local data and re-sync from the server. Use this if you see duplicate items or sync errors.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (confirm("Are you sure? This will clear all local data and reload the page.")) {
                      await db.delete();
                      window.location.reload();
                    }
                  }}
                >
                  Reset Data
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
};

export default Settings;
