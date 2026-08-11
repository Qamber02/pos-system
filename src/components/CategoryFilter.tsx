import { useMemo } from "react"; // Import useMemo for performance
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Filter } from "lucide-react";
// We no longer need supabase or toast here
// Import our new offline hook
import { useOfflineCategories } from "@/hooks/useOfflineCategories";

// The 'Category' interface is now imported from db.ts
// (or you can define it here, but db.ts is better)
import { CachedCategory } from "@/lib/db"; 

interface CategoryFilterProps {
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

export const CategoryFilter = ({ selectedCategory, onSelectCategory }: CategoryFilterProps) => {
  // 1. Get categories from the local database using our hook
  // This hook also provides a loading state
  const { categories, loading } = useOfflineCategories();

  // 2. We no longer need useEffect or fetchCategories()
  // The useLiveQuery inside our hook handles everything.

  // 3. Find the selected category's name
  // useMemo prevents re-calculating this on every render
  const selectedCategoryName = useMemo(() => {
    if (loading || !selectedCategory) return "All Products";
    return categories.find(c => c.id === selectedCategory)?.name || "All Products";
  }, [selectedCategory, categories, loading]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 lg:hidden">
          <Filter className="h-4 w-4" />
          <span className="max-w-[120px] truncate">
            {loading ? "Loading..." : selectedCategoryName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 bg-popover z-50">
        <DropdownMenuItem 
          onClick={() => onSelectCategory(null)}
          className={selectedCategory === null ? "bg-accent" : ""}
        >
          All Products
        </DropdownMenuItem>
        
        {/* We map over the categories from our hook */}
        {categories.map((category: CachedCategory) => (
          <DropdownMenuItem
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            className={selectedCategory === category.id ? "bg-accent" : ""}
          >
            {category.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};