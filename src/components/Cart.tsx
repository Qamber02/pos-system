import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Minus, Plus, Trash2, ShoppingCart, Save, Trash } from "lucide-react";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  maxStock: number;
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

  const formatCurrency = (amount: number) => {
    return `PKR ${amount.toFixed(2)}`;
  };

  if (items.length === 0) {
    return (
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Cart
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Your cart is empty</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Cart
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4 max-h-[400px] overflow-y-auto">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm line-clamp-1">{item.name}</h4>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(item.price)} each
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
              >
                <Minus className="h-3 w-3" />
              </Button>
              
              <Input
                type="number"
                value={item.quantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  onUpdateQuantity(item.id, Math.min(Math.max(1, val), item.maxStock));
                }}
                className="w-16 h-8 text-center"
                min={1}
                max={item.maxStock}
              />
              
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => onUpdateQuantity(item.id, Math.min(item.maxStock, item.quantity + 1))}
                disabled={item.quantity >= item.maxStock}
              >
                <Plus className="h-3 w-3" />
              </Button>
              
              <Button
                size="icon"
                variant="destructive"
                className="h-8 w-8"
                onClick={() => onRemoveItem(item.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
      
      <CardFooter className="flex-col space-y-3">
        <div className="w-full space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>
          
          {discountAmount > 0 && (
            <div className="flex justify-between text-accent">
              <span>Discount</span>
              <span>-{formatCurrency(discountAmount)}</span>
            </div>
          )}
          
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax ({taxRate}%)</span>
            <span className="font-medium">{formatCurrency(taxAmount)}</span>
          </div>
          
          <div className="flex justify-between text-lg font-bold pt-2 border-t">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>

        <div className="w-full flex gap-2">
          {onHoldCart && (
            <Button onClick={onHoldCart} variant="outline" className="flex-1" size="sm">
              <Save className="h-4 w-4 mr-1" />
              Hold
            </Button>
          )}
          {onClearCart && (
            <Button onClick={onClearCart} variant="outline" className="flex-1" size="sm">
              <Trash className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
        
        <Button onClick={onCheckout} className="w-full" size="lg">
          Checkout
        </Button>
      </CardFooter>
    </Card>
  );
};
