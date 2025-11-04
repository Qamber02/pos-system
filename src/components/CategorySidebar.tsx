import { useEffect, useState, memo } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";

interface Category {
  id: string;
  name: string;
  color: string;
}

interface CategorySidebarProps {
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

const CategorySidebarComponent = ({ selectedCategory, onSelectCategory }: CategorySidebarProps) => {
  const { data: categories = [], isLoading: loading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, color")
        .eq('user_id', user.id)
        .order("name");

      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (loading) {
    return (
      <div className="w-72 bg-category-sidebar border-r border-category-sidebar-hover p-4 space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-category-sidebar-hover/50 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="w-72 bg-category-sidebar border-r-2 border-category-sidebar-hover/30 flex flex-col shadow-lg">
      <div className="p-5 border-b-2 border-category-sidebar-hover/30 bg-category-sidebar-hover/20">
        <h2 className="text-xl font-bold text-category-sidebar-foreground tracking-wide">Categories</h2>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          <Button
            variant="ghost"
            className={`w-full justify-start text-left h-12 ${
              selectedCategory === null
                ? "bg-category-sidebar-hover text-category-sidebar-foreground"
                : "text-category-sidebar-foreground/80 hover:bg-category-sidebar-hover hover:text-category-sidebar-foreground"
            }`}
            onClick={() => onSelectCategory(null)}
          >
            All Products
          </Button>
          
          {categories.map((category) => (
            <Button
              key={category.id}
              variant="ghost"
              className={`w-full justify-start text-left h-12 ${
                selectedCategory === category.id
                  ? "bg-category-sidebar-hover text-category-sidebar-foreground"
                  : "text-category-sidebar-foreground/80 hover:bg-category-sidebar-hover hover:text-category-sidebar-foreground"
              }`}
              onClick={() => onSelectCategory(category.id)}
            >
              {category.name}
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export const CategorySidebar = memo(CategorySidebarComponent);
