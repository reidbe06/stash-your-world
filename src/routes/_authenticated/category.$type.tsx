import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bookmark, Shirt, Home as HomeIcon, Sparkles, Dumbbell, Plane, Laptop,
  UtensilsCrossed, ShoppingBag, Briefcase, Heart, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Item } from "@/components/ItemCard";

export const Route = createFileRoute("/_authenticated/category/$type")({
  head: () => ({ meta: [{ title: "Category — STASHd" }] }),
  component: CategorySubcategoryPage,
});

type CategoryMeta = {
  key: string;
  label: string;
  icon: LucideIcon;
  tint: string;
  fg: string;
};

const CATEGORY_META: CategoryMeta[] = [
  { key: "all",        label: "All Saves",    icon: Bookmark,        tint: "bg-rose-100",    fg: "text-rose-500" },
  { key: "Recipe",     label: "Recipes",      icon: UtensilsCrossed, tint: "bg-orange-100",  fg: "text-orange-500" },
  { key: "Fashion",    label: "Fashion",      icon: Shirt,           tint: "bg-violet-100",  fg: "text-violet-500" },
  { key: "Product",    label: "Products",     icon: ShoppingBag,     tint: "bg-blue-100",    fg: "text-blue-500" },
  { key: "Home",       label: "Home & Decor", icon: HomeIcon,        tint: "bg-amber-100",   fg: "text-amber-600" },
  { key: "Beauty",     label: "Beauty",       icon: Sparkles,        tint: "bg-pink-100",    fg: "text-pink-500" },
  { key: "Fitness",    label: "Fitness",      icon: Dumbbell,        tint: "bg-sky-100",     fg: "text-sky-500" },
  { key: "Travel",     label: "Travel",       icon: Plane,           tint: "bg-emerald-100", fg: "text-emerald-500" },
  { key: "Tutorial",   label: "Tutorials",    icon: Laptop,          tint: "bg-indigo-100",  fg: "text-indigo-500" },
  { key: "Business",   label: "Business",     icon: Briefcase,       tint: "bg-stone-100",   fg: "text-stone-500" },
  { key: "Parenting",  label: "Parenting",    icon: Heart,           tint: "bg-red-100",     fg: "text-red-400" },
];

function CategorySubcategoryPage() {
  const { type } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const meta = CATEGORY_META.find((c) => c.key === type) ?? CATEGORY_META[0];

  const { data: items = [] } = useQuery({
    queryKey: ["items-category", user?.id, type],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("type", type)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  const subcategories = useMemo(() => {
    const bySub: Record<string, number> = {};
    for (const it of items) {
      const sub = (it as Item & { subcategory?: string; ai_subcategory?: string }).subcategory
        ?? (it as Item & { subcategory?: string; ai_subcategory?: string }).ai_subcategory
        ?? null;
      if (sub) bySub[sub] = (bySub[sub] || 0) + 1;
    }
    return Object.entries(bySub)
      .sort((a, b) => b[1] - a[1])
      .map(([sub, count]) => ({ sub, count }));
  }, [items]);

  const totalCount = items.length;

  function goToSubcategory(sub: string) {
    navigate({ to: "/search", search: { type, sub } as never });
  }

  function goToAllInCategory() {
    navigate({ to: "/search", search: { type } as never });
  }

  const Icon = meta.icon;

  return (
    <div className="space-y-5">
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate({ to: "/dashboard" })}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
      >
        <ChevronLeft className="h-4 w-4" />
        Library
      </button>

      {/* Page header */}
      <div className="flex items-center gap-4">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${meta.tint} ${meta.fg}`}>
          <Icon className="h-7 w-7" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{meta.label}</h1>
          <p className="text-sm text-muted-foreground">
            {totalCount} save{totalCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {subcategories.length > 0 ? (
        <>
          {/* Subcategories label */}
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Subcategories
          </p>

          {/* Subcategory cards */}
          <div className="space-y-2.5">
            {subcategories.map(({ sub, count }) => (
              <button
                key={sub}
                type="button"
                onClick={() => goToSubcategory(sub)}
                className="flex w-full items-center gap-3.5 rounded-2xl border border-border/40 bg-white px-4 py-3.5 text-left shadow-sm transition hover:bg-accent/20 active:bg-accent/40"
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${meta.tint} ${meta.fg}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex-1 text-sm font-bold text-foreground">{sub}</span>
                <span className="mr-1 text-sm font-semibold tabular-nums text-muted-foreground">{count}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}

            {/* View all row */}
            <button
              type="button"
              onClick={goToAllInCategory}
              className="flex w-full items-center justify-between rounded-2xl border border-border/40 bg-white px-4 py-3.5 text-left shadow-sm transition hover:bg-accent/20"
            >
              <span className="text-sm font-semibold text-primary">View all {meta.label}</span>
              <ChevronRight className="h-4 w-4 text-primary" />
            </button>
          </div>
        </>
      ) : (
        // No subcategories — redirect immediately to all saves in this category
        <div className="pt-2">
          <p className="mb-4 text-sm text-muted-foreground">
            No subcategories yet — showing all {meta.label} saves.
          </p>
          <button
            type="button"
            onClick={goToAllInCategory}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            View all {meta.label}
          </button>
        </div>
      )}
    </div>
  );
}
