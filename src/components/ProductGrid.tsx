import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, AlertTriangle, Wifi, WifiOff } from "lucide-react";
// We no longer need supabase or toast here
import { useOfflineProducts } from "@/hooks/useOfflineProducts";
import { useOfflineCategories } from "@/hooks/useOfflineCategories"; // Import categories hook
import { useOnlineStatus } from "@/hooks/useOnlineStatus"; // Import online status hook
import { useDebounce } from "@/hooks/useDebounce";
import { CachedProduct, CachedCategory } from "@/lib/db"; // Import types

// Define a new product type that includes the joined category
interface ProductWithCategory extends CachedProduct {
  categoryName?: string;
  categoryColor?: string;
}

interface ProductGridProps {
  onAddToCart: (product: ProductWithCategory) => void;
  selectedCategory: string | null;
}

export const ProductGrid = ({ onAddToCart, selectedCategory }: ProductGridProps) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  
  // 1. Get products from the local db
  // Note: We removed 'isOnline' from here
  const { products: cachedProducts, loading: productsLoading } = useOfflineProducts();
  
  // 2. Get categories from the local db
  const { categories, loading: categoriesLoading } = useOfflineCategories();

  // 3. Get the *reliable* online status
  const isOnline = useOnlineStatus();

  // 4. We no longer need the 'fetchFullProducts' useEffect or 'fullProducts' state
  //    Instead, we "join" the data from our two hooks using useMemo

  // Memoized filtered products
  const filteredProducts = useMemo(() => {
    // Create a quick lookup map for categories (id -> category)
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    // "Join" products and categories
    let productsWithCategories: ProductWithCategory[] = cachedProducts.map(product => ({
      ...product,
      categoryName: product.category_id ? categoryMap.get(product.category_id)?.name : undefined,
      categoryColor: product.category_id ? categoryMap.get(product.category_id)?.color : undefined,
    }));

    // Apply category filter
    if (selectedCategory) {
      productsWithCategories = productsWithCategories.filter(p => p.category_id === selectedCategory);
    }

    // Apply search filter
    if (debouncedSearch) {
      productsWithCategories = productsWithCategories.filter(p =>
        p.name.toLowerCase().includes(debouncedSearch.toLowerCase())
      );
    }

    return productsWithCategories;
  }, [cachedProducts, categories, selectedCategory, debouncedSearch]);

  const formatCurrency = (amount: number) => {
    return `PKR ${amount.toFixed(2)}`;
  };

  const isLoading = productsLoading || categoriesLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* ... (skeleton/loading state code is fine, no changes needed) ... */}
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products..." className="pl-10" disabled />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-6 bg-muted rounded w-1/2 mb-2" />
                <div className="h-3 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        {/* 5. This badge now uses our reliable 'isOnline' hook */}
        {!isOnline && (
          <Badge variant={"secondary"} className="h-10 px-3 flex items-center gap-2">
            <WifiOff className="h-4 w-4" />
            Offline
          </Badge>
        )}
      </div>

      {filteredProducts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No products found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const isLowStock = product.stock_quantity <= product.low_stock_threshold;
            const isOutOfStock = product.stock_quantity === 0;

            return (
              <Card
                key={product.id}
                className={`overflow-hidden hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer group ${
                  isOutOfStock ? "opacity-60" : ""
                }`}
                onClick={() => !isOutOfStock && onAddToCart(product)}
              >
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-base line-clamp-2 flex-1 group-hover:text-primary transition-colors min-h-[2.5rem]">
                        {product.name}
                      </h3>
                      {isLowStock && !isOutOfStock && (
                        <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />
                      )}
                    </div>

                    {/* 6. This badge now gets data from our local "join" */}
                    {product.categoryName && product.categoryColor && (
                      <Badge
                        className="text-xs"
                        style={{ backgroundColor: product.categoryColor }}
                      >
                        {product.categoryName}
                      </Badge>
                    )}
                    
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <p className="text-2xl font-bold text-primary">
                          {formatCurrency(product.retail_price)}
                        </p>
                      </div>
                      
                      <p className={`text-xs font-medium ${isOutOfStock ? "text-destructive" : isLowStock ? "text-warning" : "text-muted-foreground"}`}>
                        {isOutOfStock ? "Out of Stock" : `${product.stock_quantity} in stock`}
                      </p>
                    </div>

                    <Button
                      className="w-full h-10 text-sm font-semibold"
                      disabled={isOutOfStock}
                      variant={isOutOfStock ? "secondary" : "default"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isOutOfStock) {
                          onAddToCart(product);
                        }
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};