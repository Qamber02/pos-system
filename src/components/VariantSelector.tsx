import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CachedProduct, CachedProductVariant, db } from "@/lib/db";
import { Loader2, AlertCircle } from "lucide-react";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface VariantSelectorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    product: CachedProduct | null;
    onSelectVariant: (variant: CachedProductVariant) => void;
    trigger?: React.ReactNode;
}

export const VariantSelector = ({
    open,
    onOpenChange,
    product,
    onSelectVariant,
    trigger
}: VariantSelectorProps) => {
    const [variants, setVariants] = useState<CachedProductVariant[]>([]);
    const [loading, setLoading] = useState(false);
    const formatCurrency = useFormatCurrency();

    useEffect(() => {
        if (open && product) {
            setLoading(true);
            db.productVariants
                .where("product_id")
                .equals(product.id)
                .filter((v) => v.is_active)
                .toArray()
                .then(setVariants)
                .finally(() => setLoading(false));
        }
    }, [open, product]);

    if (!product) return null;

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                {trigger || <span className="hidden"></span>}
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
                <div className="p-3 border-b bg-muted/50">
                    <h4 className="font-medium leading-none">Select Option</h4>
                    <p className="text-xs text-muted-foreground mt-1">{product.name}</p>
                </div>
                <div className="p-2 max-h-[200px] overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-4 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Loading...
                        </div>
                    ) : variants.length === 0 ? (
                        <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
                            <AlertCircle className="h-4 w-4 mr-2" />
                            No options available
                        </div>
                    ) : (
                        <div className="grid gap-1">
                            {variants.map((variant) => {
                                const price = product.retail_price + variant.price_adjustment;
                                const hasStock = variant.stock_quantity > 0;

                                return (
                                    <Button
                                        key={variant.id}
                                        variant="ghost"
                                        className={`justify-between h-auto py-2 px-3 font-normal ${!hasStock ? 'opacity-50' : ''}`}
                                        onClick={() => {
                                            if (hasStock) {
                                                onSelectVariant(variant);
                                                onOpenChange(false);
                                            }
                                        }}
                                        disabled={!hasStock}
                                    >
                                        <div className="flex flex-col items-start text-left">
                                            <span className="font-medium">{variant.variant_name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {hasStock ? `${variant.stock_quantity} in stock` : 'Out of stock'}
                                            </span>
                                        </div>
                                        <div className="font-semibold">
                                            {formatCurrency(price)}
                                        </div>
                                    </Button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};
