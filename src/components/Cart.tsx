import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Minus, Plus, Trash2, ShoppingCart, Save, Trash, CreditCard } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  maxStock: number;
  productId?: string; // Added to link back to parent product
  variantId?: string;
  variantName?: string;
}

interface CartProps {
  items: CartItem[];
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onCheckout: () => void;
  onHoldCart?: () => void;
  onClearCart?: () => void;
  discount: number;
  taxRate: number;
}

export const Cart = ({ items, onUpdateQuantity, onRemoveItem, onCheckout, onHoldCart, onClearCart, discount, taxRate }: CartProps) => {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount = discount;
  const subtotalAfterDiscount = subtotal - discountAmount;
  const taxAmount = subtotalAfterDiscount * (taxRate / 100);
  const total = subtotalAfterDiscount + taxAmount;

  const formatCurrency = useFormatCurrency();

  if (items.length === 0) {
    return (
      <Card className="border-0 shadow-[var(--shadow-card)] bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm h-full flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl font-bold">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Current Order
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4 opacity-60">
          <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
            <ShoppingCart className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Your cart is empty</h3>
            <p className="text-sm text-muted-foreground mt-1">Select products to start a new order</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-[var(--shadow-card)] bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md flex flex-col h-[calc(100vh-140px)] sticky top-6">
      <CardHeader className="pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl font-bold">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Current Order
          </CardTitle>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {items.map((item) => (
          <div key={item.id} className="group flex gap-3 p-3 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all duration-200">
            <div className="flex-1 min-w-0 space-y-1">
              <h4 className="font-semibold text-sm leading-tight line-clamp-2 text-zinc-800 dark:text-zinc-100">
                {item.name}
              </h4>
              <p className="text-xs font-medium text-zinc-500">
                {formatCurrency(item.price)}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900 rounded-lg p-0.5 border border-zinc-200 dark:border-zinc-800">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-md hover:bg-white dark:hover:bg-zinc-800 hover:shadow-sm"
                  onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
                >
                  <Minus className="h-3 w-3" />
                </Button>

                <div className="w-8 text-center font-semibold text-sm">
                  {item.quantity}
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-md hover:bg-white dark:hover:bg-zinc-800 hover:shadow-sm"
                  onClick={() => onUpdateQuantity(item.id, Math.min(item.maxStock, item.quantity + 1))}
                  disabled={item.quantity >= item.maxStock}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-bold text-sm">
                  {formatCurrency(item.price * item.quantity)}
                </span>
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="text-zinc-400 hover:text-red-500 transition-colors p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>

      <div className="p-4 bg-zinc-50/50 dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>

          {discountAmount > 0 && (
            <div className="flex justify-between text-emerald-600 font-medium">
              <span>Discount</span>
              <span>-{formatCurrency(discountAmount)}</span>
            </div>
          )}

          <div className="flex justify-between text-muted-foreground">
            <span>Tax ({taxRate}%)</span>
            <span>{formatCurrency(taxAmount)}</span>
          </div>

          <Separator className="my-2" />

          <div className="flex justify-between text-xl font-extrabold text-zinc-900 dark:text-white">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {onHoldCart && (
            <Button onClick={onHoldCart} variant="outline" className="w-full border-zinc-200 dark:border-zinc-800 hover:bg-white dark:hover:bg-zinc-900 hover:text-primary">
              <Save className="h-4 w-4 mr-2" />
              Hold
            </Button>
          )}
          {onClearCart && (
            <Button onClick={onClearCart} variant="outline" className="w-full border-zinc-200 dark:border-zinc-800 hover:bg-red-50 hover:text-red-600 hover:border-red-100 dark:hover:bg-red-900/20">
              <Trash className="h-4 w-4 mr-2" />
              Clear
            </Button>
          )}
        </div>

        <Button onClick={onCheckout} className="w-full h-12 text-lg font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
          <CreditCard className="h-5 w-5 mr-2" />
          Checkout
        </Button>
      </div>
    </Card>
  );
};
