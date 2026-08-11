import { describe, it, expect } from "vitest";

describe("🧠 POS Product Load Test (20,000 items)", () => {
  it("should handle 20,000 products efficiently", async () => {
    // Generate 20,000 mock products
    const products = [];
    for (let i = 0; i < 20000; i++) {
      products.push({
        id: i + 1,
        name: `Product ${i + 1}`,
        barcode: `BC${100000 + i}`,
        price: Math.floor(Math.random() * 1000) + 50,
        category: i % 2 === 0 ? "Grocery" : "Snacks",
      });
    }

    // Simulate adding all products into memory or database
    const startTime = performance.now();

    // Fake a search or render operation (filter or map)
    const filtered = products.filter(p => p.name.includes("500"));
    const endTime = performance.now();

    console.log(`Loaded and filtered ${products.length} products in ${Math.round(endTime - startTime)}ms`);

    // ✅ Assertions
    expect(products.length).toBe(20000);
    expect(filtered.length).toBeGreaterThan(0);
    expect(endTime - startTime).toBeLessThan(3000); // should process in under 3 seconds
  });
});
