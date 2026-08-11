import { describe, it, expect } from "vitest";

// 🧠 Mock In-Memory Product DB (for performance testing)
class MockProductDB {
  constructor() {
    this.products = [];
  }

  async insertMany(products) {
    this.products.push(...products);
  }

  async getAll() {
    return this.products;
  }

  async getByBarcode(barcode) {
    return this.products.find((p) => p.barcode === barcode);
  }
}

describe("🧠 POS Offline DB Test — 20,000 Product Performance", () => {
  const db = new MockProductDB();

  // ✅ 1. Insert 20,000 Products
  it("should insert 20,000 products into local DB efficiently", async () => {
    const products = Array.from({ length: 20000 }, (_, i) => ({
      id: i + 1,
      name: `Product ${i + 1}`,
      barcode: `BC${100000 + i}`, // always six digits, e.g. BC100000 - BC119999
      price: Math.random() * 100,
      stock: Math.floor(Math.random() * 50),
    }));

    const start = performance.now();
    await db.insertMany(products);
    const end = performance.now();

    console.log(`Inserted ${products.length} products in ${Math.round(end - start)}ms`);

    expect(db.products.length).toBe(20000);
    expect(end - start).toBeLessThan(1000);
  });

  // ✅ 2. Retrieve All Products
  it("should retrieve all products quickly", async () => {
    const start = performance.now();
    const all = await db.getAll();
    const end = performance.now();

    console.log(`Retrieved ${all.length} products in ${Math.round(end - start)}ms`);

    expect(all.length).toBe(20000);
    expect(end - start).toBeLessThan(500);
  });

  // ✅ 3. Lookup by Barcode (fixed)
  it("should find a specific product by barcode instantly", async () => {
    // Pick a barcode that actually exists
    const barcode = "BC100000"; // first product always exists

    const startLookup = performance.now();
    const product = await db.getByBarcode(barcode);
    const endLookup = performance.now();

    console.log(`Lookup of ${barcode} took ${Math.round(endLookup - startLookup)}ms`);

    expect(product).toBeDefined(); // ✅ fixed line
    expect(product.barcode).toBe(barcode);
    expect(endLookup - startLookup).toBeLessThan(200);
  });
});
