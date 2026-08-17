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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarIcon, Eye, FileSpreadsheet, Wrench, Truck, RotateCcw, ShoppingBag, DollarSign, TrendingUp, Cpu, Code } from "lucide-react";
import ExcelJS from 'exceljs';
import { format, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";

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
    subtotal?: number;
    total_price?: number;
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
  const [reportTab, setReportTab] = useState("overview");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Live queries for Repairs, Wholesalers, Payments, and Refunds
  const repairTickets = useLiveQuery(() => db.repairTickets.toArray()) || [];
  const repairParts = useLiveQuery(() => db.repairTicketParts.toArray()) || [];
  const wholesalers = useLiveQuery(() => db.wholesalers.toArray()) || [];
  const wholesalerIntakes = useLiveQuery(() => db.wholesalerIntakes.toArray()) || [];
  const wholesalerPayments = useLiveQuery(() => db.wholesalerPayments.toArray()) || [];
  const refunds = useLiveQuery(() => db.refunds.toArray()) || [];
  const customers = useLiveQuery(() => db.customers.toArray()) || [];

  const customerMap = new Map(customers.map(c => [c.id, c.name]));
  const wholesalerMap = new Map(wholesalers.map(w => [w.id, w.name]));

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
      // 1. Fetch from local Dexie database first (works offline)
      const localSales = await db.sales.toArray();
      const localSaleItems = await db.saleItems.toArray();
      const localCustomers = await db.customers.toArray();
      const custMap = new Map(localCustomers.map(c => [c.id, c.name]));

      const localCombined: Sale[] = localSales.map(s => {
        const items = localSaleItems.filter(i => i.sale_id === s.id);
        return {
          id: s.id,
          receipt_number: s.receipt_number,
          created_at: s.created_at || new Date(s.lastModified).toISOString(),
          total_amount: s.total_amount,
          subtotal: s.subtotal,
          payment_method: s.payment_method || 'cash',
          customers: s.customer_id ? { name: custMap.get(s.customer_id) || 'Customer' } : null,
          sale_items: items.map(i => ({
            product_name: i.product_name,
            quantity: i.quantity,
            unit_price: i.unit_price,
            subtotal: i.subtotal
          }))
        };
      });
      localCombined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setSales(localCombined);

      // 2. Fetch from Supabase cloud if online
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("sales")
          .select(`
            *,
            customers(name),
            sale_items(
              product_name,
              quantity,
              unit_price,
              subtotal
            )
          `)
          .order("created_at", { ascending: false });

        if (!error && data && data.length > 0) {
          setSales((data as any) || []);
        }
      }
    } catch (err) {
      console.error("Error loading sales in reports:", err);
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

  // Date Filtered Repair Tickets, Intakes & Refunds (with immutable date bounds)
  const startBound = startDate ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0).getTime() : null;
  const endBound = endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999).getTime() : null;

  const filteredRepairs = repairTickets.filter(t => {
    const time = new Date(t.created_at || Date.now()).getTime();
    if (startBound !== null && time < startBound) return false;
    if (endBound !== null && time > endBound) return false;
    return true;
  });

  const filteredIntakes = wholesalerIntakes.filter(i => {
    const time = new Date(i.intake_date || i.created_at || Date.now()).getTime();
    if (startBound !== null && time < startBound) return false;
    if (endBound !== null && time > endBound) return false;
    return true;
  });

  const filteredRefunds = refunds.filter(r => {
    const time = new Date(r.created_at || Date.now()).getTime();
    if (startBound !== null && time < startBound) return false;
    if (endBound !== null && time > endBound) return false;
    return true;
  });

  const filteredPayments = wholesalerPayments.filter(p => {
    const time = new Date(p.payment_date || p.created_at || Date.now()).getTime();
    if (startBound !== null && time < startBound) return false;
    if (endBound !== null && time > endBound) return false;
    return true;
  });

  // Comprehensive Financial Totals
  const totalSalesRevenue = filteredSales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
  const totalRepairRevenue = filteredRepairs.reduce((sum, t) => sum + (t.estimated_cost || 0), 0);
  const totalWholesalerCost = filteredIntakes.reduce((sum, i) => sum + (i.total_cost || 0), 0);
  const totalRefundsAmount = filteredRefunds.reduce((sum, r) => sum + (r.amount || 0), 0);

  // Cash Drawer & Payment Methods Reconciliation
  const cashSales = filteredSales.filter(s => (s.payment_method || 'cash').toLowerCase() === 'cash').reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const cardSales = filteredSales.filter(s => (s.payment_method || '').toLowerCase() === 'card').reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const otherSales = filteredSales.filter(s => !['cash', 'card'].includes((s.payment_method || '').toLowerCase())).reduce((sum, s) => sum + Number(s.total_amount || 0), 0);

  const cashRefunds = filteredRefunds.filter(r => (r.payment_method || 'cash').toLowerCase() === 'cash').reduce((sum, r) => sum + (r.amount || 0), 0);
  const cashWholesalerPayouts = filteredPayments.filter(p => (p.payment_method || 'cash').toLowerCase() === 'cash').reduce((sum, p) => sum + (p.amount || 0), 0);
  const netDrawerCashFlow = cashSales - cashRefunds - cashWholesalerPayouts;

  // Estimated POS Sales Cost (Assuming 60% cost / 40% margin for products)
  const totalSalesCost = filteredSales.reduce((sum, sale) => sum + Number(sale.subtotal || 0) * 0.6, 0);
  const posSalesProfit = totalSalesRevenue - totalSalesCost;
  const repairProfit = totalRepairRevenue - totalWholesalerCost;

  // Combined Grand Net Profit
  const combinedNetProfit = posSalesProfit + repairProfit - totalRefundsAmount;

  const viewDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setDetailsOpen(true);
  };

  const exportToExcel = async () => {
    try {
      toast.loading("Generating comprehensive multi-sheet executive report...");

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "POS & Repair Management System";
      workbook.created = new Date();

      // --- Helper: Build Styled Sheet ---
      const buildStyledSheet = (
        sheetTitleName: string,
        bannerTitleText: string,
        headerTitles: string[],
        dataRows: any[][],
        colTypes: ('text' | 'currency' | 'number' | 'percent')[],
        totalRowValues?: any[]
      ) => {
        const ws = workbook.addWorksheet(sheetTitleName, { views: [{ showGridLines: true }] });

        // Row 1: Banner Title
        const titleRow = ws.addRow([bannerTitleText]);
        ws.mergeCells(1, 1, 1, Math.max(headerTitles.length, 1));
        titleRow.height = 36;
        const tCell = titleRow.getCell(1);
        tCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
        tCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

        // Subheader Date Range
        const subRow = ws.addRow([`Report Date Range: ${startDate ? format(startDate, "yyyy-MM-dd") : "All Time"} to ${endDate ? format(endDate, "yyyy-MM-dd") : "All Time"} | Exported: ${format(new Date(), "yyyy-MM-dd HH:mm")}`]);
        ws.mergeCells(2, 1, 2, Math.max(headerTitles.length, 1));
        subRow.height = 20;
        subRow.getCell(1).font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF475569' } };
        subRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

        ws.addRow([]);

        // Row 4: Headers
        const hRow = ws.addRow(headerTitles);
        hRow.height = 26;
        hRow.eachCell((cell, colNum) => {
          cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
          cell.alignment = { vertical: 'middle', horizontal: colTypes[colNum - 1] === 'text' ? 'left' : 'right' };
          cell.border = {
            top: { style: 'medium', color: { argb: 'FF0F172A' } },
            bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
            left: { style: 'thin', color: { argb: 'FF334155' } },
            right: { style: 'thin', color: { argb: 'FF334155' } }
          };
        });

        // Data Rows
        dataRows.forEach((rowVals, rIdx) => {
          const row = ws.addRow(rowVals);
          row.height = 22;
          const bg = rIdx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';

          row.eachCell((cell, colNum) => {
            const type = colTypes[colNum - 1] || 'text';
            cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF0F172A' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };

            if (type === 'currency') {
              cell.numFmt = '"PKR "#,##0.00';
              cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else if (type === 'number') {
              cell.numFmt = '#,##0';
              cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else if (type === 'percent') {
              cell.numFmt = '0.00%';
              cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else {
              cell.alignment = { vertical: 'middle', horizontal: 'left' };
            }
          });
        });

        if (totalRowValues) {
          const totRow = ws.addRow(totalRowValues);
          totRow.height = 26;
          totRow.eachCell((cell, colNum) => {
            const type = colTypes[colNum - 1] || 'text';
            cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F172A' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF0F172A' } },
              bottom: { style: 'double', color: { argb: 'FF0F172A' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
            if (type === 'currency') cell.numFmt = '"PKR "#,##0.00';
            if (type === 'number') cell.numFmt = '#,##0';
            if (type === 'percent') cell.numFmt = '0.00%';
          });
        }

        ws.columns.forEach((column) => {
          let maxLen = 12;
          column.eachCell!({ includeEmpty: false }, (cell) => {
            const str = cell.value ? String(cell.value) : '';
            if (str.length > maxLen) maxLen = str.length;
          });
          column.width = Math.min(maxLen + 4, 55);
        });
      };

      // 1. EXECUTIVE SUMMARY SHEET
      const summaryWs = workbook.addWorksheet("Executive Summary", { views: [{ showGridLines: true }] });
      const titleR = summaryWs.addRow(["COMPREHENSIVE POS & REPAIR EXECUTIVE DASHBOARD"]);
      summaryWs.mergeCells(1, 1, 1, 3);
      titleR.height = 36;
      const tCell = titleR.getCell(1);
      tCell.font = { name: 'Segoe UI', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
      tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      tCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

      summaryWs.addRow([`Report Generated: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}`]);
      summaryWs.addRow([`Date Filter: ${startDate ? format(startDate, "yyyy-MM-dd") : "All Time"} to ${endDate ? format(endDate, "yyyy-MM-dd") : "All Time"}`]);
      summaryWs.addRow([]);

      const summaryHeader = summaryWs.addRow(["Financial Metric", "Value (PKR / Count)"]);
      summaryHeader.height = 24;
      [1, 2].forEach(c => {
        const cell = summaryHeader.getCell(c);
        cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      });

      const metrics = [
        ["POS Sales Revenue", totalSalesRevenue, 'currency'],
        ["Est. POS Cost of Goods Sold", totalSalesCost, 'currency'],
        ["Est. POS Net Sales Profit", posSalesProfit, 'currency'],
        ["Repair Jobs Revenue", totalRepairRevenue, 'currency'],
        ["Wholesaler Sourced Part Expenses", totalWholesalerCost, 'currency'],
        ["Net Repair Service Profit", repairProfit, 'currency'],
        ["Refunds Processed & Deducted", totalRefundsAmount, 'currency'],
        ["Net Combined Shop Profit", combinedNetProfit, 'currency'],
        ["Total Completed Repair Tickets", filteredRepairs.length, 'number'],
        ["Total Counter Sales Receipts", filteredSales.length, 'number'],
      ];

      metrics.forEach(([label, val, type], idx) => {
        const row = summaryWs.addRow([label, val]);
        row.height = 22;
        const bg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';

        const c1 = row.getCell(1);
        c1.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

        const c2 = row.getCell(2);
        c2.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
        c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        if (type === 'currency') c2.numFmt = '"PKR "#,##0.00';
        if (type === 'number') c2.numFmt = '#,##0';
      });

      summaryWs.columns.forEach((column) => {
        let maxLen = 12;
        column.eachCell!({ includeEmpty: false }, (cell) => {
          const str = cell.value ? String(cell.value) : '';
          if (str.length > maxLen) maxLen = str.length;
        });
        column.width = Math.min(maxLen + 4, 55);
      });

      // 2. ITEMIZED POS SALES DETAIL SHEET
      const posDataRows: any[][] = [];
      let posUnitsSoldTotal = 0;

      filteredSales.forEach(sale => {
        const dateStr = format(new Date(sale.created_at), "yyyy-MM-dd HH:mm");
        const customerName = sale.customers?.name || "Walk-in Customer";
        const paymentMethod = (sale.payment_method || "cash").toUpperCase();

        sale.sale_items?.forEach(item => {
          const prodName = item.product_name || "Product Item";
          const qty = Number(item.quantity || 1);
          const unitPrice = Number(item.unit_price || 0);
          const itemRevenue = Number(item.subtotal || item.total_price || (unitPrice * qty));
          posUnitsSoldTotal += qty;

          posDataRows.push([
            sale.receipt_number,
            dateStr,
            customerName,
            prodName,
            qty,
            unitPrice,
            itemRevenue,
            paymentMethod
          ]);
        });
      });

      buildStyledSheet(
        "POS Sales Detail",
        "ITEMIZED COUNTER SALES & PRODUCT RECEIPTS RECORD",
        ["Receipt #", "Date & Time", "Customer Name", "Product Name", "Quantity", "Unit Price (PKR)", "Item Revenue (PKR)", "Payment Method"],
        posDataRows,
        ['text', 'text', 'text', 'text', 'number', 'currency', 'currency', 'text'],
        ["TOTALS", "", "", "", posUnitsSoldTotal, "", totalSalesRevenue, ""]
      );

      // 3. REPAIR JOBS SHEET
      const repairDataRows = filteredRepairs.map(t => {
        const parts = repairParts.filter(p => p.repair_ticket_id === t.id && !['returned', 'broken'].includes(p.status));
        const partCostSum = parts.reduce((sum, p) => sum + (p.unit_cost * p.quantity), 0);
        const customerCharge = t.estimated_cost || 0;
        const profit = customerCharge - partCostSum;

        return [
          t.ticket_number,
          t.repair_type === 'software' ? 'SOFTWARE' : 'HARDWARE',
          format(new Date(t.created_at || Date.now()), "yyyy-MM-dd HH:mm"),
          t.device_name,
          customerMap.get(t.customer_id || "") || "Walk-in Customer",
          t.status.toUpperCase(),
          customerCharge,
          partCostSum,
          profit
        ];
      });

      buildStyledSheet(
        "Repair Jobs Report",
        "REPAIR TICKETS, PARTS COST & PROFIT RECORD",
        ["Ticket #", "Type", "Date & Time", "Device Name", "Customer", "Status", "Customer Charge (PKR)", "Wholesaler Part Cost (PKR)", "Net Repair Profit (PKR)"],
        repairDataRows,
        ['text', 'text', 'text', 'text', 'text', 'text', 'currency', 'currency', 'currency'],
        ["TOTALS", "", "", "", "", "", totalRepairRevenue, totalWholesalerCost, repairProfit]
      );

      // 4. WHOLESALER CONSIGNMENT SHEET
      const intakeDataRows = filteredIntakes.map(i => [
        wholesalerMap.get(i.wholesaler_id) || "Unknown Supplier",
        format(new Date(i.intake_date || i.created_at || Date.now()), "yyyy-MM-dd"),
        i.item_name,
        i.quantity,
        i.agreed_unit_cost,
        i.total_cost,
        i.amount_paid,
        i.total_cost - i.amount_paid,
        i.status.toUpperCase()
      ]);

      const totalIntakePaid = filteredIntakes.reduce((sum, i) => sum + (i.amount_paid || 0), 0);
      const totalIntakeOwed = totalWholesalerCost - totalIntakePaid;

      buildStyledSheet(
        "Wholesaler Consignment",
        "WHOLESALER INTAKES & SUPPLIER CREDIT RECORD",
        ["Wholesaler Name", "Date", "Item Name", "Qty", "Agreed Cost (PKR)", "Total Cost (PKR)", "Amount Paid (PKR)", "Remaining Owed (PKR)", "Status"],
        intakeDataRows,
        ['text', 'text', 'text', 'number', 'currency', 'currency', 'currency', 'currency', 'text'],
        ["TOTALS", "", "", "", "", totalWholesalerCost, totalIntakePaid, totalIntakeOwed, ""]
      );

      // 5. REFUNDS LOG SHEET
      const refundDataRows = filteredRefunds.map(r => [
        r.refund_number,
        format(new Date(r.created_at || Date.now()), "yyyy-MM-dd HH:mm"),
        r.refund_type.toUpperCase(),
        r.amount,
        r.payment_method.toUpperCase(),
        r.reason
      ]);

      buildStyledSheet(
        "Refunds Audit Log",
        "PROCESSED REFUNDS AUDIT TRAIL",
        ["Refund #", "Date & Time", "Type", "Amount (PKR)", "Payment Method", "Reason"],
        refundDataRows,
        ['text', 'text', 'text', 'currency', 'text', 'text'],
        ["TOTALS", "", "", totalRefundsAmount, "", ""]
      );

      // Download Buffer
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `POS_and_Repair_Executive_Report_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(downloadUrl);

      toast.dismiss();
      toast.success("Complete Executive Multi-Sheet Excel Report Downloaded!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export report");
    }
  };

  const salesTrendData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = format(d, 'MMM dd');

    const daySales = filteredSales
      .filter(sale => format(new Date(sale.created_at), 'MMM dd') === dateStr)
      .reduce((sum, sale) => sum + Number(sale.total_amount), 0);

    const dayRepairs = filteredRepairs
      .filter(t => format(new Date(t.created_at || Date.now()), 'MMM dd') === dateStr)
      .reduce((sum, t) => sum + (t.estimated_cost || 0), 0);

    return { name: dateStr, sales: daySales, repairs: dayRepairs, total: daySales + dayRepairs };
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/95 backdrop-blur-md shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 pl-14 flex items-center gap-4">
          <Navigation />
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Executive Sales & Repair Reports
          </h1>
        </div>
      </header>

      <div className="flex flex-1">
        <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
          <Dashboard />

          {/* Combined Executive Financial KPI Banner */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1 text-xs uppercase font-semibold">
                  <ShoppingBag className="h-3.5 w-3.5 text-blue-600" /> POS Sales Revenue
                </CardDescription>
                <CardTitle className="text-2xl text-blue-600">{formatPrice(totalSalesRevenue)}</CardTitle>
                <p className="text-xs text-muted-foreground">{filteredSales.length} Orders</p>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1 text-xs uppercase font-semibold">
                  <Wrench className="h-3.5 w-3.5 text-purple-600" /> Repair Income
                </CardDescription>
                <CardTitle className="text-2xl text-purple-600">{formatPrice(totalRepairRevenue)}</CardTitle>
                <p className="text-xs text-muted-foreground">{filteredRepairs.length} Repair Jobs</p>
              </CardHeader>
            </Card>

            <Card className="bg-amber-50/40 dark:bg-amber-950/20 border-amber-200">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1 text-xs uppercase font-semibold text-amber-700 dark:text-amber-300">
                  <Truck className="h-3.5 w-3.5 text-amber-600" /> Wholesaler Part Costs
                </CardDescription>
                <CardTitle className="text-2xl text-amber-600">{formatPrice(totalWholesalerCost)}</CardTitle>
                <p className="text-xs text-amber-700 dark:text-amber-400">{filteredIntakes.length} Consignments</p>
              </CardHeader>
            </Card>

            <Card className="bg-rose-50/40 dark:bg-rose-950/20 border-rose-200">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1 text-xs uppercase font-semibold text-rose-700 dark:text-rose-300">
                  <RotateCcw className="h-3.5 w-3.5 text-rose-600" /> Refunds Issued
                </CardDescription>
                <CardTitle className="text-2xl text-rose-600">-{formatPrice(totalRefundsAmount)}</CardTitle>
                <p className="text-xs text-rose-700 dark:text-rose-400">{filteredRefunds.length} Refunds</p>
              </CardHeader>
            </Card>

            <Card className="bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1 text-xs uppercase font-semibold text-emerald-800 dark:text-emerald-300">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600" /> Net Combined Profit
                </CardDescription>
                <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400 font-extrabold">{formatPrice(combinedNetProfit)}</CardTitle>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Sales + Repair Net</p>
              </CardHeader>
            </Card>
          </div>

          {/* Date & Payment Controls Banner */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-card border rounded-lg shadow-2xs">
            <div className="flex flex-wrap items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs font-normal">
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {startDate ? format(startDate, "PPP") : "Start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs font-normal">
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {endDate ? format(endDate, "PPP") : "End date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} />
                </PopoverContent>
              </Popover>

              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={exportToExcel} className="h-8 text-xs font-semibold shadow-xs">
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              Export Full Excel Report
            </Button>
          </div>

          {/* Main Reports Navigation Tabs */}
          <Tabs value={reportTab} onValueChange={setReportTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Executive Overview</TabsTrigger>
              <TabsTrigger value="drawer">Drawer & Payment Reconciliation</TabsTrigger>
              <TabsTrigger value="repairs">Repair Jobs ({filteredRepairs.length})</TabsTrigger>
              <TabsTrigger value="wholesalers">Wholesaler Intakes ({filteredIntakes.length})</TabsTrigger>
              <TabsTrigger value="refunds">Refunds Log ({filteredRefunds.length})</TabsTrigger>
              <TabsTrigger value="sales">POS Sales ({filteredSales.length})</TabsTrigger>
            </TabsList>

            {/* Tab 1: Executive Overview Charts */}
            <TabsContent value="overview">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-7">
                  <CardHeader>
                    <CardTitle className="text-base">Revenue Breakdown (POS Sales vs Repairs)</CardTitle>
                  </CardHeader>
                  <CardContent className="pl-2">
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={salesTrendData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => formatPrice(val)} />
                          <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                          <Bar dataKey="sales" name="POS Sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="repairs" name="Repair Revenue" fill="#9333ea" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Tab: Drawer & Payment Reconciliation */}
            <TabsContent value="drawer">
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-200">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase font-semibold text-emerald-800 dark:text-emerald-300">
                      Cash Inflows (Sales)
                    </CardDescription>
                    <CardTitle className="text-2xl text-emerald-600 font-bold">{formatPrice(cashSales)}</CardTitle>
                    <p className="text-xs text-muted-foreground">{filteredSales.filter(s => (s.payment_method || 'cash').toLowerCase() === 'cash').length} Cash Transactions</p>
                  </CardHeader>
                </Card>

                <Card className="bg-rose-50/30 dark:bg-rose-950/20 border-rose-200">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase font-semibold text-rose-800 dark:text-rose-300">
                      Cash Outflows (Refunds & Payouts)
                    </CardDescription>
                    <CardTitle className="text-2xl text-rose-600 font-bold">-{formatPrice(cashRefunds + cashWholesalerPayouts)}</CardTitle>
                    <p className="text-xs text-muted-foreground">Refunds: {formatPrice(cashRefunds)} | Supplier Payouts: {formatPrice(cashWholesalerPayouts)}</p>
                  </CardHeader>
                </Card>

                <Card className="bg-primary/5 border-primary/20">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase font-semibold text-primary">
                      Net Physical Cash Movement
                    </CardDescription>
                    <CardTitle className={`text-2xl font-extrabold ${netDrawerCashFlow >= 0 ? 'text-primary' : 'text-rose-600'}`}>
                      {formatPrice(netDrawerCashFlow)}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Expected change in physical cash drawer</p>
                  </CardHeader>
                </Card>
              </div>

              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Payment Method Breakdown</CardTitle>
                  <CardDescription className="text-xs">Summary of transactions across Cash, Credit Card, and other tender types.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment Method</TableHead>
                        <TableHead>Transaction Count</TableHead>
                        <TableHead>Gross Inflow</TableHead>
                        <TableHead>Refunds / Outflows</TableHead>
                        <TableHead className="text-right">Net Received</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-semibold">Cash (Drawer)</TableCell>
                        <TableCell>{filteredSales.filter(s => (s.payment_method || 'cash').toLowerCase() === 'cash').length} sales</TableCell>
                        <TableCell className="text-emerald-600 font-semibold">{formatPrice(cashSales)}</TableCell>
                        <TableCell className="text-rose-600">-{formatPrice(cashRefunds + cashWholesalerPayouts)}</TableCell>
                        <TableCell className="text-right font-bold text-primary">{formatPrice(netDrawerCashFlow)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-semibold">Credit / Debit Card</TableCell>
                        <TableCell>{filteredSales.filter(s => (s.payment_method || '').toLowerCase() === 'card').length} sales</TableCell>
                        <TableCell className="text-emerald-600 font-semibold">{formatPrice(cardSales)}</TableCell>
                        <TableCell className="text-rose-600">-{formatPrice(filteredRefunds.filter(r => r.payment_method === 'card').reduce((s, r) => s + (r.amount || 0), 0))}</TableCell>
                        <TableCell className="text-right font-bold text-primary">
                          {formatPrice(cardSales - filteredRefunds.filter(r => r.payment_method === 'card').reduce((s, r) => s + (r.amount || 0), 0))}
                        </TableCell>
                      </TableRow>
                      {otherSales > 0 && (
                        <TableRow>
                          <TableCell className="font-semibold">Other Methods</TableCell>
                          <TableCell>{filteredSales.filter(s => !['cash', 'card'].includes((s.payment_method || '').toLowerCase())).length} sales</TableCell>
                          <TableCell className="text-emerald-600 font-semibold">{formatPrice(otherSales)}</TableCell>
                          <TableCell className="text-rose-600">-</TableCell>
                          <TableCell className="text-right font-bold text-primary">{formatPrice(otherSales)}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 2: Repair Jobs Report */}
            <TabsContent value="repairs">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-primary" /> Repair Jobs & Part Profitability Report
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticket #</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Device & Model</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Customer Charge</TableHead>
                        <TableHead>Wholesaler Part Cost</TableHead>
                        <TableHead className="text-right">Net Repair Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRepairs.map((ticket) => {
                        const parts = repairParts.filter(p => p.repair_ticket_id === ticket.id && !['returned', 'broken'].includes(p.status));
                        const partCostSum = parts.reduce((sum, p) => sum + (p.unit_cost * p.quantity), 0);
                        const customerCharge = ticket.estimated_cost || 0;
                        const netTicketProfit = customerCharge - partCostSum;

                        return (
                          <TableRow key={ticket.id}>
                            <TableCell className="font-mono font-bold text-primary text-xs">{ticket.ticket_number}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 inline-flex items-center gap-1 font-semibold ${
                                ticket.repair_type === 'software'
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800'
                                  : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800'
                              }`}>
                                {ticket.repair_type === 'software' ? <Code className="h-2.5 w-2.5 text-indigo-600" /> : <Cpu className="h-2.5 w-2.5 text-blue-600" />}
                                {ticket.repair_type === 'software' ? 'Software' : 'Hardware'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{new Date(ticket.created_at || Date.now()).toLocaleDateString()}</TableCell>
                            <TableCell className="font-medium text-xs">{ticket.device_name}</TableCell>
                            <TableCell className="text-xs">{customerMap.get(ticket.customer_id || "") || "Walk-in Customer"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-[10px]">{ticket.status.replace('_', ' ')}</Badge>
                            </TableCell>
                            <TableCell className="font-bold text-xs">{formatPrice(customerCharge)}</TableCell>
                            <TableCell className="text-xs font-semibold text-amber-600">-{formatPrice(partCostSum)}</TableCell>
                            <TableCell className="text-right font-extrabold text-xs text-emerald-600">{formatPrice(netTicketProfit)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 3: Wholesaler Intakes Report */}
            <TabsContent value="wholesalers">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Truck className="h-5 w-5 text-primary" /> Wholesaler Intakes & Consignment Expenses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Wholesaler Supplier</TableHead>
                        <TableHead>Item / Part Name</TableHead>
                        <TableHead>Qty x Unit Cost</TableHead>
                        <TableHead>Total Agreed Cost</TableHead>
                        <TableHead>Amount Paid</TableHead>
                        <TableHead className="text-right">Balance Owed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredIntakes.map((intake) => (
                        <TableRow key={intake.id}>
                          <TableCell className="text-xs font-mono">{new Date(intake.intake_date || intake.created_at || Date.now()).toLocaleDateString()}</TableCell>
                          <TableCell className="font-bold text-xs text-primary">{wholesalerMap.get(intake.wholesaler_id) || "Supplier"}</TableCell>
                          <TableCell className="text-xs font-medium">{intake.item_name}</TableCell>
                          <TableCell className="text-xs">{intake.quantity}x @ {formatPrice(intake.agreed_unit_cost)}</TableCell>
                          <TableCell className="text-xs font-bold text-amber-600">{formatPrice(intake.total_cost)}</TableCell>
                          <TableCell className="text-xs font-semibold text-emerald-600">{formatPrice(intake.amount_paid)}</TableCell>
                          <TableCell className="text-right font-bold text-xs">{formatPrice(intake.total_cost - intake.amount_paid)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 4: Refunds Audit Log */}
            <TabsContent value="refunds">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <RotateCcw className="h-5 w-5 text-rose-600" /> Processed Refunds Audit Log
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Refund #</TableHead>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount Refunded</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRefunds.map((ref) => (
                        <TableRow key={ref.id}>
                          <TableCell className="font-mono font-bold text-xs text-rose-600">{ref.refund_number}</TableCell>
                          <TableCell className="text-xs">{new Date(ref.created_at || Date.now()).toLocaleString()}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px] uppercase">{ref.refund_type}</Badge></TableCell>
                          <TableCell className="font-bold text-xs text-rose-600">-{formatPrice(ref.amount)}</TableCell>
                          <TableCell className="text-xs uppercase">{ref.payment_method}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground italic">{ref.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 5: POS Sales Receipts */}
            <TabsContent value="sales">
              <Card>
                <CardContent className="pt-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Receipt #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Total Amount</TableHead>
                        <TableHead>Payment Method</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell className="font-mono text-xs font-bold text-primary">{sale.receipt_number}</TableCell>
                          <TableCell className="text-xs">{format(new Date(sale.created_at), "MMM dd, yyyy HH:mm")}</TableCell>
                          <TableCell className="text-xs">{sale.customers?.name || "Walk-in Customer"}</TableCell>
                          <TableCell className="font-bold text-xs">{formatPrice(Number(sale.total_amount))}</TableCell>
                          <TableCell>
                            <Badge variant={sale.payment_method === "cash" ? "default" : "secondary"} className="text-[10px]">
                              {sale.payment_method}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => viewDetails(sale)}>
                              <Eye className="h-3.5 w-3.5 mr-1" /> View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sale Receipt Details</DialogTitle>
            <DialogDescription>Receipt: {selectedSale?.receipt_number}</DialogDescription>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{format(new Date(selectedSale.created_at), "PPP HH:mm")}</p>
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
                  <p className="font-medium text-lg text-primary">{formatPrice(Number(selectedSale.total_amount))}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-xs uppercase text-muted-foreground">Items Sold</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product Name</TableHead>
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
                        <TableCell>{formatPrice(Number(item.unit_price))}</TableCell>
                        <TableCell className="text-right font-bold">{formatPrice(Number(item.total_price || item.subtotal || 0))}</TableCell>
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
