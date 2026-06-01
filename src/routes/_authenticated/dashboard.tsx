import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell, Bookmark, Shirt, Home as HomeIcon, Sparkles, Dumbbell, Plane, Laptop,
  UtensilsCrossed, ShoppingBag, Briefcase, Heart, ChevronDown, ChevronRight,
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
  { key: "all",           label: "All Saves",    icon: Bookmark,       tint: "bg-rose-100",    fg: "text-rose-600",    match: () => true },
  { key: "Recipe",        label: "Recipes",      icon: UtensilsCrossed,tint: "bg-orange-100",  fg: "text-orange-600",  match: (it) => it.type === "Recipe" },
  { key: "Fashion",       label: "Fashion",      icon: Shirt,          tint: "bg-violet-100",  fg: "text-violet-600",  match: (it) => it.type === "Fashion" },
  { key: "Product",       label: "Products",     icon: ShoppingBag,    tint: "bg-blue-100",    fg: "text-blue-600",    match: (it) => it.type === "Product" },
  { key: "Home",          label: "Home & Decor", icon: HomeIcon,       tint: "bg-amber-100",   fg: "text-amber-700",   match: (it) => it.type === "Home" },
  { key: "Beauty",        label: "Beauty",       icon: Sparkles,       tint: "bg-pink-100",    fg: "text-pink-600",    match: (it) => it.type === "Beauty" },
  { key: "Fitness",       label: "Fitness",      icon: Dumbbell,       tint: "bg-sky-100",     fg: "text-sky-600",     match: (it) => it.type === "Fitness" },
  { key: "Travel",        label: "Travel",       icon: Plane,          tint: "bg-emerald-100", fg: "text-emerald-600", match: (it) => it.type === "Travel" },
  { key: "Tutorial",      label: "Tutorials",    icon: Laptop,         tint: "bg-indigo-100",  fg: "text-indigo-600",  match: (it) => it.type === "Tutorial" },
  { key: "Business",      label: "Business",     icon: Briefcase,      tint: "bg-stone-100",   fg: "text-stone-600",   match: (it) => it.type === "Business" },
  { key: "Parenting",     label: "Parenting",    icon: Heart,          tint: "bg-red-100",     fg: "text-red-500",     match: (it) => it.type === "Parenting" },
];

function Library() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: items } = useQuery({
    queryKey: ["items", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of CONTENT_CATEGORIES) map[c.key] = items ? items.filter(c.match).length : 0;
    return map;
  }, [items]);

  const subCounts = useMemo(() => {
    const map: Record<string, { sub: string; count: number }[]> = {};
    for (const c of CONTENT_CATEGORIES) {
      if (c.key === "all") continue;
      const catItems = items?.filter(c.match) ?? [];
      const bySub: Record<string, number> = {};
      catItems.forEach((it) => {
        const sub = (it as any).subcategory;
        if (sub) bySub[sub] = (bySub[sub] || 0) + 1;
      });
      map[c.key] = Object.entries(bySub)
        .sort((a, b) => b[1] - a[1])
        .map(([sub, count]) => ({ sub, count }));
    }
    return map;
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">My Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">Everything you've stashed, organized.</p>
        </div>
        <button className="relative rounded-full p-2 text-muted-foreground hover:text-foreground" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Categories</h2>
        <Link to="/search" className="text-xs font-semibold text-primary hover:underline">See all</Link>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        {CONTENT_CATEGORIES.map((c, i) => {
          const isExpanded = expanded === c.key;
          const subs = subCounts[c.key] ?? [];
          const hasSubs = subs.length > 0;
          const count = counts[c.key] ?? 0;
          const isLast = i === CONTENT_CATEGORIES.length - 1;

          return (
            <div key={c.key} className={!isLast ? "border-b" : ""}>
              <button
                onClick={() => {
                  if (c.key === "all") {
                    navigate({ to: "/search", search: {} as never });
                  } else if (hasSubs) {
                    setExpanded(isExpanded ? null : c.key);
                  } else {
                    navigate({ to: "/search", search: { type: c.key } as never });
                  }
                }}
                className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-accent/40"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.tint} ${c.fg}`}>
                  <c.icon className="h-5 w-5" />
                </span>
                <span className="flex-1 text-sm font-semibold">{c.label}</span>
                <span className="mr-1 text-sm font-medium tabular-nums text-muted-foreground">
                  {count.toLocaleString()}
                </span>
                {c.key !== "all" && count > 0 && (
                  isExpanded
                    ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>

              {isExpanded && hasSubs && (
                <div className="border-t bg-muted/40">
                  {subs.map(({ sub, count: sc }) => (
                    <button
                      key={sub}
                      onClick={() => navigate({ to: "/search", search: { type: c.key, sub } as never })}
                      className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition hover:bg-accent/50"
                    >
                      <span className="text-xs text-muted-foreground">└─</span>
                      <span className="flex-1 text-sm text-foreground">{sub}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{sc}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => navigate({ to: "/search", search: { type: c.key } as never })}
                    className="flex w-full items-center gap-3 px-5 py-2 text-left text-xs font-semibold text-primary hover:underline"
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
