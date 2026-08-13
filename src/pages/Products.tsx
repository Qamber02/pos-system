import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, Package, AlertTriangle, Layers, RefreshCw, Cloud, CloudOff, Smartphone, Wrench } from "lucide-react";
import { toast } from "sonner";
import { db, CachedProduct, CachedCategory } from "@/lib/db";
import { syncService } from "@/lib/syncService";
import { useLiveQuery } from "dexie-react-hooks";
import { DeviceIdentifierDialog } from "@/components/inventory/DeviceIdentifierDialog";
import { PartCompatibilityDialog } from "@/components/inventory/PartCompatibilityDialog";

// Extended interface for display
interface ProductWithCategory extends CachedProduct {
  categoryName?: string;
  categoryColor?: string;
}

import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

const Products = () => {
  const navigate = useNavigate();
  const [productDialog, setProductDialog] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [compatDialogOpen, setCompatDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CachedProduct | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const formatPrice = useFormatCurrency();
  const [editingCategory, setEditingCategory] = useState<CachedCategory | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Offline-first data fetching
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const allVariants = useLiveQuery(() => db.productVariants.toArray()) || [];
  const deviceIdentifiers = useLiveQuery(async () => {
    const list = await db.deviceIdentifiers.toArray();
    const prods = await db.products.toArray();
    const prodMap = new Map(prods.map(p => [p.id, p.name]));
    return list.map(d => ({ ...d, productName: d.product_id ? prodMap.get(d.product_id) : 'Unknown' }));
  }) || [];
  const partCompatibilities = useLiveQuery(async () => {
    const list = await db.partCompatibility.toArray();
    const prods = await db.products.toArray();
    const prodMap = new Map(prods.map(p => [p.id, p.name]));
    return list.map(pc => ({ ...pc, productName: pc.product_id ? prodMap.get(pc.product_id) : 'Unknown' }));
  }) || [];

  const products = useLiveQuery(async () => {
    const allProducts = await db.products.toArray();
    const allCategories = await db.categories.toArray();
    const categoryMap = new Map(allCategories.map(c => [c.id, c]));

    return allProducts.map(p => ({
      ...p,
      categoryName: p.category_id ? categoryMap.get(p.category_id)?.name : undefined,
      categoryColor: p.category_id ? categoryMap.get(p.category_id)?.color : undefined,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }) || [];

  const generateUniqueBarcode = () => {
    return `890${Math.floor(100000000 + Math.random() * 900000000)}`;
  };

  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    barcode: generateUniqueBarcode(),
    category_id: "",
    retail_price: "",
    cost_price: "",
    stock_quantity: "",
    low_stock_threshold: "10",
    is_serialized: false,
    is_repair_part: false,
    condition_grade: "new",
  });

  const [variants, setVariants] = useState<any[]>([]);
  const [variantForm, setVariantForm] = useState({
    name: "",
    sku: "",
    price_adjustment: "0",
    stock_quantity: "",
  });

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    color: "#3B82F6",
  });

  // Barcode Scanner Logic
  useBarcodeScanner({
    onScan: (barcode) => {
      if (productDialog) {
        // If dialog is open, fill the barcode field
        setProductForm(prev => ({ ...prev, barcode }));
        toast.success("Barcode scanned");
      } else {
        // Optional: Open dialog for adding new product with this barcode?
        // For now, just show a toast or ignore
        // toast.info(`Scanned: ${barcode}. Open "Add Product" to save.`);
      }
    }
  });

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const handleSaveProduct = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const productData = {
        name: productForm.name,
        description: productForm.description || null,
        barcode: productForm.barcode || null,
        category_id: productForm.category_id || null,
        retail_price: parseFloat(productForm.retail_price),
        cost_price: parseFloat(productForm.cost_price) || 0,
        stock_quantity: parseInt(productForm.stock_quantity) || 0,
        low_stock_threshold: parseInt(productForm.low_stock_threshold) || 10,
        is_serialized: productForm.is_serialized,
        is_repair_part: productForm.is_repair_part,
        condition_grade: productForm.condition_grade,
        user_id: user.id,
        lastModified: Date.now(),
        synced: false,
      };

      let productId = editingProduct?.id;

      if (editingProduct) {
        const updatedProduct = { ...editingProduct, ...productData, updated_at: new Date().toISOString() };
        await syncService.queueOperation('products', 'update', updatedProduct);
        toast.success("Product updated");
      } else {
        productId = crypto.randomUUID();
        const newProduct = {
          ...productData,
          id: productId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await syncService.queueOperation('products', 'insert', newProduct);
        toast.success("Product created");
      }

      // Save / Update Variants
      if (productId) {
        const existingVariants = await db.productVariants.where('product_id').equals(productId).toArray();
        
        // Remove variants that were deleted in the UI
        for (const ev of existingVariants) {
          if (!variants.some(v => v.id === ev.id)) {
            await syncService.queueOperation('productVariants', 'delete', { id: ev.id });
          }
        }

        // Add or Update current variants
        for (const variant of variants) {
          const isExisting = existingVariants.some(ev => ev.id === variant.id);
          
          if (isExisting) {
            const currentEv = existingVariants.find(ev => ev.id === variant.id)!;
            const updatedVariant = {
              ...currentEv,
              variant_name: variant.name,
              sku: variant.sku || null,
              price_adjustment: parseFloat(variant.price_adjustment) || 0,
              stock_quantity: parseInt(variant.stock_quantity) || 0,
              is_serialized: productForm.is_serialized,
              condition_grade: productForm.condition_grade,
              lastModified: Date.now(),
              synced: false,
              updated_at: new Date().toISOString()
            };
            await syncService.queueOperation('productVariants', 'update', updatedVariant);
          } else {
            const variantData = {
              id: variant.id || crypto.randomUUID(),
              product_id: productId,
              variant_name: variant.name,
              sku: variant.sku || null,
              price_adjustment: parseFloat(variant.price_adjustment) || 0,
              stock_quantity: parseInt(variant.stock_quantity) || 0,
              is_active: true,
              is_serialized: productForm.is_serialized,
              condition_grade: productForm.condition_grade,
              user_id: user.id,
              synced: false,
              lastModified: Date.now(),
              updated_at: new Date().toISOString()
            };
            await syncService.queueOperation('productVariants', 'insert', variantData);
          }
        }
        if (variants.length > 0) {
          toast.success(`${variants.length} variants updated`);
        }
      }

      setProductDialog(false);
      resetProductForm();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddVariant = () => {
    if (!variantForm.name) {
      toast.error("Variant name is required");
      return;
    }
    setVariants([...variants, { ...variantForm, id: crypto.randomUUID() }]);
    setVariantForm({ name: "", sku: "", price_adjustment: "0", stock_quantity: "" });
  };

  const handleRemoveVariant = (id: string) => {
    setVariants(variants.filter(v => v.id !== id));
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    try {
      await syncService.queueOperation('products', 'delete', { id });
      // Also delete variants
      const productVariants = await db.productVariants.where('product_id').equals(id).toArray();
      for (const v of productVariants) {
        await syncService.queueOperation('productVariants', 'delete', { id: v.id });
      }
      toast.success("Product deleted");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSaveCategory = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const categoryData = {
        name: categoryForm.name,
        description: categoryForm.description || null,
        color: categoryForm.color,
        user_id: user.id,
        lastModified: Date.now(),
        synced: false,
      };

      if (editingCategory) {
        const updatedCategory = { ...editingCategory, ...categoryData, updated_at: new Date().toISOString() };
        await syncService.queueOperation('categories', 'update', updatedCategory);
        toast.success("Category updated");
      } else {
        const newCategory = {
          ...categoryData,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await syncService.queueOperation('categories', 'insert', newCategory);
        toast.success("Category created");
      }

      setCategoryDialog(false);
      resetCategoryForm();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    try {
      await syncService.queueOperation('categories', 'delete', { id });
      toast.success("Category deleted");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncService.syncAll(true);
      toast.success("Sync completed");
    } catch (error) {
      toast.error("Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  const openProductDialog = async (product?: CachedProduct) => {
    if (product) {
      setEditingProduct(product);
      setProductForm({
        name: product.name,
        description: product.description || "",
        barcode: product.barcode || "",
        category_id: product.category_id || "",
        retail_price: product.retail_price.toString(),
        cost_price: (product.cost_price || 0).toString(),
        stock_quantity: product.stock_quantity.toString(),
        low_stock_threshold: product.low_stock_threshold.toString(),
        is_serialized: product.is_serialized || false,
        is_repair_part: product.is_repair_part || false,
        condition_grade: product.condition_grade || "new",
      });
      // Load existing variants for this product
      try {
        const existingVariants = await db.productVariants.where('product_id').equals(product.id).toArray();
        setVariants(existingVariants.map(v => ({
          id: v.id,
          name: v.variant_name,
          sku: v.sku || "",
          price_adjustment: v.price_adjustment.toString(),
          stock_quantity: v.stock_quantity.toString()
        })));
      } catch (err) {
        console.error("Failed to load variants:", err);
        setVariants([]);
      }
    } else {
      resetProductForm();
    }
    setProductDialog(true);
  };

  const openCategoryDialog = (category?: CachedCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        description: category.description || "",
        color: category.color,
      });
    } else {
      resetCategoryForm();
    }
    setCategoryDialog(true);
  };

  const resetProductForm = () => {
    setEditingProduct(null);
    setProductForm({
      name: "",
      description: "",
      barcode: generateUniqueBarcode(),
      category_id: "",
      retail_price: "",
      cost_price: "",
      stock_quantity: "",
      low_stock_threshold: "10",
      is_serialized: false,
      is_repair_part: false,
      condition_grade: "new",
    });
    setVariants([]);
    setVariantForm({ name: "", sku: "", price_adjustment: "0", stock_quantity: "" });
  };


  const resetCategoryForm = () => {
    setEditingCategory(null);
    setCategoryForm({
      name: "",
      description: "",
      color: "#3B82F6",
    });
  };

  const formatCurrency = (amount: number) => {
    return formatPrice(amount);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/95 backdrop-blur-md shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 pl-14 flex items-center gap-4">
          <Navigation />
          <h1 className="text-2xl font-bold">Product Management</h1>
        </div>
      </header>

      <div className="flex flex-1">
        <main className="flex-1 container mx-auto px-4 py-6">
          <Tabs defaultValue="products" className="space-y-4">
            <TabsList>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="devices" className="flex items-center gap-1.5">
                <Smartphone className="h-4 w-4" /> Serialized Devices
              </TabsTrigger>
              <TabsTrigger value="compatibilities" className="flex items-center gap-1.5">
                <Wrench className="h-4 w-4" /> Part Compatibility
              </TabsTrigger>
            </TabsList>

            <TabsContent value="products" className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-muted-foreground">
                  Manage your product inventory
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleSync} disabled={isSyncing}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                    {isSyncing ? "Syncing..." : "Sync Now"}
                  </Button>
                  <Button onClick={() => openProductDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Product
                  </Button>
                </div>
              </div>

              <Card>
                <CardContent className="pt-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type / Category</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead>Sync</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((product) => {
                        const isLowStock = product.stock_quantity <= product.low_stock_threshold;
                        return (
                          <TableRow key={product.id}>
                            <TableCell className="font-medium">
                              <div>{product.name}</div>
                              {product.barcode && (
                                <div className="text-xs text-muted-foreground font-mono">{product.barcode}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1 items-center">
                                {product.categoryName && (
                                  <Badge style={{ backgroundColor: product.categoryColor }}>
                                    {product.categoryName}
                                  </Badge>
                                )}
                                {product.is_serialized && (
                                  <Badge variant="outline" className="text-xs flex items-center gap-1 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200">
                                    <Smartphone className="h-3 w-3" /> Serialized
                                  </Badge>
                                )}
                                {product.is_repair_part && (
                                  <Badge variant="outline" className="text-xs flex items-center gap-1 bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200">
                                    <Wrench className="h-3 w-3" /> Repair Part
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{formatCurrency(product.retail_price)}</TableCell>
                            <TableCell>{product.stock_quantity}</TableCell>
                            <TableCell>
                              {product.synced ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Cloud className="h-4 w-4 text-green-500" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Synced to cloud</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <CloudOff className="h-4 w-4 text-amber-500" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Not synced yet</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </TableCell>
                            <TableCell>
                              {isLowStock && (
                                <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                                  <AlertTriangle className="h-3 w-3" />
                                  Low Stock
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openProductDialog(product)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteProduct(product.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="categories" className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-muted-foreground">
                  Organize products into categories
                </p>
                <Button onClick={() => openCategoryDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Category
                </Button>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {categories.map((category) => (
                  <Card key={category.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: category.color }}
                          />
                          <CardTitle>{category.name}</CardTitle>
                        </div>
                        <div className="space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openCategoryDialog(category)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCategory(category.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {category.description && (
                        <CardDescription>{category.description}</CardDescription>
                      )}
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Serialized Devices (IMEIs) Tab */}
            <TabsContent value="devices" className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-muted-foreground">
                  Track individual physical items with IMEI or Serial numbers
                </p>
                <Button onClick={() => setDeviceDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Register Device (IMEI)
                </Button>
              </div>

              <Card>
                <CardContent className="pt-6">
                  {deviceIdentifiers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No device identifiers registered yet. Click "Register Device (IMEI)" to add one.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>IMEI / Serial</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead>Cost</TableHead>
                          <TableHead>Target Sell Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deviceIdentifiers.map((dev) => (
                          <TableRow key={dev.id}>
                            <TableCell className="font-mono text-sm font-semibold">
                              {dev.imei || dev.serial_number || 'N/A'}
                            </TableCell>
                            <TableCell>{dev.productName}</TableCell>
                            <TableCell>
                              <Badge variant={dev.status === 'in_stock' ? 'default' : 'secondary'}>
                                {dev.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{dev.condition_grade || 'new'}</Badge>
                            </TableCell>
                            <TableCell>{formatCurrency(dev.cost || 0)}</TableCell>
                            <TableCell>{formatCurrency(dev.sell_price || 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Part Compatibility Tab */}
            <TabsContent value="compatibilities" className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-muted-foreground">
                  Map repair parts and components to compatible smartphone/device models
                </p>
                <Button onClick={() => setCompatDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Part Mapping
                </Button>
              </div>

              <Card>
                <CardContent className="pt-6">
                  {partCompatibilities.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No part compatibility mappings created yet. Click "Add Part Mapping" to link repair parts to device models.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Repair Part Product</TableHead>
                          <TableHead>Compatible Device Model</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {partCompatibilities.map((pc) => (
                          <TableRow key={pc.id}>
                            <TableCell className="font-medium">{pc.productName}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="font-semibold">
                                {pc.device_model}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {pc.notes || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>

        {/* Product Dialog */}
        <Dialog open={productDialog} onOpenChange={setProductDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
              <DialogDescription>
                {editingProduct ? "Update product details" : "Create a new product"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={productForm.category_id}
                    onValueChange={(value) => setProductForm({ ...productForm, category_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Hardware & Repair Attributes */}
              <div className="border rounded-lg p-3 bg-muted/20 grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between space-x-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="is_serialized" className="cursor-pointer">Serialized (IMEI Tracking)</Label>
                    <p className="text-xs text-muted-foreground">Each item has a unique IMEI or Serial</p>
                  </div>
                  <Switch
                    id="is_serialized"
                    checked={productForm.is_serialized}
                    onCheckedChange={(checked) => setProductForm({ ...productForm, is_serialized: checked })}
                  />
                </div>

                <div className="flex items-center justify-between space-x-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="is_repair_part" className="cursor-pointer">Repair Part / Component</Label>
                    <p className="text-xs text-muted-foreground">Consumable used in phone repairs</p>
                  </div>
                  <Switch
                    id="is_repair_part"
                    checked={productForm.is_repair_part}
                    onCheckedChange={(checked) => setProductForm({ ...productForm, is_repair_part: checked })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="condition_grade">Default Condition / Grade</Label>
                <Select
                  value={productForm.condition_grade}
                  onValueChange={(value) => setProductForm({ ...productForm, condition_grade: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Brand New</SelectItem>
                    <SelectItem value="refurbished_a">Refurbished Grade A</SelectItem>
                    <SelectItem value="refurbished_b">Refurbished Grade B</SelectItem>
                    <SelectItem value="used">Used / Pre-owned</SelectItem>
                    <SelectItem value="defective">Defective / For Parts</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="barcode">Barcode (Auto-Generated)</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-primary hover:bg-primary/10"
                    onClick={() => setProductForm({ ...productForm, barcode: generateUniqueBarcode() })}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Re-Generate
                  </Button>
                </div>
                <Input
                  id="barcode"
                  value={productForm.barcode}
                  onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                  placeholder="Auto-generated barcode..."
                  className="font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="retail_price">Retail Price *</Label>
                  <Input
                    id="retail_price"
                    type="number"
                    step="0.01"
                    value={productForm.retail_price}
                    onChange={(e) => setProductForm({ ...productForm, retail_price: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cost_price">Cost Price</Label>
                  <Input
                    id="cost_price"
                    type="number"
                    step="0.01"
                    value={productForm.cost_price}
                    onChange={(e) => setProductForm({ ...productForm, cost_price: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stock_quantity">Stock Quantity *</Label>
                  <Input
                    id="stock_quantity"
                    type="number"
                    value={productForm.stock_quantity}
                    onChange={(e) => setProductForm({ ...productForm, stock_quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="low_stock_threshold">Low Stock Alert</Label>
                  <Input
                    id="low_stock_threshold"
                    type="number"
                    value={productForm.low_stock_threshold}
                    onChange={(e) => setProductForm({ ...productForm, low_stock_threshold: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Variants Section */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-4">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Variants (Optional)
                </Label>
              </div>

              <div className="bg-muted/30 p-4 rounded-lg space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Variant Name</Label>
                    <Input
                      placeholder="e.g. Red, XL"
                      value={variantForm.name}
                      onChange={e => setVariantForm({ ...variantForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SKU</Label>
                    <Input
                      placeholder="Optional"
                      value={variantForm.sku}
                      onChange={e => setVariantForm({ ...variantForm, sku: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Price Adjustment (+/-)</Label>
                    <Input
                      type="number"
                      value={variantForm.price_adjustment}
                      onChange={e => setVariantForm({ ...variantForm, price_adjustment: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Stock</Label>
                    <Input
                      type="number"
                      value={variantForm.stock_quantity}
                      onChange={e => setVariantForm({ ...variantForm, stock_quantity: e.target.value })}
                    />
                  </div>
                </div>
                <Button type="button" onClick={handleAddVariant} variant="secondary" className="w-full">
                  <Plus className="h-4 w-4 mr-2" /> Add Variant
                </Button>
              </div>

              {variants.length > 0 && (
                <div className="mt-4 space-y-2">
                  <Label>Added Variants</Label>
                  <div className="border rounded-md divide-y">
                    {variants.map((v) => (
                      <div key={v.id} className="p-3 flex justify-between items-center text-sm">
                        <div>
                          <span className="font-medium">{v.name}</span>
                          <span className="text-muted-foreground ml-2">
                            ({v.stock_quantity} in stock, {parseFloat(v.price_adjustment) > 0 ? '+' : ''}{formatPrice(v.price_adjustment)})
                          </span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveVariant(v.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setProductDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveProduct} disabled={loading}>
                {loading ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Category Dialog */}
        <Dialog open={categoryDialog} onOpenChange={setCategoryDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCategory ? "Edit Category" : "Add Category"}</DialogTitle>
              <DialogDescription>
                {editingCategory ? "Update category details" : "Create a new category"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="cat-name">Name *</Label>
                <Input
                  id="cat-name"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-description">Description</Label>
                <Input
                  id="cat-description"
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-color">Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="cat-color"
                    type="color"
                    value={categoryForm.color}
                    onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                    className="w-20"
                  />
                  <Input
                    value={categoryForm.color}
                    onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                    placeholder="#3B82F6"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCategoryDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveCategory} disabled={loading}>
                {loading ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Device Identifier Registration Dialog */}
        <DeviceIdentifierDialog
          open={deviceDialogOpen}
          onOpenChange={setDeviceDialogOpen}
          products={products}
          variants={allVariants}
        />

        {/* Part Compatibility Mapping Dialog */}
        <PartCompatibilityDialog
          open={compatDialogOpen}
          onOpenChange={setCompatDialogOpen}
          products={products}
          variants={allVariants}
        />
      </div>
    </div>
  );
};

export default Products;
