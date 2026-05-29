import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, SlidersHorizontal, Bookmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Item } from "@/components/ItemCard";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Search — STASHd" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ type: (s.type as string) || "all" }),
  component: SearchPage,
});

const TABS = [
  { key: "all", label: "All" },
  { key: "recipe", label: "Recipes" },
  { key: "workouts", label: "Workouts" },
  { key: "product", label: "Products" },
  { key: "more", label: "More" },
];

function matchesTab(it: Item, tab: string) {
  if (tab === "all") return true;
  if (tab === "workouts") return it.tags.some((t) => /workout|fitness|gym/i.test(t));
  if (tab === "more") return !["recipe", "product"].includes(it.type);
  return it.type === tab;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return "today";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function SearchPage() {
  const { user } = useAuth();
  const { type } = Route.useSearch();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState(TABS.some((t) => t.key === type) ? type : "all");

  const { data: items } = useQuery({
    queryKey: ["items", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  const results = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (!matchesTab(it, tab)) return false;
      if (!needle) return true;
      return (
        it.title.toLowerCase().includes(needle) ||
        (it.description ?? "").toLowerCase().includes(needle) ||
        (it.source ?? "").toLowerCase().includes(needle) ||
        it.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
  }, [items, q, tab]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your stash…"
            className="h-11 rounded-full border-0 bg-muted pl-11 text-sm"
          />
        </div>
        <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-label="Filters">
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-5 overflow-x-auto border-b text-sm font-medium">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative whitespace-nowrap pb-3 pt-1 transition",
              tab === t.key ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {tab === t.key && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand-gradient" />}
          </button>
        ))}
      </div>

      <h2 className="text-lg font-bold tracking-tight">Top Results</h2>

      {results.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {results.map((it) => <ResultCard key={it.id} item={it} />)}
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">No matches yet.</p>
      )}
    </div>
  );
}

function ResultCard({ item }: { item: Item }) {
  return (
    <a
      href={item.url ?? "#"}
      target={item.url ? "_blank" : undefined}
      rel="noreferrer"
      className="group block"
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted shadow-card">
        {item.image_url ? (
          <img src={item.image_url} alt={item.title} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-brand-gradient/10">
            <Bookmark className="h-10 w-10 text-primary/40" />
          </div>
        )}
        <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-card/95 text-primary shadow-sm backdrop-blur">
          <Bookmark className="h-4 w-4 fill-current" />
        </span>
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{item.title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {item.source ?? "Saved"} · {timeAgo(item.created_at)}
      </p>
    </a>
  );
}
