import { memo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOfflineCategories } from "@/hooks/useOfflineCategories";
import { Layers, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CategorySidebarProps {
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

const CategorySidebarComponent = ({ selectedCategory, onSelectCategory }: CategorySidebarProps) => {
  const { categories, loading } = useOfflineCategories();

  if (loading) {
    return (
      <div className="w-72 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
        <div className="h-8 w-32 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse mb-6" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="w-72 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-sm border-r border-zinc-200 dark:border-zinc-800 flex flex-col h-full rounded-l-2xl">
      <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
        <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-800 dark:text-zinc-100">
          <Layers className="h-5 w-5 text-primary" />
          Categories
        </h2>
        <p className="text-xs text-muted-foreground mt-1">Filter products by category</p>
      </div>
      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-1">
          <Button
            variant="ghost"
            className={`w-full justify-start text-left h-12 rounded-xl transition-all duration-200 ${selectedCategory === null
                ? "bg-zinc-900 text-white shadow-md shadow-zinc-900/10 dark:bg-white dark:text-zinc-900"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            onClick={() => onSelectCategory(null)}
          >
            <Layers className="h-4 w-4 mr-3" />
            All Products
          </Button>

          {categories.map((category) => (
            <Button
              key={category.id}
              variant="ghost"
              className={`w-full justify-between text-left h-12 rounded-xl transition-all duration-200 group ${selectedCategory === category.id
                  ? "bg-zinc-900 text-white shadow-md shadow-zinc-900/10 dark:bg-white dark:text-zinc-900"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              onClick={() => onSelectCategory(category.id)}
            >
              <div className="flex items-center">
                <Tag className="h-4 w-4 mr-3 opacity-70" />
                <span className="truncate max-w-[140px]">{category.name}</span>
              </div>
              {category.color && (
                <div
                  className="w-2 h-2 rounded-full ring-2 ring-white dark:ring-zinc-950"
                  style={{ backgroundColor: category.color }}
                />
              )}
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export const CategorySidebar = memo(CategorySidebarComponent);
