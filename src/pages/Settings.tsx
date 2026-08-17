import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Save, Upload, Image as ImageIcon, Key, Mail, Shield, AlertTriangle } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import defaultLogo from "@/assets/default-logo.png";
import { db } from "@/lib/db";
import { seedDemoDataForUser } from "@/lib/seedDemoData";
import { syncService } from "@/lib/syncService";

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
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");

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
      // 1. Try reading local Dexie database first (instant offline response)
      const localSetting = await db.settings.toCollection().first();
      if (localSetting) {
        setSettingsId(localSetting.id);
        setForm({
          business_name: localSetting.business_name || "My Store",
          tax_rate: localSetting.tax_rate?.toString() || "0",
          currency_symbol: localSetting.currency_symbol || "PKR",
          receipt_footer: localSetting.receipt_footer || "Thank you for your business!",
          logo_url: localSetting.logo_url || "",
        });
        if (localSetting.logo_url) {
          setLogoPreview(localSetting.logo_url);
        }
      }

      // 2. Fetch from Supabase Cloud if online
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

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

          // Cache in local Dexie DB
          await db.settings.put({
            ...data,
            id: data.id,
            synced: true,
            lastModified: new Date(data.updated_at || Date.now()).getTime(),
          });
        }
      }
    } catch (error: any) {
      console.log("Settings loaded from local DB fallback:", error?.message);
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
      const currentProfile = await db.userProfile.toCollection().first();
      const userId = user?.id || currentProfile?.id;

      if (!userId) throw new Error("User session not active");

      const targetId = settingsId || crypto.randomUUID();
      const settingsData = {
        id: targetId,
        user_id: userId,
        business_name: form.business_name.trim() || "My Store",
        tax_rate: parseFloat(form.tax_rate) || 0,
        currency_symbol: form.currency_symbol || "PKR",
        receipt_footer: form.receipt_footer.trim() || "Thank you for your business!",
        logo_url: form.logo_url || null,
        synced: false,
        lastModified: Date.now(),
        updated_at: new Date().toISOString(),
      };

      // Save locally to Dexie immediately
      await db.settings.put(settingsData);
      setSettingsId(targetId);

      // Queue operation for Cloud Sync
      await syncService.queueOperation('settings', settingsId ? 'update' : 'insert', {
        id: targetId,
        user_id: userId,
        business_name: settingsData.business_name,
        tax_rate: settingsData.tax_rate,
        currency_symbol: settingsData.currency_symbol,
        receipt_footer: settingsData.receipt_footer,
        logo_url: settingsData.logo_url,
      });

      toast.success("Settings saved successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to save settings");
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
      <header className="border-b bg-card/95 backdrop-blur-md shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 pl-14 flex items-center gap-4">
          <Navigation />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
      </header>

      <div className="flex flex-1">
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
              <div className="flex items-center justify-between p-4 border rounded-lg bg-primary/5 border-primary/10 mb-4">
                <div className="space-y-1">
                  <h4 className="font-medium text-primary">Load Sample Demo Data</h4>
                  <p className="text-sm text-muted-foreground">
                    Populate demo products, IMEIs, repair tickets, technicians, and customers into your shop workspace.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await seedDemoDataForUser();
                  }}
                >
                  Load Demo Data
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg bg-destructive/5 border-destructive/10">
                <div className="space-y-1">
                  <h4 className="font-medium text-destructive">Reset Local Data</h4>
                  <p className="text-sm text-muted-foreground">
                    Clear all local data and re-sync from the server. Use this if you see duplicate items or sync errors.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setResetConfirmText("");
                    setResetConfirmOpen(true);
                  }}
                >
                  Reset Data
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Reset Confirmation Safety Modal */}
      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Confirm Database Reset
            </DialogTitle>
            <DialogDescription>
              This will erase all cached offline tables on this device and re-download fresh data from the cloud.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <p className="text-muted-foreground">
              To confirm, type <span className="font-bold text-foreground font-mono">RESET</span> below:
            </p>
            <Input
              placeholder="Type RESET to confirm"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              className="font-mono text-center tracking-widest uppercase"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={resetConfirmText !== "RESET"}
              onClick={async () => {
                try {
                  await db.delete();
                  toast.success("Local cache cleared. Reloading...");
                  window.location.reload();
                } catch (err: any) {
                  toast.error(err.message || "Failed to reset database");
                }
              }}
            >
              Confirm Wipe & Reload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
