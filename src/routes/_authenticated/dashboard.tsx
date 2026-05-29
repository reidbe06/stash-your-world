import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Bookmark, Shirt, Home as HomeIcon, Sparkles, Dumbbell, Plane, Laptop, UtensilsCrossed } from "lucide-react";
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

const CATEGORIES: Category[] = [
  { key: "all", label: "All Saves", icon: Bookmark, tint: "bg-rose-100", fg: "text-rose-600", match: () => true },
  { key: "recipe", label: "Recipes", icon: UtensilsCrossed, tint: "bg-orange-100", fg: "text-orange-600", match: (it) => it.type === "recipe" },
  { key: "fashion", label: "Fashion", icon: Shirt, tint: "bg-violet-100", fg: "text-violet-600", match: (it) => it.type === "fashion" },
  { key: "home", label: "Home & Decor", icon: HomeIcon, tint: "bg-amber-100", fg: "text-amber-700", match: (it) => it.tags.some((t) => /home|decor|interior/i.test(t)) },
  { key: "beauty", label: "Beauty", icon: Sparkles, tint: "bg-pink-100", fg: "text-pink-600", match: (it) => it.tags.some((t) => /beauty|makeup|skincare/i.test(t)) },
  { key: "workouts", label: "Workouts", icon: Dumbbell, tint: "bg-sky-100", fg: "text-sky-600", match: (it) => it.tags.some((t) => /workout|fitness|gym/i.test(t)) },
  { key: "travel", label: "Travel", icon: Plane, tint: "bg-emerald-100", fg: "text-emerald-600", match: (it) => it.tags.some((t) => /travel|trip|vacation/i.test(t)) },
  { key: "tech", label: "Tech", icon: Laptop, tint: "bg-indigo-100", fg: "text-indigo-600", match: (it) => it.tags.some((t) => /tech|gadget|app/i.test(t)) },
];

function Library() {
  const { user } = useAuth();
  const navigate = useNavigate();

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
    for (const c of CATEGORIES) map[c.key] = items ? items.filter(c.match).length : 0;
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
        {CATEGORIES.map((c, i) => (
          <button
            key={c.key}
            onClick={() => navigate({ to: "/search", search: { type: c.key === "all" ? undefined : c.key } as never })}
            className={`flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-accent/40 ${i < CATEGORIES.length - 1 ? "border-b" : ""}`}
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.tint} ${c.fg}`}>
              <c.icon className="h-5 w-5" />
            </span>
            <span className="flex-1 text-sm font-semibold">{c.label}</span>
            <span className="text-sm font-medium tabular-nums text-muted-foreground">
              {counts[c.key]?.toLocaleString() ?? 0}
            </span>
          </button>
        ))}
      </div>

      <Link
        to="/save"
        className="block w-full rounded-full bg-brand-gradient py-3.5 text-center text-sm font-semibold text-primary-foreground shadow-brand"
      >
        + Save New
      </Link>
    </div>
  );
}
