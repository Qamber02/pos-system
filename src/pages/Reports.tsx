import { useState, useEffect } from "react";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Dashboard } from "@/components/Dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Download, Eye, FileSpreadsheet } from "lucide-react";
import * as XLSX from 'xlsx';
import { format, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Sale {
  id: string;
  receipt_number: string;
  created_at: string;
  total_amount: number;
  subtotal: number;
  payment_method: string;
  customers?: { name: string } | null;
  sale_items?: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal?: number; // Optional, might be missing
    total_price?: number; // Added total_price
  }>;
  products?: {
    cost_price: number;
  } | null;
}

const Reports = () => {
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [filteredSales, setFilteredSales] = useState<Sale[]>([]);
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(new Date()));
  const formatPrice = useFormatCurrency();
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchSales();
  }, []);

  useEffect(() => {
    filterSales();
  }, [sales, startDate, endDate, paymentFilter]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchSales = async () => {
    try {
      const { data, error } = await supabase
        .from("sales")
        .select(`
  *,
  customers(name),
  sale_items(
    product_name,
    quantity,
    unit_price,
    total_price
  )
    `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSales((data as any) || []);
    } catch (error: any) {
      toast.error("Error loading sales");
    }
  };

  const filterSales = () => {
    let filtered = sales;

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter((sale) => new Date(sale.created_at) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((sale) => new Date(sale.created_at) <= end);
    }

    if (paymentFilter !== "all") {
      filtered = filtered.filter((sale) => sale.payment_method === paymentFilter);
    }

    setFilteredSales(filtered);
  };

  const viewDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setDetailsOpen(true);
  };

  const exportToExcel = async () => {
    try {
      toast.loading("Generating professional report...");

      // Fetch all products with cost prices for profit calculation
      const { data: products } = await supabase
        .from("products")
        .select("id, name, cost_price, retail_price");

      const productCostMap = new Map(
        products?.map(p => [p.id, { cost: Number(p.cost_price || 0), retail: Number(p.retail_price) }]) || []
      );

      // --- 1. Calculate Metrics ---

      // Daily Data (for graphs)
      const dailyMap = new Map<string, { revenue: number; profit: number; transactions: number }>();

      // Product Data
      const productStatsMap = new Map<string, { revenue: number; profit: number; quantity: number }>();

      let totalRev = 0;
      let totalCst = 0;
      let todayRev = 0;
      let todayProfit = 0;
      const todayStr = format(new Date(), "yyyy-MM-dd");

      filteredSales.forEach(sale => {
        const dateStr = format(new Date(sale.created_at), "yyyy-MM-dd");
        const isToday = dateStr === todayStr;

        let saleCost = 0;

        sale.sale_items?.forEach(item => {
          const productId = products?.find(p => p.name === item.product_name)?.id;
          const costInfo = productId ? productCostMap.get(productId) : null;
          const unitCost = costInfo?.cost || Number(item.unit_price) * 0.6; // Fallback to 60% cost
          const itemCost = unitCost * item.quantity;
          // FIX: Use total_price, fallback to subtotal if missing
          const itemRevenue = Number(item.total_price || item.subtotal || 0);
          const itemProfit = itemRevenue - itemCost;

          saleCost += itemCost;

          // Update Product Stats
          const pStats = productStatsMap.get(item.product_name) || { revenue: 0, profit: 0, quantity: 0 };
          pStats.revenue += itemRevenue;
          pStats.profit += itemProfit;
          pStats.quantity += item.quantity;
          productStatsMap.set(item.product_name, pStats);
        });

        const saleRevenue = Number(sale.total_amount);
        const saleProfit = saleRevenue - saleCost;

        totalRev += saleRevenue;
        totalCst += saleCost;

        if (isToday) {
          todayRev += saleRevenue;
          todayProfit += saleProfit;
        }

        // Update Daily Stats
        const dStats = dailyMap.get(dateStr) || { revenue: 0, profit: 0, transactions: 0 };
        dStats.revenue += saleRevenue;
        dStats.profit += saleProfit;
        dStats.transactions += 1;
        dailyMap.set(dateStr, dStats);
      });

      const totalProf = totalRev - totalCst;
      const profMargin = totalRev > 0 ? (totalProf / totalRev) * 100 : 0;
      const todayMargin = todayRev > 0 ? (todayProfit / todayRev) * 100 : 0;

      // --- 2. Prepare Sheet Data ---

      // --- 2. Prepare Sheet Data ---

      // Sheet 1: Executive Dashboard (Summary)
      const dashboardData = [
        { Label: "EXECUTIVE SUMMARY", Value: "" },
        { Label: `Report Generated: ${format(new Date(), "PPP HH:mm")}`, Value: "" },
        { Label: "", Value: "" },
        { Label: "OVERALL PERFORMANCE", Value: "" },
        { Label: "Total Revenue", Value: totalRev },
        { Label: "Total Profit", Value: totalProf },
        { Label: "Profit Margin", Value: `${profMargin.toFixed(2)}%` },
        { Label: "Total Transactions", Value: filteredSales.length },
        { Label: "Avg Transaction Value", Value: filteredSales.length > 0 ? totalRev / filteredSales.length : 0 },
        { Label: "", Value: "" },
        { Label: "TODAY'S PERFORMANCE", Value: "" },
        { Label: "Sales Today", Value: todayRev },
        { Label: "Profit Today", Value: todayProfit },
        { Label: "Today's Margin", Value: `${todayMargin.toFixed(2)}%` },
        { Label: "", Value: "" },
        { Label: "TOP 5 PRODUCTS (REVENUE)", Value: "" },
      ];

      // Add Top 5 Products to Dashboard
      const sortedProducts = Array.from(productStatsMap.entries())
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 5);

      sortedProducts.forEach(([name, stats]) => {
        dashboardData.push({ Label: name, Value: stats.revenue });
      });

      // Sheet 2: Daily Sales (For Graphs)
      const dailyData = Array.from(dailyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, stats]) => ({
          DATE: date,
          REVENUE: stats.revenue,
          PROFIT: stats.profit,
          TRANSACTIONS: stats.transactions,
          AVG_ORDER_VALUE: stats.revenue / stats.transactions
        }));

      // Sheet 3: Product Performance
      const productData = Array.from(productStatsMap.entries())
        .sort((a, b) => b[1].profit - a[1].profit)
        .map(([name, stats]) => ({
          PRODUCT: name,
          UNITS_SOLD: stats.quantity,
          REVENUE: stats.revenue,
          PROFIT: stats.profit,
          MARGIN_PERCENT: stats.revenue > 0 ? (stats.profit / stats.revenue) * 100 : 0
        }));

      // Sheet 4: Raw Transactions
      const transactionData = filteredSales.map(sale => ({
        RECEIPT: sale.receipt_number,
        DATE: format(new Date(sale.created_at), "yyyy-MM-dd HH:mm"),
        CUSTOMER: sale.customers?.name || "Walk-in",
        PAYMENT: sale.payment_method.toUpperCase(),
        TOTAL: Number(sale.total_amount),
        ITEMS: sale.sale_items?.map(i => `${i.quantity}x ${i.product_name}`).join(", ")
      }));

      // --- 3. Create Workbook ---
      const wb = XLSX.utils.book_new();

      // Helper to append sheet with auto-width
      const appendSheet = (data: any[], name: string, colWidths: number[] = []) => {
        const ws = XLSX.utils.json_to_sheet(data);
        if (colWidths.length) {
          ws['!cols'] = colWidths.map(w => ({ wch: w }));
        }
        XLSX.utils.book_append_sheet(wb, ws, name);
      };

      appendSheet(dashboardData, "Executive Dashboard", [40, 25]);
      appendSheet(dailyData, "Daily Trends", [15, 15, 15, 15, 20]);
      appendSheet(productData, "Product Performance", [40, 15, 15, 15, 15]);
      appendSheet(transactionData, "Raw Transactions", [25, 25, 25, 15, 15, 60]);

      // --- 4. Export ---
      const fileName = `POS_Report_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast.dismiss();
      toast.success("Professional Report Downloaded!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export report");
    }
  };

  const formatCurrency = (amount: number) => {
    return formatPrice(amount);
  };

  const totalRevenue = filteredSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const totalTransactions = filteredSales.length;
  const averageTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  // Calculate monthly revenue
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthlyRevenue = sales
    .filter((sale) => {
      const saleDate = new Date(sale.created_at);
      return saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;
    })
    .reduce((sum, sale) => sum + Number(sale.total_amount), 0);

  // Calculate profit (simplified - would need cost data for accuracy)
  const totalCost = filteredSales.reduce((sum, sale) => sum + Number(sale.subtotal) * 0.6, 0); // Assuming 40% margin
  const totalProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // Prepare data for Sales Trend Chart (Last 7 days)
  const salesTrendData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = format(d, 'MMM dd');

    const dayRevenue = filteredSales
      .filter(sale => format(new Date(sale.created_at), 'MMM dd') === dateStr)
      .reduce((sum, sale) => sum + Number(sale.total_amount), 0);

    return { name: dateStr, total: dayRevenue };
  });

  // Prepare data for Top Products Chart
  const productSalesMap = new Map<string, number>();
  filteredSales.forEach(sale => {
    sale.sale_items?.forEach(item => {
      const current = productSalesMap.get(item.product_name) || 0;
      // FIX: Use total_price, fallback to subtotal if missing
      const itemRevenue = Number(item.total_price || item.subtotal || 0);
      productSalesMap.set(item.product_name, current + itemRevenue);
    });
  });

  const topProductsData = Array.from(productSalesMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Navigation />
          <h1 className="text-2xl font-bold">Sales Reports</h1>
        </div>
      </header>

      <div className="flex flex-1">
        <Navigation />
        <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
          <Dashboard />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Revenue</CardDescription>
                <CardTitle className="text-3xl">{formatCurrency(totalRevenue)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Monthly Revenue</CardDescription>
                <CardTitle className="text-3xl">{formatCurrency(monthlyRevenue)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Profit</CardDescription>
                <CardTitle className="text-3xl">{formatCurrency(totalProfit)}</CardTitle>
                <p className="text-xs text-muted-foreground">Margin: {profitMargin.toFixed(1)}%</p>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Avg. Transaction</CardDescription>
                <CardTitle className="text-3xl">{formatCurrency(averageTransaction)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4">
              <CardHeader>
                <CardTitle>Sales Overview</CardTitle>
              </CardHeader>
              <CardContent className="pl-2">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salesTrendData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="name"
                        stroke="#888888"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#888888"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => formatPrice(value)}
                      />
                      <Tooltip
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>Top Products</CardTitle>
                <CardDescription>
                  Best selling items by revenue
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] flex items-center justify-center">
                  {topProductsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={topProductsData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {topProductsData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatPrice(value)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-muted-foreground text-sm">No sales data available</div>
                  )}
                </div>
                <div className="mt-4 space-y-2">
                  {topProductsData.slice(0, 5).map((item, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span>{item.name}</span>
                      </div>
                      <span className="font-medium">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-4">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={startDate} onSelect={setStartDate} />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : "End date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={endDate} onSelect={setEndDate} />
                  </PopoverContent>
                </Popover>

                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payments</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>

                <Button onClick={exportToExcel} variant="outline" className="ml-auto">
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Export Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-mono text-sm">{sale.receipt_number}</TableCell>
                      <TableCell>{format(new Date(sale.created_at), "MMM dd, yyyy HH:mm")}</TableCell>
                      <TableCell>{sale.customers?.name || "Walk-in"}</TableCell>
                      <TableCell className="font-semibold">{formatCurrency(Number(sale.total_amount))}</TableCell>
                      <TableCell>
                        <Badge variant={sale.payment_method === "cash" ? "default" : "secondary"}>
                          {sale.payment_method}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => viewDetails(sale)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </main>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sale Details</DialogTitle>
            <DialogDescription>Receipt: {selectedSale?.receipt_number}</DialogDescription>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {format(new Date(selectedSale.created_at), "PPP HH:mm")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedSale.customers?.name || "Walk-in Customer"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment Method</p>
                  <p className="font-medium capitalize">{selectedSale.payment_method}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <p className="font-medium text-lg">{formatCurrency(Number(selectedSale.total_amount))}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Items</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSale.sale_items?.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{formatCurrency(Number(item.unit_price))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(item.total_price || item.subtotal || 0))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Reports;
