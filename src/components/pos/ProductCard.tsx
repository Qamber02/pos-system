import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Plus } from "lucide-react";
import { CachedProduct } from "@/lib/db";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface ProductCardProps {
    product: CachedProduct & {
        categoryName?: string;
        categoryColor?: string;
    };
    onAddToCart: (product: CachedProduct) => void;
}

export const ProductCard = ({ product, onAddToCart }: ProductCardProps) => {
    const formatCurrency = useFormatCurrency();
    const isOutOfStock = product.stock_quantity <= 0;
    const isLowStock = product.stock_quantity <= product.low_stock_threshold;

    return (
        <Card
            className={`group relative overflow-hidden border-0 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer rounded-2xl ring-1 ring-zinc-200/50 dark:ring-zinc-800/50 ${isOutOfStock ? "opacity-60 grayscale" : ""
                }`}
            onClick={() => !isOutOfStock && onAddToCart(product)}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <CardContent className="p-5 flex flex-col h-full relative z-10">
                <div className="flex justify-between items-start mb-3">
                    {product.categoryName && (
                        <Badge
                            variant="secondary"
                            className="text-[10px] font-medium px-2 py-0.5 h-5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors"
                            style={product.categoryColor ? { borderColor: product.categoryColor } : undefined}
                        >
                            {product.categoryName}
                        </Badge>
                    )}
                    {isLowStock && !isOutOfStock && (
                        <div className="flex items-center gap-1 text-amber-500 text-[10px] font-bold bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Low Stock</span>
                        </div>
                    )}
                </div>

                <h3 className="font-bold text-lg leading-tight text-zinc-800 dark:text-zinc-100 mb-4 group-hover:text-primary transition-colors">
                    {product.name}
                </h3>

                <div className="mt-auto space-y-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-3xl font-extrabold text-primary tracking-tight">
                            {formatCurrency(product.retail_price)}
                        </span>
                        <span className={`text-sm font-medium ${isOutOfStock ? "text-red-500" : isLowStock ? "text-amber-500" : "text-zinc-500 dark:text-zinc-400"}`}>
                            {isOutOfStock ? "Out of Stock" : `${product.stock_quantity} in stock`}
                        </span>
                    </div>

                    <Button
                        className={`w-full h-auto min-h-11 py-2 rounded-xl font-bold shadow-none transition-all duration-300 ${isOutOfStock
                            ? "bg-zinc-100 text-zinc-400 hover:bg-zinc-100 cursor-not-allowed"
                            : "bg-zinc-900 text-white hover:bg-primary hover:shadow-lg hover:shadow-primary/20 dark:bg-white dark:text-zinc-900 dark:hover:bg-primary dark:hover:text-white"
                            }`}
                        disabled={isOutOfStock}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!isOutOfStock) {
                                onAddToCart(product);
                            }
                        }}
                    >
                        <Plus className="h-5 w-5 mr-2 flex-shrink-0" />
                        <span className="whitespace-normal text-sm">{isOutOfStock ? "Unavailable" : "Add to Cart"}</span>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
