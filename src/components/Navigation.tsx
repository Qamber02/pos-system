import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Home, Package, Users, BarChart3, Settings, LogOut, Shield } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useUserRole } from "@/hooks/useUserRole"; // We fixed this hook
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import defaultLogo from "@/assets/default-logo.png";

const navItems = [
  { path: "/pos", icon: Home, label: "POS", adminOnly: false },
  { path: "/products", icon: Package, label: "Products", adminOnly: false },
  { path: "/customers", icon: Users, label: "Customers", adminOnly: false },
  { path: "/reports", icon: BarChart3, label: "Reports", adminOnly: true },
  { path: "/settings", icon: Settings, label: "Settings", adminOnly: false },
];

export const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // 1. Get profile, role, and isAdmin all from our fixed hook
  const { profile, role, isAdmin } = useUserRole();

  const [logoUrl, setLogoUrl] = useState<string>(defaultLogo);
  const [businessName, setBusinessName] = useState<string>("POS SHOPPING");
  
  // 2. We no longer need fetchUser() or the userName state
  // We can get the email directly from the 'profile' object

  useEffect(() => {
    // 3. We still fetch settings (this will fail offline, we fix next)
    fetchSettings();
  }, []);

  // 4. fetchUser() function is removed.

  const fetchSettings = async () => {
    // NOTE: This will still fail offline. We need to fix this
    // by caching settings in Dexie, just like we cached profiles.
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
    await supabase.auth.signOut();
    // TODO: We should also clear the local Dexie db on logout
    // await db.delete();
    // await db.open();
    toast.success("Logged out successfully");
    navigate("/auth");
  };

  // 5. Calculate userName directly from the local profile
  const userName = profile?.email ? profile.email.split('@')[0] : "Loading...";

  const NavLinks = () => (
    <nav className="space-y-1">
      {navItems
        .filter((item) => !item.adminOnly || isAdmin) // This now works
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
                {item.adminOnly && (
                  <Shield className="ml-auto h-3 w-3 text-primary-foreground" />
                )}
              </Button>
            </Link>
          );
        })}
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
        <Button variant="outline" size="icon" className="hover:scale-105 transition-transform">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-gradient-to-b from-card to-background">
        <div className="py-4 space-y-6">
          <div className="px-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center ring-2 ring-primary/20">
                <img src={logoUrl} alt={businessName} className="w-10 h-10 object-contain" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-foreground">{businessName}</h2>
                <p className="text-xs text-muted-foreground">Point of Sale</p>
              </div>
            </div>
            
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Signed in as</span>
                <Badge variant={isAdmin ? "default" : "secondary"} className="text-[10px]">
                  {/* 6. This now reads from the local role */}
                  {role || "user"}
                </Badge>
              </div>
              {/* 7. This now reads from the local profile's email */}
              <p className="text-sm font-semibold text-foreground truncate">{userName}</p>
            </div>
          </div>
          
          <NavLinks />
        </div>
      </SheetContent>
    </Sheet>
  );
};