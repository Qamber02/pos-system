import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingBag, TrendingUp, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface DashboardStats {
  totalSales: number;
  transactionCount: number;
  averageSale: number;
  lowStockCount: number;
}

export const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalSales: 0,
    transactionCount: 0,
    averageSale: 0,
    lowStockCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Fetch sales data for today
        const { data: sales } = await supabase
          .from("sales")
          .select("total_amount")
          .gte("created_at", today.toISOString())
          .lt("created_at", tomorrow.toISOString());

        const totalSales = sales?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
        const transactionCount = sales?.length || 0;
        const averageSale = transactionCount > 0 ? totalSales / transactionCount : 0;

        // Fetch low stock products
        const { data: products } = await supabase
          .from("products")
          .select("stock_quantity, low_stock_threshold");

        const lowStockCount = products?.filter(
          (p) => p.stock_quantity <= p.low_stock_threshold
        ).length || 0;

        setStats({
          totalSales,
          transactionCount,
          averageSale,
          lowStockCount,
        });
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const formatCurrency = useFormatCurrency();

  const statCards = [
    {
      title: "Today's Sales",
      value: formatCurrency(stats.totalSales),
      icon: DollarSign,
      color: "bg-accent",
    },
    {
      title: "Transactions",
      value: stats.transactionCount.toString(),
      icon: ShoppingBag,
      color: "bg-primary",
    },
    {
      title: "Avg. Sale",
      value: formatCurrency(stats.averageSale),
      icon: TrendingUp,
      color: "bg-chart-4",
    },
    {
      title: "Low Stock Items",
      value: stats.lowStockCount.toString(),
      icon: Package,
      color: stats.lowStockCount > 0 ? "bg-warning" : "bg-chart-2",
    },
  ];

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-8 w-8 bg-muted rounded-lg" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-20 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title} className="shadow-card hover:shadow-elevated transition-all">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`${stat.color} p-2 rounded-lg`}>
                <Icon className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
