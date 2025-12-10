import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CachedProduct, CachedProductVariant, db } from "@/lib/db";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface VariantSelectorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    product: CachedProduct | null;
    onSelectVariant: (variant: CachedProductVariant) => void;
}

export const VariantSelectorDialog = ({
    open,
    onOpenChange,
    product,
    onSelectVariant,
}: VariantSelectorDialogProps) => {
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
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Select Option for {product.name}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {loading ? (
                        <div className="text-center py-4">Loading options...</div>
                    ) : variants.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground">
                            No active options available.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {variants.map((variant) => (
                                <Button
                                    key={variant.id}
                                    variant="outline"
                                    className="h-auto py-4 flex flex-col items-start gap-1 hover:border-primary hover:bg-primary/5"
                                    onClick={() => {
                                        onSelectVariant(variant);
                                        onOpenChange(false);
                                    }}
                                    disabled={variant.stock_quantity <= 0}
                                >
                                    <div className="flex justify-between w-full font-semibold">
                                        <span>{variant.variant_name}</span>
                                        <span>
                                            {/* Show price difference or total price? Let's show total price */}
                                            {formatCurrency(product.retail_price + variant.price_adjustment)}
                                        </span>
                                    </div>
                                    <div className="text-xs text-muted-foreground w-full flex justify-between">
                                        <span>SKU: {variant.sku || "N/A"}</span>
                                        <span className={variant.stock_quantity <= 0 ? "text-destructive" : "text-success"}>
                                            {variant.stock_quantity > 0 ? `${variant.stock_quantity} in stock` : "Out of Stock"}
                                        </span>
                                    </div>
                                </Button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
