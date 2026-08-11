import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { usePerformanceMonitor } from "./hooks/usePerformanceMonitor";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import { syncService } from "./lib/syncService";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import POS from "./pages/POS";
import Auth from "./pages/Auth";
import Products from "./pages/Products";
import Customers from "./pages/Customers";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Loans from "./pages/Loans";
import Staff from "./pages/Staff";
import ControlPanel from "./pages/ControlPanel";
import NotFound from "./pages/NotFound";
import UpdatePassword from "./pages/UpdatePassword";
import StressTest from "./pages/StressTest";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 3,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

const AppContent = () => {
  usePerformanceMonitor();
  useNetworkStatus();
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    syncService.startAutoSync();
    checkSuspension();
    return () => syncService.stopAutoSync();
  }, []);

  const checkSuspension = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles' as any)
        .select('status')
        .eq('id', user.id)
        .single();

      if ((data as any)?.status === 'suspended' || (data as any)?.status === 'banned') {
        setIsSuspended(true);
      }
    }
  };

  if (isSuspended) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-destructive/10 p-4 text-center">
        <h1 className="text-3xl font-bold text-destructive mb-2">Account Suspended</h1>
        <p className="text-muted-foreground">Your access to this application has been restricted by the administrator.</p>
        <button
          onClick={() => supabase.auth.signOut().then(() => window.location.reload())}
          className="mt-4 px-4 py-2 bg-destructive text-white rounded hover:bg-destructive/90"
        >
          Sign Out
        </button>
      </div>
    );
  }

  const DeveloperRoute = ({ children }: { children: React.ReactNode }) => {
    const [isDev, setIsDev] = useState<boolean | null>(null);

    useEffect(() => {
      const checkDevStatus = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsDev(false);
          return;
        }

        // Check user_roles table for role
        const { data } = await supabase
          .from('user_roles' as any)
          .select('role')
          .eq('user_id', user.id)
          .single();

        const userRole = (data as any)?.role;

        // Allow if role is 'admin' (or 'developer' if added to enum)
        // Fallback to email check for legacy support
        const isAuthorized =
          userRole === 'admin' ||
          userRole === 'developer';

        setIsDev(!!isAuthorized);
      };

      checkDevStatus();
    }, []);

    if (isDev === null) return null; // Loading

    if (!isDev) {
      return <Navigate to="/" replace />;
    }

    return <>{children}</>;
  };

  return (
    <>
      <Toaster />
      <Sonner />
      <HashRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/pos" replace />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/update-password" element={<UpdatePassword />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/products" element={<Products />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/loans" element={<Loans />} />
          <Route path="/reports" element={<Reports />} /> {/* Visible to all */}
          <Route path="/staff" element={<DeveloperRoute><Staff /></DeveloperRoute>} /> {/* Developer only */}
          <Route path="/control-panel" element={<DeveloperRoute><ControlPanel /></DeveloperRoute>} /> {/* Developer only */}
          <Route path="/stress-test" element={<DeveloperRoute><StressTest /></DeveloperRoute>} /> {/* Developer only */}
          <Route path="/settings" element={<Settings />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppContent />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
