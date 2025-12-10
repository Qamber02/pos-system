import { useState, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { useOfflineCategories } from "@/hooks/useOfflineCategories";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDebounce } from "@/hooks/useDebounce";
import { CachedProduct, CachedCategory } from "@/lib/db";
import { ProductCard } from "@/components/pos/ProductCard";

// IMPORT THE NEWLY OPTIMIZED HOOK
import { useOfflineProducts } from "@/hooks/useOfflineProducts";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

// Define a new product type that includes the joined category
interface ProductWithCategory extends CachedProduct {
  categoryName?: string;
  categoryColor?: string;
}

interface ProductGridProps {
  onAddToCart: (product: ProductWithCategory) => void;
  selectedCategory: string | null;
}

const PRODUCTS_PER_PAGE = 90; // Load 90 products at a time

export const ProductGrid = ({ onAddToCart, selectedCategory }: ProductGridProps) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const [limit, setLimit] = useState(PRODUCTS_PER_PAGE);

  const { products: cachedProducts, loading: productsLoading } = useOfflineProducts(
    debouncedSearch,
    selectedCategory,
    limit // Pass the current limit
  );

  const { categories, loading: categoriesLoading } = useOfflineCategories();
  const isOnline = useOnlineStatus();

  // 3. Decide which product list to display
  const productsToDisplay = cachedProducts;

  // 4. Update useMemo to use our new `productsToDisplay` variable
  const filteredProducts = useMemo(() => {
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    return productsToDisplay.map(product => ({
      ...product,
      categoryName: product.category_id ? categoryMap.get(product.category_id)?.name : undefined,
      categoryColor: product.category_id ? categoryMap.get(product.category_id)?.color : undefined,
    }));
  }, [productsToDisplay, categories]); // Only re-run when products or categories change

  const formatCurrency = useFormatCurrency();

  const isLoading = productsLoading || categoriesLoading;

  if (isLoading && limit === PRODUCTS_PER_PAGE) { // Only show full skeleton on first load
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

        {!isOnline && (
          <Badge variant={"secondary"} className="h-10 px-3 flex items-center gap-2">
            <WifiOff className="h-4 w-4" />
            Offline
          </Badge>
        )}
      </div>

      {/* 5. Update this check to use 'productsToDisplay' */}
      {productsToDisplay.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
            <Search className="h-8 w-8 text-zinc-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">No products found</h3>
          <p className="text-muted-foreground max-w-xs mx-auto mt-2">
            {searchQuery ? `We couldn't find anything matching "${searchQuery}"` : "Try adjusting your filters or add new products."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={onAddToCart}
            />
          ))}
        </div>
      )}

      {/* 6. ADD THE "LOAD MORE" BUTTON */}
      <div className="text-center mt-6">
        {/* This logic is now correct. It shows if the number of products we *received*
            is equal to the limit we *requested*. */}
        {cachedProducts.length === limit && (
          <Button
            variant="outline"
            onClick={() => setLimit(prevLimit => prevLimit + PRODUCTS_PER_PAGE)}
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Load More Products"}
          </Button>
        )}
      </div>
    </div>
  );
};