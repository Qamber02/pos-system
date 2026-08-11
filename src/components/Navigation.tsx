import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Home, Package, Users, BarChart3, Settings, LogOut, Shield, HandCoins, ShoppingCart, CreditCard, RefreshCw } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import defaultLogo from "@/assets/default-logo.png";
import { db } from "@/lib/db";
import { syncService } from "@/lib/syncService";

interface NavItem {
  path: string;
  icon: any;
  label: string;
  adminOnly?: boolean;
  developerOnly?: boolean;
}

export const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const { profile, role, isAdmin } = useUserRole();

  const [logoUrl, setLogoUrl] = useState<string>(defaultLogo);
  const [businessName, setBusinessName] = useState<string>("POS SHOPPING");
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("settings")
        .select("logo_url, business_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        if (data.logo_url) setLogoUrl(data.logo_url);
        if (data.business_name) setBusinessName(data.business_name);
      }
    } catch (error) {
      console.error("Error loading settings (offline expected):", error);
    }
  };

  const handleLogout = async () => {
    try {
      // Step 1: Clear all local user data
      await db.clearUserData();

      // Step 2: Sign out from Supabase
      await supabase.auth.signOut();

      toast.success("Logged out successfully");
      navigate("/auth");
    } catch (error) {
      console.error("Error during logout:", error);
      toast.error("Error logging out");
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncService.syncAll();
      toast.success("Data synced successfully!");
    } catch (error) {
      console.error("Sync error:", error);
      toast.error("Failed to sync data");
    } finally {
      setIsSyncing(false);
    }
  };

  const navItems: NavItem[] = [
    { path: "/pos", icon: ShoppingCart, label: "POS" },
    { path: "/products", icon: Package, label: "Products" },
    { path: "/customers", icon: Users, label: "Customers" },
    { path: "/loans", icon: CreditCard, label: "Loans" },
    { path: "/reports", icon: BarChart3, label: "Reports" }, // Visible to all now
    { path: "/staff", icon: Shield, label: "Staff", developerOnly: true }, // Only for developer
    { path: "/settings", icon: Settings, label: "Settings" },
  ];

  const userName = profile?.email ? profile.email.split('@')[0] : "Loading...";

  const userEmail = profile?.email;
  const isDeveloper = role === 'developer';

  const NavLinks = () => (
    <nav className="space-y-1">
      {navItems
        .filter((item) => {
          if (item.developerOnly) return isDeveloper;
          if (item.adminOnly) return isAdmin;
          return true;
        })
        .map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path}>
              <Button
                variant={isActive ? "default" : "ghost"}
                className="w-full justify-start transition-all"
              >
                <Icon className="mr-3 h-4 w-4" />
                {item.label}
                {(item.adminOnly || item.developerOnly) && (
                  <Shield className="ml-auto h-3 w-3 text-primary-foreground" />
                )}
              </Button>
            </Link>
          );
        })}

      {isDeveloper && (
        <>
          <Separator className="my-2" />
          <Link to="/control-panel">
            <Button variant="ghost" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50">
              <Shield className="mr-3 h-4 w-4" />
              Control Panel
            </Button>
          </Link>
        </>
      )}

      <Separator className="my-4" />
      <Button
        variant="ghost"
        className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 transition-all"
        onClick={handleLogout}
      >
        <LogOut className="mr-3 h-4 w-4" />
        Logout
      </Button>
    </nav>
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="fixed top-4 left-4 z-50 h-10 w-10 rounded-full shadow-md bg-white/80 backdrop-blur-sm border-zinc-200 hover:scale-105 transition-all duration-300 dark:bg-zinc-900/80 dark:border-zinc-800">
          <Menu className="h-5 w-5 text-zinc-700 dark:text-zinc-200" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 p-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
        <div className="h-full flex flex-col">
          {/* Header Section */}
          <div className="p-6 bg-gradient-to-br from-red-600 to-red-700 text-white">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center ring-1 ring-white/20 shadow-inner">
                <img src={logoUrl} alt={businessName} className="w-10 h-10 object-contain" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight">{businessName}</h2>
                <p className="text-xs text-red-100/80 font-medium">Point of Sale System</p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-red-100">Current User</span>
                <Badge variant="secondary" className="bg-white/20 text-white hover:bg-white/30 border-none text-[10px] px-2 h-5">
                  {role || "user"}
                </Badge>
              </div>
              <p className="text-sm font-semibold truncate text-white">{userName}</p>
              <p className="text-xs text-red-200 truncate">{userEmail}</p>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto py-6 px-4 space-y-6">
            <div className="space-y-1">
              <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Menu</p>
              {navItems
                .filter((item) => {
                  if (item.developerOnly) return isDeveloper;
                  if (item.adminOnly) return isAdmin;
                  return true;
                })
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link key={item.path} to={item.path}>
                      <Button
                        variant="ghost"
                        className={`w-full justify-start mb-1 h-11 rounded-xl transition-all duration-200 ${isActive
                          ? "bg-red-50 text-red-600 font-semibold dark:bg-red-900/20 dark:text-red-400"
                          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100"
                          }`}
                      >
                        <Icon className={`mr-3 h-5 w-5 ${isActive ? "text-red-600 dark:text-red-400" : "text-zinc-400 group-hover:text-zinc-600"}`} />
                        {item.label}
                        {(item.adminOnly || item.developerOnly) && (
                          <Shield className="ml-auto h-3 w-3 opacity-50" />
                        )}
                      </Button>
                    </Link>
                  );
                })}
            </div>

            {isDeveloper && (
              <div className="space-y-1">
                <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Developer</p>
                <Link to="/control-panel">
                  <Button variant="ghost" className="w-full justify-start h-11 rounded-xl text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-500 dark:hover:bg-amber-900/20">
                    <Shield className="mr-3 h-5 w-5" />
                    Control Panel
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Footer Section */}
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-2">
            <Button
              variant="ghost"
              className="w-full justify-start h-11 rounded-xl text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              onClick={handleSync}
              disabled={isSyncing}
            >
              <RefreshCw className={`mr-3 h-5 w-5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start h-11 rounded-xl text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              onClick={handleLogout}
            >
              <LogOut className="mr-3 h-5 w-5" />
              Sign Out
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};