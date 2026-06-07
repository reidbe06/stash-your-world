import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bookmark, Shirt, Home as HomeIcon, Sparkles, Dumbbell, Plane, Laptop,
  UtensilsCrossed, ShoppingBag, Briefcase, Heart, ChevronRight, ChevronDown, Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Item } from "@/components/ItemCard";
import { Link } from "@tanstack/react-router";

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
  const [expanded, setExpanded] = useState<string | null>(null);

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

  // Subcategory counts — checks both `subcategory` and `ai_subcategory` fields
  const subCounts = useMemo(() => {
    const map: Record<string, { sub: string; count: number }[]> = {};
    for (const c of CONTENT_CATEGORIES) {
      if (c.key === "all") continue;
      const catItems = items?.filter(c.match) ?? [];
      const bySub: Record<string, number> = {};
      catItems.forEach((it) => {
        const sub = it.subcategory ?? it.ai_subcategory ?? null;
        if (sub) bySub[sub] = (bySub[sub] || 0) + 1;
      });
      map[c.key] = Object.entries(bySub)
        .sort((a, b) => b[1] - a[1])
        .map(([sub, count]) => ({ sub, count }));
    }
    return map;
  }, [items]);

  function goToCategory(key: string) {
    if (key === "all") {
      navigate({ to: "/search", search: {} as never });
    } else {
      const subs = subCounts[key] ?? [];
      if (subs.length > 0) {
        navigate({ to: "/category/$type", params: { type: key } });
      } else {
        navigate({ to: "/search", search: { type: key } as never });
      }
    }
  }

  function goToSubcategory(typeKey: string, sub: string) {
    navigate({ to: "/search", search: { type: typeKey, sub } as never });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything you've saved, beautifully organized.
        </p>
      </div>

      {/* Search bar */}
      <button
        type="button"
        onClick={() => navigate({ to: "/search", search: {} as never })}
        className="flex w-full items-center gap-3 rounded-full bg-muted px-4 py-3 text-left text-sm text-muted-foreground transition hover:bg-muted/80"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground/60" />
        Search your saves...
      </button>

      {/* Categories heading */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Categories
        </h2>
        <span className="text-xs font-semibold text-primary">Edit</span>
      </div>

      {/* Category cards */}
      <div className="space-y-2.5">
        {CONTENT_CATEGORIES.map((c) => {
          const count = counts[c.key] ?? 0;
          const subs = subCounts[c.key] ?? [];
          const hasSubs = subs.length > 0;
          const isExpanded = expanded === c.key;
          const subtext =
            c.key === "all"
              ? "All your saved content"
              : `${count} save${count !== 1 ? "s" : ""}`;

          return (
            <div
              key={c.key}
              className="overflow-hidden rounded-2xl border border-border/40 bg-white shadow-sm"
            >
              {/* Main row */}
              <div className="flex items-stretch">
                {/* Primary action: navigate to category page */}
                <button
                  type="button"
                  onClick={() => goToCategory(c.key)}
                  className="flex flex-1 items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-accent/20 active:bg-accent/40"
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

                  <span className="mr-1 text-sm font-semibold tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </button>

                {/* Chevron: expand/collapse for categories that have subcategories */}
                <button
                  type="button"
                  onClick={() => {
                    if (hasSubs) {
                      setExpanded(isExpanded ? null : c.key);
                    } else {
                      goToCategory(c.key);
                    }
                  }}
                  className="flex items-center justify-center border-l border-border/20 px-4 text-muted-foreground transition hover:bg-accent/20 hover:text-foreground"
                  aria-label={hasSubs ? (isExpanded ? "Collapse" : "Expand subcategories") : "Open"}
                >
                  {hasSubs && isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Inline subcategory list — no tree lines, clean rows */}
              {isExpanded && hasSubs && (
                <div className="border-t border-border/20 bg-muted/10">
                  {subs.map(({ sub, count: sc }) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => goToSubcategory(c.key, sub)}
                      className="flex w-full items-center gap-3 border-b border-border/10 px-5 py-3 text-left transition last:border-0 hover:bg-accent/30"
                    >
                      <span className="flex-1 text-sm text-foreground/85">{sub}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{sc}</span>
                      <ChevronRight className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => goToCategory(c.key)}
                    className="w-full px-5 py-3 text-left text-sm font-semibold text-primary hover:underline"
                  >
                    View all {c.label} →
                  </button>
                </div>
              )}
            </div>
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
