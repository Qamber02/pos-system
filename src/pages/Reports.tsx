import { useState, useEffect } from "react";
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
import { format } from "date-fns";
import { toast } from "sonner";
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
    subtotal: number;
  }>;
  products?: {
    cost_price: number;
  } | null;
}

const Reports = () => {
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [filteredSales, setFilteredSales] = useState<Sale[]>([]);
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
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
          customers (name),
          sale_items (
            product_name,
            quantity,
            unit_price,
            subtotal
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSales(data || []);
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
      // Fetch all products with cost prices for profit calculation
      const { data: products } = await supabase
        .from("products")
        .select("id, name, cost_price, retail_price");

      const productCostMap = new Map(
        products?.map(p => [p.id, { cost: Number(p.cost_price || 0), retail: Number(p.retail_price) }]) || []
      );

      // Product-level profit analysis
      const productProfitData: any[] = [];
      const productSalesMap = new Map<string, { 
        name: string; 
        quantity: number; 
        revenue: number; 
        cost: number; 
      }>();

      filteredSales.forEach(sale => {
        sale.sale_items?.forEach(item => {
          const existing = productSalesMap.get(item.product_name) || {
            name: item.product_name,
            quantity: 0,
            revenue: 0,
            cost: 0
          };

          const productId = Object.keys(products || {}).find(
            key => products?.find(p => p.name === item.product_name)?.id
          );
          const costInfo = productId ? productCostMap.get(productId) : null;
          const unitCost = costInfo?.cost || Number(item.unit_price) * 0.6;

          existing.quantity += item.quantity;
          existing.revenue += Number(item.subtotal);
          existing.cost += unitCost * item.quantity;

          productSalesMap.set(item.product_name, existing);
        });
      });

      productSalesMap.forEach((data, productName) => {
        const profit = data.revenue - data.cost;
        const margin = data.revenue > 0 ? (profit / data.revenue) * 100 : 0;

        productProfitData.push({
          'Product Name': data.name,
          'Units Sold': data.quantity,
          'Total Revenue (PKR)': data.revenue.toFixed(2),
          'Total Cost (PKR)': data.cost.toFixed(2),
          'Total Profit (PKR)': profit.toFixed(2),
          'Profit Margin (%)': margin.toFixed(2)
        });
      });

      // Sort by profit descending
      productProfitData.sort((a, b) => 
        parseFloat(b['Total Profit (PKR)']) - parseFloat(a['Total Profit (PKR)'])
      );

      // Monthly summary
      const monthlySummary: any[] = [];
      const monthlyMap = new Map<string, { revenue: number; cost: number; transactions: number }>();

      filteredSales.forEach(sale => {
        const monthKey = format(new Date(sale.created_at), "yyyy-MM");
        const existing = monthlyMap.get(monthKey) || { revenue: 0, cost: 0, transactions: 0 };
        
        let saleCost = 0;
        sale.sale_items?.forEach(item => {
          const productId = products?.find(p => p.name === item.product_name)?.id;
          const costInfo = productId ? productCostMap.get(productId) : null;
          const unitCost = costInfo?.cost || Number(item.unit_price) * 0.6;
          saleCost += unitCost * item.quantity;
        });

        existing.revenue += Number(sale.total_amount);
        existing.cost += saleCost;
        existing.transactions += 1;

        monthlyMap.set(monthKey, existing);
      });

      monthlyMap.forEach((data, month) => {
        const profit = data.revenue - data.cost;
        const margin = data.revenue > 0 ? (profit / data.revenue) * 100 : 0;

        monthlySummary.push({
          'Month': month,
          'Total Revenue (PKR)': data.revenue.toFixed(2),
          'Total Cost (PKR)': data.cost.toFixed(2),
          'Total Profit (PKR)': profit.toFixed(2),
          'Profit Margin (%)': margin.toFixed(2),
          'Transactions': data.transactions
        });
      });

      // Sales transactions
      const salesData = filteredSales.map((sale) => ({
        'Receipt Number': sale.receipt_number,
        'Date': format(new Date(sale.created_at), "yyyy-MM-dd HH:mm"),
        'Customer': sale.customers?.name || "Walk-in",
        'Total (PKR)': Number(sale.total_amount).toFixed(2),
        'Payment Method': sale.payment_method.toUpperCase(),
      }));

      // Overall summary
      const overallProfit = totalRevenue - totalCost;
      const summaryData = [
        { Metric: 'Total Revenue (PKR)', Value: totalRevenue.toFixed(2) },
        { Metric: 'Total Cost (PKR)', Value: totalCost.toFixed(2) },
        { Metric: 'Total Profit (PKR)', Value: overallProfit.toFixed(2) },
        { Metric: 'Profit Margin (%)', Value: profitMargin.toFixed(2) },
        { Metric: 'Total Transactions', Value: totalTransactions.toString() },
        { Metric: 'Average Transaction (PKR)', Value: averageTransaction.toFixed(2) },
      ];

      // Create workbook with formatted sheets
      const wb = XLSX.utils.book_new();
      
      // Summary sheet
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      wsSummary['!cols'] = [{ wch: 30 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
      
      // Monthly performance sheet
      const wsMonthly = XLSX.utils.json_to_sheet(monthlySummary);
      wsMonthly['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsMonthly, "Monthly Performance");

      // Product profit analysis sheet
      const wsProducts = XLSX.utils.json_to_sheet(productProfitData);
      wsProducts['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsProducts, "Product Profit Analysis");
      
      // Sales transactions sheet
      const wsSales = XLSX.utils.json_to_sheet(salesData);
      wsSales['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, wsSales, "Transactions");
      
      // Export with metadata
      const fileName = `sales-report-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      XLSX.writeFile(wb, fileName, { 
        bookType: 'xlsx',
        Props: {
          Title: "Sales & Profit Report",
          Subject: "Comprehensive Sales Analysis",
          Author: "POS SHOPPING",
          CreatedDate: new Date()
        }
      });
      
      toast.success("Comprehensive Excel report exported with profit analysis");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export report");
    }
  };

  const formatCurrency = (amount: number) => {
    return `PKR ${amount.toFixed(2)}`;
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
                        <TableCell className="text-right">{formatCurrency(Number(item.subtotal))}</TableCell>
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
