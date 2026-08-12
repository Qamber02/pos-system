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
import ExcelJS from 'exceljs';
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
    subtotal
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
      toast.loading("Generating styled executive report with charts...");

      // Fetch products for cost mapping
      const { data: products } = await supabase
        .from("products")
        .select("id, name, cost_price, retail_price");

      const productCostMap = new Map(
        products?.map(p => [p.name.toLowerCase().trim(), { cost: Number(p.cost_price || 0), retail: Number(p.retail_price || 0) }]) || []
      );

      // Calculations & Aggregations
      const dailyMap = new Map<string, { revenue: number; profit: number; transactions: number; itemsSold: number }>();
      const productStatsMap = new Map<string, { revenue: number; profit: number; quantity: number }>();
      const paymentMap = new Map<string, { count: number; total: number }>();
      const itemizedData: any[][] = [];

      let totalRev = 0;
      let totalCst = 0;
      let totalUnitsSold = 0;
      let todayRev = 0;
      let todayProfit = 0;
      const todayStr = format(new Date(), "yyyy-MM-dd");

      filteredSales.forEach(sale => {
        const dateStr = format(new Date(sale.created_at), "yyyy-MM-dd");
        const dateTimeStr = format(new Date(sale.created_at), "yyyy-MM-dd HH:mm");
        const isToday = dateStr === todayStr;
        const customerName = sale.customers?.name || "Walk-in Customer";
        const paymentMethod = (sale.payment_method || "cash").toUpperCase();

        const pPay = paymentMap.get(paymentMethod) || { count: 0, total: 0 };
        pPay.count += 1;
        pPay.total += Number(sale.total_amount || 0);
        paymentMap.set(paymentMethod, pPay);

        let saleCost = 0;
        let saleItemsCount = 0;

        sale.sale_items?.forEach(item => {
          const prodName = item.product_name || "Unknown Product";
          const qty = Number(item.quantity || 1);
          const unitPrice = Number(item.unit_price || 0);
          const itemRevenue = Number(item.subtotal || item.total_price || (unitPrice * qty));

          const costInfo = productCostMap.get(prodName.toLowerCase().trim());
          const unitCost = costInfo ? costInfo.cost : unitPrice * 0.6;
          const itemCost = unitCost * qty;
          const itemProfit = itemRevenue - itemCost;

          saleCost += itemCost;
          saleItemsCount += qty;
          totalUnitsSold += qty;

          const pStats = productStatsMap.get(prodName) || { revenue: 0, profit: 0, quantity: 0 };
          pStats.revenue += itemRevenue;
          pStats.profit += itemProfit;
          pStats.quantity += qty;
          productStatsMap.set(prodName, pStats);

          itemizedData.push([
            sale.receipt_number,
            dateTimeStr,
            customerName,
            prodName,
            qty,
            Number(unitPrice.toFixed(2)),
            Number(itemRevenue.toFixed(2)),
            Number(unitCost.toFixed(2)),
            Number(itemProfit.toFixed(2)),
            paymentMethod
          ]);
        });

        const saleRevenue = Number(sale.total_amount || 0);
        const saleProfit = saleRevenue - saleCost;

        totalRev += saleRevenue;
        totalCst += saleCost;

        if (isToday) {
          todayRev += saleRevenue;
          todayProfit += saleProfit;
        }

        const dStats = dailyMap.get(dateStr) || { revenue: 0, profit: 0, transactions: 0, itemsSold: 0 };
        dStats.revenue += saleRevenue;
        dStats.profit += saleProfit;
        dStats.transactions += 1;
        dStats.itemsSold += saleItemsCount;
        dailyMap.set(dateStr, dStats);
      });

      const totalProf = totalRev - totalCst;
      const profMargin = totalRev > 0 ? (totalProf / totalRev) * 100 : 0;
      const todayMargin = todayRev > 0 ? (todayProfit / todayRev) * 100 : 0;

      // Initialize ExcelJS Workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "POS Shopping System";
      workbook.created = new Date();

      // --- Helper: Generate Visual Canvas Bar Chart Image ---
      const createChartCanvasPng = (
        chartTitle: string,
        labels: string[],
        series1: { name: string; values: number[]; color: string },
        series2?: { name: string; values: number[]; color: string }
      ): string => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        // White background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 640, 300);

        // Dark Top Header Banner
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(0, 0, 640, 38);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 13px "Segoe UI", sans-serif';
        ctx.fillText(chartTitle, 16, 24);

        // Chart Area Bounds
        const startX = 75;
        const startY = 250;
        const chartW = 530;
        const chartH = 180;

        const maxVal = Math.max(
          ...series1.values,
          ...(series2 ? series2.values : [0]),
          10
        );

        // Y Gridlines
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const y = startY - (chartH / 4) * i;
          ctx.beginPath();
          ctx.moveTo(startX, y);
          ctx.lineTo(startX + chartW, y);
          ctx.stroke();

          const valLabel = Math.round((maxVal / 4) * i);
          ctx.fillStyle = '#64748B';
          ctx.font = '10px "Segoe UI", sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(`PKR ${valLabel}`, startX - 8, y + 3);
        }

        // Legend Right Side of Banner
        let legX = 390;
        ctx.fillStyle = series1.color;
        ctx.fillRect(legX, 12, 12, 12);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 11px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(series1.name, legX + 16, 22);

        if (series2) {
          legX += 110;
          ctx.fillStyle = series2.color;
          ctx.fillRect(legX, 12, 12, 12);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(series2.name, legX + 16, 22);
        }

        // Bars
        const numGroups = Math.max(labels.length, 1);
        const groupW = chartW / numGroups;
        const barW = series2 ? Math.min(groupW / 2.6, 22) : Math.min(groupW / 1.5, 34);

        labels.forEach((label, i) => {
          const groupX = startX + i * groupW + groupW / 8;

          // Series 1
          const v1 = series1.values[i] || 0;
          const h1 = (v1 / maxVal) * chartH;
          ctx.fillStyle = series1.color;
          ctx.fillRect(groupX, startY - h1, barW, h1);

          // Series 2
          if (series2) {
            const v2 = series2.values[i] || 0;
            const h2 = (v2 / maxVal) * chartH;
            ctx.fillStyle = series2.color;
            ctx.fillRect(groupX + barW + 3, startY - h2, barW, h2);
          }

          // Label
          ctx.fillStyle = '#475569';
          ctx.font = '10px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          const shortLabel = label.length > 10 ? label.substring(0, 8) + '..' : label;
          ctx.fillText(shortLabel, groupX + (series2 ? barW : barW / 2), startY + 16);
        });

        return canvas.toDataURL('image/png');
      };

      // Generate Chart PNGs
      const sortedDaily = Array.from(dailyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      const dailyChartPng = createChartCanvasPng(
        "DAILY REVENUE VS NET PROFIT TREND (PKR)",
        sortedDaily.map(d => d[0]),
        { name: "Revenue", values: sortedDaily.map(d => d[1].revenue), color: "#2563EB" },
        { name: "Net Profit", values: sortedDaily.map(d => d[1].profit), color: "#059669" }
      );

      const topProducts = Array.from(productStatsMap.entries()).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 7);
      const productChartPng = createChartCanvasPng(
        "TOP REVENUE PRODUCTS (PKR)",
        topProducts.map(p => p[0]),
        { name: "Revenue", values: topProducts.map(p => p[1].revenue), color: "#3B82F6" },
        { name: "Profit", values: topProducts.map(p => p[1].profit), color: "#10B981" }
      );

      // --- SHEET 1: EXECUTIVE SUMMARY ---
      const summaryWs = workbook.addWorksheet("Executive Summary", { views: [{ showGridLines: true }] });

      // Title Banner
      const titleR = summaryWs.addRow(["POS RETAIL SALES EXECUTIVE DASHBOARD"]);
      summaryWs.mergeCells(1, 1, 1, 6);
      titleR.height = 36;
      const tCell = titleR.getCell(1);
      tCell.font = { name: 'Segoe UI', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
      tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      tCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

      summaryWs.addRow([`Report Generated: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}`]);
      summaryWs.addRow([`Date Filter: ${startDate ? format(startDate, "yyyy-MM-dd") : "All Time"} to ${endDate ? format(endDate, "yyyy-MM-dd") : "All Time"}`]);
      summaryWs.addRow([]);

      // Section 1: Financial Overview
      const sec1 = summaryWs.addRow(["FINANCIAL PERFORMANCE OVERVIEW"]);
      summaryWs.mergeCells(5, 1, 5, 2);
      sec1.height = 26;
      sec1.getCell(1).font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      sec1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      sec1.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

      const kpiH = summaryWs.addRow(["Performance Metric", "Value"]);
      kpiH.height = 24;
      [1, 2].forEach(col => {
        const cell = kpiH.getCell(col);
        cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'left' : 'right' };
      });

      const kpis: [string, number, 'currency' | 'percent' | 'number'][] = [
        ["Total Sales Revenue (PKR)", Number(totalRev.toFixed(2)), 'currency'],
        ["Total Estimated Cost (PKR)", Number(totalCst.toFixed(2)), 'currency'],
        ["Total Net Profit (PKR)", Number(totalProf.toFixed(2)), 'currency'],
        ["Overall Gross Margin", profMargin / 100, 'percent'],
        ["Total Completed Orders", filteredSales.length, 'number'],
        ["Total Item Units Sold", totalUnitsSold, 'number'],
        ["Average Order Value (PKR)", filteredSales.length > 0 ? totalRev / filteredSales.length : 0, 'currency']
      ];

      kpis.forEach(([metric, val, type], idx) => {
        const row = summaryWs.addRow([metric, val]);
        row.height = 22;
        const bg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';

        const c1 = row.getCell(1);
        c1.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c1.alignment = { vertical: 'middle', horizontal: 'left' };
        c1.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

        const c2 = row.getCell(2);
        c2.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
        c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c2.alignment = { vertical: 'middle', horizontal: 'right' };
        c2.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

        if (type === 'currency') c2.numFmt = '"PKR "#,##0.00';
        if (type === 'percent') c2.numFmt = '0.00%';
        if (type === 'number') c2.numFmt = '#,##0';
      });

      // Section 2: Today's Snapshot
      summaryWs.addRow([]);
      const sec2 = summaryWs.addRow(["TODAY'S PERFORMANCE SNAPSHOT"]);
      summaryWs.mergeCells(15, 1, 15, 2);
      sec2.height = 26;
      sec2.getCell(1).font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      sec2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      sec2.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

      const todayKpis: [string, number, 'currency' | 'percent'][] = [
        ["Today's Revenue (PKR)", Number(todayRev.toFixed(2)), 'currency'],
        ["Today's Net Profit (PKR)", Number(todayProfit.toFixed(2)), 'currency'],
        ["Today's Profit Margin", todayMargin / 100, 'percent']
      ];

      todayKpis.forEach(([metric, val, type], idx) => {
        const row = summaryWs.addRow([metric, val]);
        row.height = 22;
        const bg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';

        const c1 = row.getCell(1);
        c1.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c1.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

        const c2 = row.getCell(2);
        c2.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
        c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c2.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

        if (type === 'currency') c2.numFmt = '"PKR "#,##0.00';
        if (type === 'percent') c2.numFmt = '0.00%';
      });

      // Embed Visual Charts into Executive Summary
      if (dailyChartPng) {
        const dailyChartId = workbook.addImage({ base64: dailyChartPng, extension: 'png' });
        summaryWs.addImage(dailyChartId, {
          tl: { col: 3, row: 4 },
          ext: { width: 520, height: 260 }
        });
      }

      if (productChartPng) {
        const productChartId = workbook.addImage({ base64: productChartPng, extension: 'png' });
        summaryWs.addImage(productChartId, {
          tl: { col: 3, row: 18 },
          ext: { width: 520, height: 250 }
        });
      }

      // Auto-fit summary columns
      summaryWs.columns.forEach((column) => {
        let maxLen = 12;
        column.eachCell!({ includeEmpty: false }, (cell) => {
          const str = cell.value ? String(cell.value) : '';
          if (str.length > maxLen) maxLen = str.length;
        });
        column.width = Math.min(maxLen + 4, 45);
      });

      // --- Helper: Build Full Styled Worksheet ---
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
        ws.mergeCells(1, 1, 1, headerTitles.length);
        titleRow.height = 34;
        const tCell = titleRow.getCell(1);
        tCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
        tCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

        // Row 2: Empty
        ws.addRow([]);

        // Row 3: Headers
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
            } else if (type === 'percent') {
              cell.numFmt = '0.00%';
              cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else if (type === 'number') {
              cell.numFmt = '#,##0';
              cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else {
              cell.alignment = { vertical: 'middle', horizontal: 'left' };
            }
          });
        });

        // Totals Row
        if (totalRowValues) {
          const totRow = ws.addRow(totalRowValues);
          totRow.height = 25;
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

            if (type === 'currency') {
              cell.numFmt = '"PKR "#,##0.00';
              cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else if (type === 'percent') {
              cell.numFmt = '0.00%';
              cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else if (type === 'number') {
              cell.numFmt = '#,##0';
              cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else {
              cell.alignment = { vertical: 'middle', horizontal: 'left' };
            }
          });
        }

        // Auto-fit Columns
        ws.columns.forEach((column) => {
          let maxLen = 12;
          column.eachCell!({ includeEmpty: false }, (cell) => {
            const str = cell.value ? String(cell.value) : '';
            if (str.length > maxLen) maxLen = str.length;
          });
          column.width = Math.min(maxLen + 4, 55);
        });

        return ws;
      };

      // --- SHEET 2: ITEMIZED SALES DETAIL ---
      const itemizedTotals = ["TOTALS", "", "", "", totalUnitsSold, "", Number(totalRev.toFixed(2)), Number(totalCst.toFixed(2)), Number(totalProf.toFixed(2)), ""];
      buildStyledSheet(
        "Itemized Sales Detail",
        "ITEMIZED PRODUCT SALES TRANSACTION DETAIL",
        ["Receipt #", "Date & Time", "Customer Name", "Product Name", "Quantity Sold", "Unit Price (PKR)", "Item Revenue (PKR)", "Est. Unit Cost (PKR)", "Est. Net Profit (PKR)", "Payment Method"],
        itemizedData,
        ['text', 'text', 'text', 'text', 'number', 'currency', 'currency', 'currency', 'currency', 'text'],
        itemizedTotals
      );

      // --- SHEET 3: PRODUCT PERFORMANCE ---
      const productRows: any[][] = [];
      Array.from(productStatsMap.entries())
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .forEach(([name, stats]) => {
          const avgPrice = stats.quantity > 0 ? stats.revenue / stats.quantity : 0;
          const cost = stats.revenue - stats.profit;
          const margin = stats.revenue > 0 ? stats.profit / stats.revenue : 0;
          productRows.push([
            name,
            stats.quantity,
            Number(avgPrice.toFixed(2)),
            Number(stats.revenue.toFixed(2)),
            Number(cost.toFixed(2)),
            Number(stats.profit.toFixed(2)),
            margin
          ]);
        });

      const prodTotals = ["TOTALS", totalUnitsSold, "", Number(totalRev.toFixed(2)), Number(totalCst.toFixed(2)), Number(totalProf.toFixed(2)), profMargin / 100];
      buildStyledSheet(
        "Product Performance",
        "PRODUCT SALES & PROFITABILITY SUMMARY",
        ["Product Name", "Units Sold", "Avg Unit Price (PKR)", "Total Revenue (PKR)", "Est. Total Cost (PKR)", "Net Profit (PKR)", "Profit Margin (%)"],
        productRows,
        ['text', 'number', 'currency', 'currency', 'currency', 'currency', 'percent'],
        prodTotals
      );

      // --- SHEET 4: DAILY TRENDS ---
      const dailyRows: any[][] = [];
      sortedDaily.forEach(([date, stats]) => {
        const cost = stats.revenue - stats.profit;
        const aov = stats.transactions > 0 ? stats.revenue / stats.transactions : 0;
        const margin = stats.revenue > 0 ? stats.profit / stats.revenue : 0;
        dailyRows.push([
          date,
          stats.transactions,
          stats.itemsSold,
          Number(stats.revenue.toFixed(2)),
          Number(cost.toFixed(2)),
          Number(stats.profit.toFixed(2)),
          Number(aov.toFixed(2)),
          margin
        ]);
      });

      const dailyTotals = ["TOTALS", filteredSales.length, totalUnitsSold, Number(totalRev.toFixed(2)), Number(totalCst.toFixed(2)), Number(totalProf.toFixed(2)), Number((filteredSales.length > 0 ? totalRev / filteredSales.length : 0).toFixed(2)), profMargin / 100];
      buildStyledSheet(
        "Daily Trends",
        "DAILY SALES, REVENUE & PROFIT TRENDS",
        ["Date", "Orders Count", "Units Sold", "Daily Revenue (PKR)", "Est. Daily Cost (PKR)", "Daily Net Profit (PKR)", "Avg Order Value (PKR)", "Profit Margin (%)"],
        dailyRows,
        ['text', 'number', 'number', 'currency', 'currency', 'currency', 'currency', 'percent'],
        dailyTotals
      );

      // --- SHEET 5: ORDER MASTER LIST ---
      const transactionRows: any[][] = [];
      filteredSales.forEach(sale => {
        const itemsCount = sale.sale_items?.reduce((sum, i) => sum + (i.quantity || 1), 0) || 0;
        transactionRows.push([
          sale.receipt_number,
          format(new Date(sale.created_at), "yyyy-MM-dd HH:mm"),
          sale.customers?.name || "Walk-in Customer",
          sale.payment_method.toUpperCase(),
          itemsCount,
          Number((sale.subtotal || sale.total_amount).toFixed(2)),
          0.00,
          0.00,
          Number(sale.total_amount.toFixed(2))
        ]);
      });

      const orderTotals = ["TOTALS", "", "", "", totalUnitsSold, Number(totalRev.toFixed(2)), 0.00, 0.00, Number(totalRev.toFixed(2))];
      buildStyledSheet(
        "Order Master List",
        "ORDER TRANSACTIONS MASTER RECORD",
        ["Receipt #", "Date & Time", "Customer Name", "Payment Method", "Items Count", "Subtotal (PKR)", "Discount (PKR)", "Tax (PKR)", "Total Amount (PKR)"],
        transactionRows,
        ['text', 'text', 'text', 'text', 'number', 'currency', 'currency', 'currency', 'currency'],
        orderTotals
      );

      // Download file using ExcelJS Buffer
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `POS_Sales_Report_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(downloadUrl);

      toast.dismiss();
      toast.success("Executive Styled Excel Report Downloaded (PKR)!");
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
