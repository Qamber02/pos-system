import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { ProductGrid } from "@/components/ProductGrid";
import { CategorySidebar } from "@/components/CategorySidebar";
import { CategoryFilter } from "@/components/CategoryFilter";
import { Cart, CartItem } from "@/components/Cart";
import { CheckoutDialog } from "@/components/CheckoutDialog";
import { ReturnDialog } from "@/components/ReturnDialog";
import { HoldCartDialog } from "@/components/HoldCartDialog";
import { Button } from "@/components/ui/button";
import { RotateCcw, FolderOpen } from "lucide-react";
import { toast } from "sonner";
// --- Import our new hooks and service ---
import { useUserRole } from "@/hooks/useUserRole";
import { useOfflineSettings } from "@/hooks/useOfflineSettings";
import { syncService } from "@/lib/syncService";
import { CachedHeldCart, db, CachedProduct, CachedProductVariant } from "@/lib/db";
import { VariantSelector } from "@/components/VariantSelector";

import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

const POS = () => {
  const navigate = useNavigate();
  // We get the user profile from our hook now
  const { profile } = useUserRole();

  // We get settings (including taxRate) from our hook
  const { settings } = useOfflineSettings();
  const taxRate = settings.tax_rate;

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  // const [taxRate, setTaxRate] = useState(0); // This is now from settings
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [holdCartOpen, setHoldCartOpen] = useState(false);
  const [variantSelectorOpen, setVariantSelectorOpen] = useState(false);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<CachedProduct | null>(null);

  // Barcode Scanner Logic
  useBarcodeScanner({
    onScan: async (barcode) => {
      console.log("Scanned barcode:", barcode);
      try {
        const product = await db.products.where('barcode').equals(barcode).first();
        if (product) {
          handleAddToCart(product);
          toast.success(`Scanned: ${product.name}`);
        } else {
          toast.error(`Product not found for barcode: ${barcode}`);
        }
      } catch (error) {
        console.error("Error scanning barcode:", error);
      }
    }
  });

  useEffect(() => {
    checkAuth();
    // fetchSettings(); // We no longer need this
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    // We don't need setUser, our hook handles it
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        navigate("/auth");
      }
    });
  };

  // fetchSettings is removed.

  const handleAddToCart = async (product: any) => {
    // Check for variants
    const variants = await db.productVariants
      .where('product_id')
      .equals(product.id)
      .filter(v => v.is_active && v.stock_quantity > 0)
      .toArray();

    if (variants.length > 0) {
      setSelectedProductForVariant(product);
      setVariantSelectorOpen(true);
      return;
    }

    addToCart(product);
  };

  const addToCart = (product: any, variant?: CachedProductVariant) => {
    const itemId = variant ? variant.id : product.id;
    const itemName = variant ? `${product.name} - ${variant.variant_name}` : product.name;
    const itemPrice = variant ? product.retail_price + variant.price_adjustment : product.retail_price;
    const itemStock = variant ? variant.stock_quantity : product.stock_quantity;

    const existingItem = cartItems.find((item) => item.id === itemId);

    if (existingItem) {
      if (existingItem.quantity >= itemStock) {
        toast.error("Cannot add more - insufficient stock");
        return;
      }
      setCartItems(
        cartItems.map((item) =>
          item.id === itemId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCartItems([
        ...cartItems,
        {
          id: itemId,
          name: itemName,
          price: itemPrice,
          quantity: 1,
          maxStock: itemStock,
          productId: product.id, // Always store the parent product ID
          variantId: variant?.id,
          variantName: variant?.variant_name
        },
      ]);
    }
    toast.success("Added to cart");
  };

  const handleSelectVariant = (variant: CachedProductVariant) => {
    if (selectedProductForVariant) {
      addToCart(selectedProductForVariant, variant);
    }
  };

  const handleUpdateQuantity = (id: string, quantity: number) => {
    setCartItems(
      cartItems.map((item) =>
        item.id === id ? { ...item, quantity } : item
      )
    );
  };

  const handleRemoveItem = (id: string) => {
    setCartItems(cartItems.filter((item) => item.id !== id));
    toast.success("Removed from cart");
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setCheckoutOpen(true);
  };

  const handleCompleteCheckout = () => {
    setCartItems([]);
    setDiscount(0);
  };

  // --- THIS FUNCTION IS NOW OFFLINE-FIRST ---
  const handleHoldCart = async () => {
    if (cartItems.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    if (!profile) {
      toast.error("User not loaded. Cannot hold cart.");
      return;
    }

    const cartName = `Cart ${new Date().toLocaleString()}`;
    const now = new Date();

    const heldCart: CachedHeldCart = {
      id: crypto.randomUUID(),
      user_id: profile.id,
      cart_name: cartName,
      cart_data: {
        items: cartItems,
        discount: discount,
      },
      created_at: now.toISOString(),
      synced: false,
      lastModified: now.getTime()
    };

    try {
      // Use the sync service to save locally and queue for upload
      await syncService.queueOperation('heldCarts', 'insert', heldCart);

      toast.success("Cart held successfully (saved locally)");
      setCartItems([]);
      setDiscount(0);
    } catch (error: any) {
      console.error("Error holding cart locally:", error);
      toast.error("Error holding cart");
    }
  };

  const handleClearCart = () => {
    if (cartItems.length === 0) return;
    setCartItems([]);
    setDiscount(0);
    toast.success("Cart cleared");
  };

  const handleLoadCart = (items: CartItem[], loadedDiscount: number) => {
    setCartItems(items);
    setDiscount(loadedDiscount);
  };

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const subtotalAfterDiscount = subtotal - discount;
  const taxAmount = subtotalAfterDiscount * (taxRate / 100);
  const total = subtotalAfterDiscount + taxAmount;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-primary/10">
      <header className="border-b-2 bg-card/98 backdrop-blur-md shadow-[var(--shadow-elevated)] sticky top-0 z-50">
        <div className="max-w-[2000px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10">
          <div className="flex items-center justify-between py-5 gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <Navigation />
              <CategoryFilter
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
              />
              <div className="flex flex-col">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold bg-gradient-to-r from-primary via-primary-glow to-primary/80 bg-clip-text text-transparent tracking-tight leading-tight">
                  {/* Show offline business name */}
                  {settings.business_name || "POS SHOPPING"}
                </h1>
                <p className="text-sm text-muted-foreground mt-1 font-medium hidden sm:block">Professional Point of Sale</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-secondary/80 to-secondary/50 border-2 border-border/60 shadow-[var(--shadow-card)]">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHoldCartOpen(true)}
                  className="gap-2 h-10 px-4 hover:bg-primary/15 hover:text-primary font-medium transition-[var(--transition-smooth)]"
                >
                  <FolderOpen className="h-5 w-5" />
                  <span className="hidden lg:inline">Held Carts</span>
                </Button>
                <div className="w-px h-7 bg-border/70" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReturnOpen(true)}
                  className="gap-2 h-10 px-4 hover:bg-primary/15 hover:text-primary font-medium transition-[var(--transition-smooth)]"
                >
                  <RotateCcw className="h-5 w-5" />
                  <span className="hidden lg:inline">Return</span>
                </Button>
              </div>
              <div className="md:hidden flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHoldCartOpen(true)}
                  className="gap-2"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReturnOpen(true)}
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
              <div className="hidden md:flex items-center gap-2.5 px-4 py-2 rounded-lg bg-accent/10 border-2 border-accent/20">
                <div className="h-2.5 w-2.5 rounded-full bg-accent animate-pulse shadow-sm shadow-accent/50" />
                <span className="text-sm font-semibold text-foreground">
                  {/* Show offline email */}
                  {profile?.email || "..."}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-93px)] h-[calc(100vh-93px)]">
        <div className="hidden lg:block">
          <CategorySidebar
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />
        </div>
        <main className="flex-1 overflow-auto">
          <div className="h-full max-w-[2000px] mx-auto">
            <div className="h-full flex flex-col lg:flex-row gap-5 p-4 sm:p-5 lg:p-6">
              <div className="flex-1 min-w-0">
                <div className="bg-card/40 backdrop-blur-sm rounded-2xl border-2 border-border/50 shadow-[var(--shadow-card)] p-4 sm:p-5 min-h-[400px] h-full">
                  <ProductGrid
                    onAddToCart={handleAddToCart}
                    selectedCategory={selectedCategory}
                  />
                </div>
              </div>

              <div className="w-full lg:w-[380px] xl:w-[420px] shrink-0">
                <div className="lg:sticky lg:top-6">
                  <Cart
                    items={cartItems}
                    onUpdateQuantity={handleUpdateQuantity}
                    onRemoveItem={handleRemoveItem}
                    onCheckout={handleCheckout}
                    onHoldCart={handleHoldCart}
                    onClearCart={handleClearCart}
                    discount={discount}
                    taxRate={taxRate}
                  />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        cartItems={cartItems}
        subtotal={subtotal}
        discount={discount}
        taxRate={taxRate}
        taxAmount={taxAmount}
        total={total}
        onComplete={handleCompleteCheckout}
        profile={profile}
      />

      <ReturnDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
      />

      <HoldCartDialog
        open={holdCartOpen}
        onOpenChange={setHoldCartOpen}
        onLoadCart={handleLoadCart}
      />

      <VariantSelector
        open={variantSelectorOpen}
        onOpenChange={setVariantSelectorOpen}
        product={selectedProductForVariant}
        onSelectVariant={handleSelectVariant}
      />
    </div>
  );
};

export default POS;