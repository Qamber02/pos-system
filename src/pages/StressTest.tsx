import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { syncService } from "@/lib/syncService";
import { toast } from "sonner";
import { Navigation } from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";

const StressTest = () => {
    const [logs, setLogs] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const addLog = (msg: string) => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    };

    const generateProducts = async () => {
        setLoading(true);
        addLog("Starting bulk product generation (1000 items)...");
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const products = [];
            const variants = [];
            const batchSize = 1000;

            for (let i = 0; i < batchSize; i++) {
                const productId = crypto.randomUUID();
                const timestamp = Date.now();
                products.push({
                    id: productId,
                    name: `Stress Test Product ${i}`,
                    description: "Generated for stress testing",
                    barcode: `STRESS-${timestamp}-${i}`,
                    retail_price: Math.floor(Math.random() * 1000) + 100,
                    cost_price: Math.floor(Math.random() * 500) + 50,
                    stock_quantity: 100,
                    low_stock_threshold: 10,
                    user_id: user.id,
                    lastModified: Date.now(),
                    synced: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

                // Add a variant for every 5th product
                if (i % 5 === 0) {
                    variants.push({
                        id: crypto.randomUUID(),
                        product_id: productId,
                        variant_name: "Standard",
                        sku: `SKU-${i}`,
                        price_adjustment: 0,
                        stock_quantity: 50,
                        is_active: true,
                        user_id: user.id,
                        synced: false,
                        lastModified: Date.now(),
                        updated_at: new Date().toISOString()
                    });
                }
            }

            addLog(`Inserting ${products.length} products locally...`);
            await db.products.bulkAdd(products);

            addLog(`Inserting ${variants.length} variants locally...`);
            await db.productVariants.bulkAdd(variants);

            // Queue for sync (this is the heavy part)
            addLog("Queueing sync operations...");
            for (const p of products) {
                await db.syncQueue.add({
                    table: 'products',
                    operation: 'insert',
                    data: p,
                    timestamp: Date.now(),
                    retryCount: 0,
                    status: 'pending'
                });
            }
            for (const v of variants) {
                await db.syncQueue.add({
                    table: 'productVariants',
                    operation: 'insert',
                    data: v,
                    timestamp: Date.now(),
                    retryCount: 0,
                    status: 'pending'
                });
            }

            addLog("Bulk generation complete. Sync will pick this up.");
            toast.success("Generated 1000 products");
        } catch (error: any) {
            addLog(`Error: ${error.message}`);
            toast.error("Failed to generate products");
        } finally {
            setLoading(false);
        }
    };

    const rapidSync = async () => {
        setLoading(true);
        addLog("Triggering 10 rapid syncs...");
        try {
            const promises = [];
            for (let i = 0; i < 10; i++) {
                addLog(`Triggering sync #${i + 1}`);
                promises.push(syncService.syncAll());
            }
            await Promise.all(promises);
            addLog("All syncs completed (or skipped if busy).");
            toast.success("Rapid sync test finished");
        } catch (error: any) {
            addLog(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const simulateSales = async () => {
        setLoading(true);
        addLog("Simulating 100 sales...");
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            // Get a product to sell
            const product = await db.products.limit(1).first();
            if (!product) throw new Error("No products found. Generate products first.");

            for (let i = 0; i < 100; i++) {
                const saleId = crypto.randomUUID();
                const sale = {
                    id: saleId,
                    customer_id: null,
                    total_amount: product.retail_price,
                    discount_amount: 0,
                    tax_amount: 0,
                    payment_method: 'cash',
                    status: 'completed',
                    user_id: user.id,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    lastModified: Date.now(),
                    synced: false
                };

                const saleItem = {
                    id: crypto.randomUUID(),
                    sale_id: saleId,
                    product_id: product.id,
                    quantity: 1,
                    unit_price: product.retail_price,
                    total_price: product.retail_price,
                    created_at: new Date().toISOString(),
                    user_id: user.id,
                    lastModified: Date.now(),
                    synced: false
                };

                await syncService.queueOperation('sales', 'insert', sale);
                await syncService.queueOperation('saleItems', 'insert', saleItem);

                if (i % 10 === 0) addLog(`Created sale ${i + 1}/100`);
            }

            addLog("Sales simulation complete.");
            toast.success("Simulated 100 sales");
        } catch (error: any) {
            addLog(`Error: ${error.message}`);
            toast.error("Failed to simulate sales");
        } finally {
            setLoading(false);
        }
    };

    const clearDatabase = async () => {
        if (!confirm("Are you sure? This will delete ALL local data.")) return;
        setLoading(true);
        addLog("Clearing local database...");
        try {
            await db.delete();
            await db.open();
            addLog("Database cleared and reopened.");
            toast.success("Database cleared");
            window.location.reload();
        } catch (error: any) {
            addLog(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const cleanupRemoteData = async () => {
        if (!confirm("This will PERMANENTLY DELETE all products with barcode starting with 'STRESS-' from the SERVER. Are you sure?")) return;
        setLoading(true);
        addLog("Cleaning up remote test data...");
        try {
            // Delete products (cascade should handle variants if set up, otherwise delete variants first)
            const { error } = await supabase
                .from('products')
                .delete()
                .ilike('barcode', 'STRESS-%');

            if (error) throw error;

            addLog("Remote test products deleted.");
            toast.success("Remote test data cleaned up. Now clear local DB.");
        } catch (error: any) {
            addLog(`Error: ${error.message}`);
            toast.error("Failed to cleanup remote data");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <Navigation />
            <div className="container mx-auto p-6 space-y-6">
                <h1 className="text-3xl font-bold text-destructive">Stress Test Dashboard</h1>
                <p className="text-muted-foreground">
                    Use these tools to verify application stability under high load.
                    <span className="font-bold text-red-500"> WARNING: This creates dummy data.</span>
                </p>

                <div className="grid md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Load Tests</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button
                                onClick={generateProducts}
                                disabled={loading}
                                className="w-full bg-blue-600 hover:bg-blue-700"
                            >
                                Generate 1,000 Products
                            </Button>
                            <Button
                                onClick={rapidSync}
                                disabled={loading}
                                className="w-full bg-orange-600 hover:bg-orange-700"
                            >
                                Trigger 10 Rapid Syncs
                            </Button>
                            <Button
                                onClick={simulateSales}
                                disabled={loading}
                                className="w-full bg-green-600 hover:bg-green-700"
                            >
                                Simulate 100 Sales
                            </Button>
                            <Button
                                onClick={clearDatabase}
                                disabled={loading}
                                variant="destructive"
                                className="w-full"
                            >
                                Clear Local Database (Reset)
                            </Button>
                            <Button
                                onClick={cleanupRemoteData}
                                disabled={loading}
                                variant="outline"
                                className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            >
                                Cleanup Remote Test Data
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="h-[500px] flex flex-col">
                        <CardHeader>
                            <CardTitle>Live Logs</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-auto bg-black/90 text-green-400 font-mono text-sm p-4 rounded-md">
                            {logs.length === 0 ? (
                                <span className="opacity-50">Waiting for actions...</span>
                            ) : (
                                logs.map((log, i) => <div key={i}>{log}</div>)
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default StressTest;
