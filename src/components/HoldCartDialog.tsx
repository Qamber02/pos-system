import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Trash2, ShoppingBag } from "lucide-react";
import { CartItem } from "./Cart";
import { Card, CardContent } from "@/components/ui/card";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

import { db, CachedHeldCart } from "@/lib/db";
import { syncService } from "@/lib/syncService";

interface HoldCartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadCart: (cart: CartItem[], discount: number) => void;
}

export const HoldCartDialog = ({ open, onOpenChange, onLoadCart }: HoldCartDialogProps) => {
  const [heldCarts, setHeldCarts] = useState<CachedHeldCart[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchHeldCarts();
    }
  }, [open]);

  const fetchHeldCarts = async () => {
    setLoading(true);
    try {
      // 1. Fetch from local Dexie database first (works offline)
      const localCarts = await db.heldCarts.toArray();
      localCarts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setHeldCarts(localCarts);

      // 2. If online, fetch latest from cloud and cache
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("held_carts")
          .select("*")
          .order("created_at", { ascending: false });

        if (!error && data && data.length > 0) {
          await db.heldCarts.bulkPut(
            data.map((c: any) => ({
              ...c,
              lastModified: new Date(c.created_at).getTime(),
              synced: true,
            }))
          );
          const updatedLocal = await db.heldCarts.toArray();
          updatedLocal.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setHeldCarts(updatedLocal);
        }
      }
    } catch (error: any) {
      console.error("Error loading held carts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadCart = (cart: CachedHeldCart) => {
    onLoadCart(cart.cart_data.items, cart.cart_data.discount || 0);
    toast.success(`Loaded: ${cart.cart_name}`);
    onOpenChange(false);
  };

  const handleDeleteCart = async (id: string) => {
    try {
      await syncService.queueOperation('heldCarts', 'delete', { id });
      toast.success("Held cart deleted");
      fetchHeldCarts();
    } catch (error: any) {
      console.error("Error deleting held cart:", error);
      toast.error("Error deleting held cart");
    }
  };

  const formatCurrency = useFormatCurrency();

  const calculateTotal = (items: CartItem[], discount: number) => {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return subtotal - discount;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Held Carts</DialogTitle>
          <DialogDescription>
            Load a previously held cart to continue
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : heldCarts.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No held carts</p>
            </div>
          ) : (
            heldCarts.map((cart) => (
              <Card key={cart.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-base mb-1">{cart.cart_name}</h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        {cart.cart_data.items.length} items • {formatCurrency(calculateTotal(cart.cart_data.items, cart.cart_data.discount))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(cart.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleLoadCart(cart)}
                      >
                        Load
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteCart(cart.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
