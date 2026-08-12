import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { syncService } from "@/lib/syncService";
import { toast } from "sonner";

export async function seedDemoDataForUser() {
  try {
    let userId = "d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0"; // Default local dev UUID

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        userId = user.id;
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          userId = session.user.id;
        } else {
          const profile = await db.userProfile.toCollection().first();
          if (profile?.id) userId = profile.id;
        }
      }
    } catch {
      // Offline or unauthenticated fallback
    }

    const nowIso = new Date().toISOString();
    const nowTimestamp = Date.now();

    // 1. Settings
    const settings = {
      id: userId,
      user_id: userId,
      business_name: "TechFix Mobile & Repairs",
      logo_url: "",
      tax_rate: 8.5,
      currency_symbol: "$",
      receipt_footer: "Thank you for choosing TechFix Mobile! All repair work includes a 90-day warranty.",
      synced: false,
      lastModified: nowTimestamp,
      updated_at: nowIso
    };
    await syncService.queueOperation("settings", "update", settings);

    // 2. Categories
    const categories = [
      { id: crypto.randomUUID(), user_id: userId, name: "Smartphones", description: "Brand new and certified pre-owned mobile phones", color: "#3b82f6", synced: false, lastModified: nowTimestamp },
      { id: crypto.randomUUID(), user_id: userId, name: "Accessories", description: "Cases, chargers, screen protectors, and powerbanks", color: "#10b981", synced: false, lastModified: nowTimestamp },
      { id: crypto.randomUUID(), user_id: userId, name: "Replacement Parts", description: "OLED displays, batteries, charging ports, and back glass", color: "#f59e0b", synced: false, lastModified: nowTimestamp },
      { id: crypto.randomUUID(), user_id: userId, name: "Laptops & Tablets", description: "iPads, Android tablets, and MacBooks", color: "#8b5cf6", synced: false, lastModified: nowTimestamp }
    ];

    for (const c of categories) {
      await syncService.queueOperation("categories", "insert", c);
    }

    const catMap = new Map(categories.map(c => [c.name, c.id]));

    // 3. Products
    const products = [
      { id: crypto.randomUUID(), user_id: userId, category_id: catMap.get("Smartphones"), name: "iPhone 15 Pro Max 256GB", description: "Apple A17 Pro Chip, Titanium Frame", barcode: "194253401234", retail_price: 1199.99, cost_price: 950.00, stock_quantity: 5, is_serialized: true, condition_grade: "new", is_repair_part: false, synced: false, lastModified: nowTimestamp },
      { id: crypto.randomUUID(), user_id: userId, category_id: catMap.get("Smartphones"), name: "Samsung Galaxy S24 Ultra 512GB", description: "Snapdragon 8 Gen 3, S-Pen, 200MP Camera", barcode: "887276501234", retail_price: 1299.99, cost_price: 1020.00, stock_quantity: 3, is_serialized: true, condition_grade: "new", is_repair_part: false, synced: false, lastModified: nowTimestamp },
      { id: crypto.randomUUID(), user_id: userId, category_id: catMap.get("Replacement Parts"), name: "iPhone 13 OLED Screen Assembly", description: "Premium Soft OLED digitizer & touch panel", barcode: "712345001001", retail_price: 129.99, cost_price: 45.00, stock_quantity: 14, is_serialized: false, condition_grade: "new", is_repair_part: true, synced: false, lastModified: nowTimestamp },
      { id: crypto.randomUUID(), user_id: userId, category_id: catMap.get("Accessories"), name: "Apple 20W USB-C Power Adapter", description: "Fast charging wall block for iPhone & iPad", barcode: "194253002002", retail_price: 19.99, cost_price: 6.50, stock_quantity: 45, is_serialized: false, condition_grade: "new", is_repair_part: false, synced: false, lastModified: nowTimestamp },
      { id: crypto.randomUUID(), user_id: userId, category_id: catMap.get("Accessories"), name: "Anker PowerBank 20000mAh", description: "Dual USB-C 22.5W High Capacity Battery Pack", barcode: "848061003003", retail_price: 49.99, cost_price: 22.00, stock_quantity: 18, is_serialized: false, condition_grade: "new", is_repair_part: false, synced: false, lastModified: nowTimestamp }
    ];

    for (const p of products) {
      await syncService.queueOperation("products", "insert", p);
    }

    const prodMap = new Map(products.map(p => [p.name, p]));

    // 4. Device Identifiers (IMEIs)
    const iphone15 = prodMap.get("iPhone 15 Pro Max 256GB")!;
    const s24ultra = prodMap.get("Samsung Galaxy S24 Ultra 512GB")!;

    const deviceIdentifiers = [
      { id: crypto.randomUUID(), user_id: userId, product_id: iphone15.id, imei: "356789012345678", serial_number: "DX15PM001", condition_grade: "new", status: "in_stock" as const, cost: 950.00, sell_price: 1199.99, synced: false, lastModified: nowTimestamp },
      { id: crypto.randomUUID(), user_id: userId, product_id: iphone15.id, imei: "356789012345679", serial_number: "DX15PM002", condition_grade: "new", status: "in_stock" as const, cost: 950.00, sell_price: 1199.99, synced: false, lastModified: nowTimestamp },
      { id: crypto.randomUUID(), user_id: userId, product_id: s24ultra.id, imei: "990000862471831", serial_number: "R3CW80011", condition_grade: "refurbished_a", status: "in_stock" as const, cost: 850.00, sell_price: 1099.99, synced: false, lastModified: nowTimestamp }
    ];

    for (const d of deviceIdentifiers) {
      await syncService.queueOperation("deviceIdentifiers", "insert", d);
    }

    // 5. Part Compatibility
    const screenPart = prodMap.get("iPhone 13 OLED Screen Assembly")!;
    const compatibilities = [
      { id: crypto.randomUUID(), user_id: userId, product_id: screenPart.id, device_model: "iPhone 13", notes: "Full touch & TrueTone support", synced: false, lastModified: nowTimestamp },
      { id: crypto.randomUUID(), user_id: userId, product_id: screenPart.id, device_model: "iPhone 13 Pro", notes: "Soft OLED display assembly", synced: false, lastModified: nowTimestamp }
    ];

    for (const pc of compatibilities) {
      await syncService.queueOperation("partCompatibility", "insert", pc);
    }

    // 6. Customers
    const customers = [
      { id: crypto.randomUUID(), user_id: userId, name: "John Smith", email: "john.smith@gmail.com", phone: "+1 555-0147", address: "123 Main St, New York, NY", synced: false, lastModified: nowTimestamp },
      { id: crypto.randomUUID(), user_id: userId, name: "Sarah Connor", email: "sarah.connor@cyberdyne.io", phone: "+1 555-0199", address: "456 Terminator Ave, Los Angeles, CA", synced: false, lastModified: nowTimestamp }
    ];

    for (const cust of customers) {
      await syncService.queueOperation("customers", "insert", cust);
    }

    // 7. Technicians
    const technicians = [
      { id: crypto.randomUUID(), user_id: userId, name: "Marcus Vance", email: "marcus.vance@techfix.com", phone: "+1 555-9011", specialty: "Micro-soldering, Face ID & IC Repair", status: "active" as const, synced: false, lastModified: nowTimestamp },
      { id: crypto.randomUUID(), user_id: userId, name: "Elena Rostova", email: "elena.r@techfix.com", phone: "+1 555-9022", specialty: "Screen & Battery Replacement", status: "active" as const, synced: false, lastModified: nowTimestamp }
    ];

    for (const tech of technicians) {
      await syncService.queueOperation("technicians", "insert", tech);
    }

    // 8. Repair Tickets
    const john = customers[0];
    const sarah = customers[1];
    const marcus = technicians[0];
    const elena = technicians[1];

    const repairTickets = [
      { id: crypto.randomUUID(), user_id: userId, ticket_number: "REP-1001", customer_id: john.id, device_name: "iPhone 13 Pro Max", serial_or_imei: "351234567890123", issue_description: "Cracked front glass screen, touch unresponsive in upper right quadrant", estimated_cost: 180.00, deposit_paid: 50.00, status: "in_repair" as const, assigned_tech_id: marcus.id, notes: "Customer requested original color soft OLED screen.", synced: false, lastModified: nowTimestamp, created_at: nowIso, updated_at: nowIso },
      { id: crypto.randomUUID(), user_id: userId, ticket_number: "REP-1002", customer_id: sarah.id, device_name: "Samsung Galaxy S22 Ultra", serial_or_imei: "991122334455667", issue_description: "Battery draining rapidly and device overheating", estimated_cost: 95.00, deposit_paid: 20.00, status: "ready_for_pickup" as const, assigned_tech_id: elena.id, notes: "Battery replaced and load testing completed.", synced: false, lastModified: nowTimestamp, created_at: nowIso, updated_at: nowIso }
    ];

    for (const ticket of repairTickets) {
      await syncService.queueOperation("repairTickets", "insert", ticket);
    }

    toast.success("Demo data loaded into local shop database!");
  } catch (error: any) {
    console.error("Error seeding demo data:", error);
    toast.error(error.message || "Failed to seed demo data");
  }
}
