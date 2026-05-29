import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Bookmark, Plus, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ItemCard, type Item } from "@/components/ItemCard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "My Library — STASHd" }] }),
  component: Library,
});

type Filter = {
  key: string;
  label: string;
  match: (it: Item) => boolean;
};

const tagMatch = (re: RegExp) => (it: Item) =>
  it.tags.some((t) => re.test(t)) || re.test(it.title) || (it.description ? re.test(it.description) : false);

const FILTERS: Filter[] = [
  { key: "all", label: "All", match: () => true },
  { key: "product", label: "Products", match: (it) => it.type === "product" },
  { key: "recipe", label: "Recipes", match: (it) => it.type === "recipe" },
  { key: "video", label: "Videos", match: (it) => it.type === "video" },
  { key: "idea", label: "Ideas", match: (it) => it.type === "idea" },
  { key: "fashion", label: "Fashion", match: (it) => it.type === "fashion" },
  { key: "home", label: "Home", match: tagMatch(/home|decor|interior|furniture/i) },
  { key: "travel", label: "Travel", match: tagMatch(/travel|trip|vacation|destination/i) },
  { key: "other", label: "Other", match: (it) => !["product", "recipe", "video", "idea", "fashion"].includes(it.type) },
];

function Library() {
  const { user } = useAuth();
  const [active, setActive] = useState<string>("all");

  const { data: items, isLoading } = useQuery({
    queryKey: ["items", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*, collection:collections(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of FILTERS) map[f.key] = items ? items.filter(f.match).length : 0;
    return map;
  }, [items]);

  const visible = useMemo(() => {
    if (!items) return [];
    const f = FILTERS.find((x) => x.key === active) ?? FILTERS[0];
    return items.filter(f.match);
  }, [items, active]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">My Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items?.length ?? 0} {items?.length === 1 ? "save" : "saves"} · everything you've stashed.
          </p>
        </div>
        <button className="relative rounded-full p-2 text-muted-foreground hover:text-foreground" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
        </button>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-2 pb-1">
          {FILTERS.map((f) => {
            const isActive = f.key === active;
            return (
              <button
                key={f.key}
                onClick={() => setActive(f.key)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition",
                  isActive
                    ? "border-transparent bg-brand-gradient text-primary-foreground shadow-brand"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                    isActive ? "bg-white/25 text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  {counts[f.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed bg-card/50 px-6 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-primary-foreground shadow-brand">
            {active === "all" ? <Bookmark className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
          </div>
          <h3 className="mt-4 text-lg font-bold">
            {active === "all" ? "Your stash is empty" : "Nothing here yet"}
          </h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {active === "all"
              ? "Save your first link, recipe, or idea — find it later in seconds."
              : "Save something in this category to see it here."}
          </p>
          <Link
            to="/save"
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-brand"
          >
            <Plus className="h-4 w-4" /> Save something
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {visible.map((it) => (
            <ItemCard key={it.id} item={it} />
          ))}
        </div>
      )}

      <Link
        to="/save"
        className="block w-full rounded-full bg-brand-gradient py-3.5 text-center text-sm font-semibold text-primary-foreground shadow-brand"
      >
        + Save New
      </Link>
    </div>
  );
}
