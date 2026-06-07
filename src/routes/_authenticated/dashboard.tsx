import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bookmark, Shirt, Home as HomeIcon, Sparkles, Dumbbell, Plane, Laptop,
  UtensilsCrossed, ShoppingBag, Briefcase, Heart, ChevronRight, Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Item } from "@/components/ItemCard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "My Library — STASHd" }] }),
  component: Library,
});

type Category = {
  key: string;
  label: string;
  icon: LucideIcon;
  tint: string;
  fg: string;
  match: (it: Item) => boolean;
};

const CONTENT_CATEGORIES: Category[] = [
  { key: "all",       label: "All Saves",    icon: Bookmark,        tint: "bg-rose-100",    fg: "text-rose-500",    match: () => true },
  { key: "Recipe",    label: "Recipes",      icon: UtensilsCrossed, tint: "bg-orange-100",  fg: "text-orange-500",  match: (it) => it.type === "Recipe" },
  { key: "Fashion",   label: "Fashion",      icon: Shirt,           tint: "bg-violet-100",  fg: "text-violet-500",  match: (it) => it.type === "Fashion" },
  { key: "Product",   label: "Products",     icon: ShoppingBag,     tint: "bg-blue-100",    fg: "text-blue-500",    match: (it) => it.type === "Product" },
  { key: "Home",      label: "Home & Decor", icon: HomeIcon,        tint: "bg-amber-100",   fg: "text-amber-600",   match: (it) => it.type === "Home" },
  { key: "Beauty",    label: "Beauty",       icon: Sparkles,        tint: "bg-pink-100",    fg: "text-pink-500",    match: (it) => it.type === "Beauty" },
  { key: "Fitness",   label: "Fitness",      icon: Dumbbell,        tint: "bg-sky-100",     fg: "text-sky-500",     match: (it) => it.type === "Fitness" },
  { key: "Travel",    label: "Travel",       icon: Plane,           tint: "bg-emerald-100", fg: "text-emerald-500", match: (it) => it.type === "Travel" },
  { key: "Tutorial",  label: "Tutorials",    icon: Laptop,          tint: "bg-indigo-100",  fg: "text-indigo-500",  match: (it) => it.type === "Tutorial" },
  { key: "Business",  label: "Business",     icon: Briefcase,       tint: "bg-stone-100",   fg: "text-stone-500",   match: (it) => it.type === "Business" },
  { key: "Parenting", label: "Parenting",    icon: Heart,           tint: "bg-red-100",     fg: "text-red-400",     match: (it) => it.type === "Parenting" },
];

function Library() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: items } = useQuery({
    queryKey: ["items", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of CONTENT_CATEGORIES) {
      map[c.key] = items ? items.filter(c.match).length : 0;
    }
    return map;
  }, [items]);

  function handleCategoryClick(c: Category) {
    if (c.key === "all") {
      navigate({ to: "/search", search: {} as never });
    } else {
      navigate({ to: "/search", search: { type: c.key } as never });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything you've saved, beautifully organized.
        </p>
      </div>

      <button
        type="button"
        onClick={() => navigate({ to: "/search", search: {} as never })}
        className="flex w-full items-center gap-3 rounded-full bg-muted px-4 py-3 text-left text-sm text-muted-foreground transition hover:bg-muted/80"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground/60" />
        Search your saves...
      </button>

      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Categories
        </h2>
        <span className="text-xs font-semibold text-primary">Edit</span>
      </div>

      <div className="space-y-2.5">
        {CONTENT_CATEGORIES.map((c) => {
          const count = counts[c.key] ?? 0;
          const subtext =
            c.key === "all"
              ? "All your saved content"
              : `${count} save${count !== 1 ? "s" : ""}`;

          return (
            <button
              key={c.key}
              onClick={() => handleCategoryClick(c)}
              className="flex w-full items-center gap-3.5 rounded-2xl border border-border/40 bg-white px-4 py-3.5 text-left shadow-sm transition hover:shadow-md active:scale-[0.985]"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${c.tint} ${c.fg}`}
              >
                <c.icon className="h-5 w-5" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-foreground">
                  {c.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {subtext}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-1.5">
                <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                  {count}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </span>
            </button>
          );
        })}
      </div>

      <Link
        to="/save"
        className="block w-full rounded-full bg-brand-gradient py-3.5 text-center text-sm font-semibold text-primary-foreground shadow-brand"
      >
        + Save an Item
      </Link>
    </div>
  );
}
