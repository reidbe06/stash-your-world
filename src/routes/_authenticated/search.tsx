import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search as SearchIcon, SlidersHorizontal, Bookmark, X, ArrowUpDown, Sparkles, Loader2, ChevronLeft, ChevronRight, UtensilsCrossed } from "lucide-react";
import { ItemImage } from "@/components/ItemImage";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Item } from "@/components/ItemCard";
import { Input } from "@/components/ui/input";
import { semanticSearchItems, backfillUserEmbeddings } from "@/lib/semantic-search.functions";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Search — STASHd" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    type: (s.type as string) || "all",
    q: (s.q as string) || "",
    sub: (s.sub as string) || "",
  }),
  component: SearchPage,
});

type SortKey = "newest" | "oldest" | "category";

const SYSTEM_CHIPS = [
  { key: "all",          label: "All" },
  { key: "Recipe",       label: "Recipes" },
  { key: "Product",      label: "Products" },
  { key: "Fashion",      label: "Fashion" },
  { key: "Home",         label: "Home" },
  { key: "Travel",       label: "Travel" },
  { key: "Tutorial",     label: "Tutorials" },
  { key: "Fitness",      label: "Fitness" },
  { key: "Beauty",       label: "Beauty" },
  { key: "Business",     label: "Business" },
  { key: "Parenting",    label: "Parenting" },
  { key: "Entertainment",label: "Entertainment" },
  { key: "Other",        label: "Other" },
];

// Keep old name as alias so existing refs to categoryLabel still work
const CATEGORY_CHIPS = SYSTEM_CHIPS;

type ItemWithCollection = Item & { collection?: { id: string; name: string } | null };

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
  const navigate = useNavigate();
  const { type, q: initialQ, sub: initialSub } = Route.useSearch();
  const [q, setQ] = useState(initialQ);
  const [category, setCategory] = useState(
    CATEGORY_CHIPS.some((c) => c.key === type) ? type : "all"
  );
  const [subcategory, setSubcategory] = useState(initialSub || "");
  const [showAllForCategory, setShowAllForCategory] = useState(false);

  // Sync URL search params → local state when navigating to this page
  // (TanStack Router doesn't remount the component on same-route navigation)
  // Accept any non-empty type value — system types, user category names, and "all".
  useEffect(() => {
    setCategory(type || "all");
  }, [type]);

  useEffect(() => {
    setSubcategory(initialSub || "");
  }, [initialSub]);

  const [collectionFilter, setCollectionFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [aiMode, setAiMode] = useState(true);
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiScores, setAiScores] = useState<Map<string, number> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSemantic = useServerFn(semanticSearchItems);
  const runBackfill = useServerFn(backfillUserEmbeddings);

  const { data: items } = useQuery({
    queryKey: ["items", user?.id, "with-collection"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*, collection:collections(id,name), item_collections(collection_id, collections(id,name))")
        .order("created_at", { ascending: false });
      if (error?.message?.includes("item_collections")) {
        const { data: fb, error: fbErr } = await supabase
          .from("items")
          .select("*, collection:collections(id,name)")
          .order("created_at", { ascending: false });
        if (fbErr) throw fbErr;
        return (fb ?? []) as ItemWithCollection[];
      }
      if (error) throw error;
      return (data ?? []) as ItemWithCollection[];
    },
  });

  const { data: collections } = useQuery({
    queryKey: ["collections", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("collections").select("id,name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: userCats = [] } = useQuery<{ id: string; name: string; emoji: string }[]>({
    queryKey: ["user-categories", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_categories")
        .select("id,name,emoji")
        .order("created_at", { ascending: true });
      return (data ?? []) as { id: string; name: string; emoji: string }[];
    },
  });

  // Full chip list: system chips + user-created category chips
  const allChips = useMemo(
    () => [
      ...SYSTEM_CHIPS,
      ...userCats.map((c) => ({ key: c.name, label: `${c.emoji} ${c.name}` })),
    ],
    [userCats],
  );

  const backfilledRef = useRef(false);
  useEffect(() => {
    if (!items || backfilledRef.current) return;
    const missing = items.filter((it: any) => !it.embedding_updated_at);
    if (missing.length === 0) return;
    backfilledRef.current = true;
    runBackfill({ data: { limit: 20 } }).catch((err: unknown) =>
      console.warn("Backfill failed", err),
    );
  }, [items, runBackfill]);

  // NOTE: Do NOT reset subcategory in a useEffect on category change.
  // When navigating from /category/Fashion → /search?type=Fashion&sub=Dresses,
  // both type and sub arrive together. A category-change effect would wipe
  // the subcategory before it renders. Subcategory is reset explicitly in
  // the chip onClick handler below instead.

  // Debounced semantic search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const text = q.trim();
    if (!aiMode || !text) {
      setAiScores(null);
      setAiQuery("");
      setAiLoading(false);
      return;
    }
    setAiLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { matches } = await runSemantic({ data: { query: text, limit: 40 } });
        const map = new Map<string, number>();
        matches.forEach((m) => map.set(m.id, m.similarity));
        setAiScores(map);
        setAiQuery(text);
      } catch (err: any) {
        console.warn("Semantic search failed", err);
        toast.error(err.message || "Semantic search failed");
        setAiScores(null);
      } finally {
        setAiLoading(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, aiMode, runSemantic]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    items?.forEach((it) => it.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort().slice(0, 24);
  }, [items]);

  // Dynamic subcategory chips for selected type.
  // Uses effective category (user_category if overridden, else type) so moved
  // saves are counted under their new home, not their old AI category.
  const availableSubcats = useMemo(() => {
    if (category === "all") return [];
    const counts = new Map<string, number>();
    items?.forEach((it) => {
      const eff = (it as any).user_override && (it as any).user_category
        ? (it as any).user_category
        : it.type;
      if (eff !== category) return;
      // Effective sub: user_folder for moved items, AI sub for native items
      const sub = (it as any).user_override
        ? ((it as any).user_folder ?? it.subcategory ?? it.ai_subcategory ?? null)
        : (it.subcategory ?? it.ai_subcategory ?? null);
      if (sub) counts.set(sub, (counts.get(sub) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([sub, count]) => ({ sub, count }));
  }, [items, category]);

  const useSemanticRanking = aiMode && q.trim().length > 0 && aiScores !== null;

  const results = useMemo(() => {
    if (!items) return [] as (ItemWithCollection & { _sim?: number })[];
    const needle = q.trim().toLowerCase();

    // Effective category/subcategory for a save:
    // If user moved it (user_override=true), honour user_category/user_folder;
    // otherwise fall back to the AI-assigned type/subcategory.
    const effectiveCat = (it: ItemWithCollection) =>
      (it as any).user_override && (it as any).user_category
        ? (it as any).user_category
        : it.type;

    const effectiveSub = (it: ItemWithCollection) =>
      (it as any).user_override
        ? ((it as any).user_folder ?? it.subcategory ?? it.ai_subcategory ?? null)
        : (it.subcategory ?? it.ai_subcategory ?? null);

    // Category / collection / tag gates
    const passesFilters = (it: ItemWithCollection) => {
      if (category !== "all" && effectiveCat(it) !== category) return false;
      if (subcategory && effectiveSub(it) !== subcategory) return false;
      if (collectionFilter !== "all") {
        if (collectionFilter === "none" && it.collection_id) return false;
        if (collectionFilter !== "none" && it.collection_id !== collectionFilter) return false;
      }
      if (tagFilter !== "all" && !it.tags.includes(tagFilter)) return false;
      return true;
    };

    // Keyword match — the required first gate for EVERY search.
    // Checks all user-visible text fields so e.g. "pasta" won't show
    // a sunset photo even if the semantic score is high.
    const passesKeyword = (it: ItemWithCollection): boolean => {
      if (!needle) return true;
      const hay = [
        it.title,
        it.description,
        (it as any).ai_summary,
        it.source,
        it.url,
        it.collection?.name,
        it.type,
        it.subcategory,
        it.ai_subcategory,
        (it as any).transcript,
        ...(it.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    };

    if (useSemanticRanking) {
      // Keyword match is REQUIRED — semantic scores only reorder matches,
      // they never expand the result set to unrelated saves.
      const keywordMatched = items
        .filter(passesFilters)
        .filter(passesKeyword);

      return keywordMatched
        .map((it) => ({ ...it, _sim: aiScores!.get(it.id) ?? -1 }))
        .sort((a, b) => {
          // Items returned by semantic search are ranked by similarity;
          // items not in the semantic result set fall back to newest-first.
          const aHas = a._sim >= 0;
          const bHas = b._sim >= 0;
          if (aHas && bHas) return b._sim - a._sim;
          if (aHas) return -1;
          if (bHas) return 1;
          return +new Date(b.created_at) - +new Date(a.created_at);
        });
    }

    const filtered = items.filter((it) => passesFilters(it) && passesKeyword(it));

    const sorted = [...filtered];
    if (sort === "oldest") sorted.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    else if (sort === "category") sorted.sort((a, b) => a.type.localeCompare(b.type) || +new Date(b.created_at) - +new Date(a.created_at));
    else sorted.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return sorted;
  }, [items, q, category, subcategory, collectionFilter, tagFilter, sort, useSemanticRanking, aiScores]);

  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (category !== "all") activeFilters.push({ key: "cat", label: `Type: ${category}`, clear: () => setCategory("all") });
  if (subcategory) activeFilters.push({ key: "sub", label: subcategory, clear: () => setSubcategory("") });
  if (collectionFilter !== "all") {
    const name = collectionFilter === "none" ? "No collection" : collections?.find((c) => c.id === collectionFilter)?.name ?? "Collection";
    activeFilters.push({ key: "col", label: `In: ${name}`, clear: () => setCollectionFilter("all") });
  }
  if (tagFilter !== "all") activeFilters.push({ key: "tag", label: `#${tagFilter}`, clear: () => setTagFilter("all") });

  const clearAll = () => {
    setCategory("all");
    setSubcategory("");
    setCollectionFilter("all");
    setTagFilter("all");
    setQ("");
  };

  const sortLabel = sort === "newest" ? "Newest" : sort === "oldest" ? "Oldest" : "Category";

  const categoryLabel = allChips.find((c) => c.key === category)?.label ?? category;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          {subcategory ? (
            <>
              <div className="mb-1 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    navigate({ to: "/search", search: { type: category } as never })
                  }
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {categoryLabel}
                </button>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">{subcategory}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {results.length} save{results.length !== 1 ? "s" : ""}
              </p>
            </>
          ) : category !== "all" ? (
            <>
              <div className="mb-1 flex items-center gap-1.5">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Library
                </Link>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">{categoryLabel}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {results.length} save{results.length !== 1 ? "s" : ""}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-extrabold tracking-tight">Search</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {aiMode ? "Ask in plain English — AI finds what you mean." : "Find anything you've stashed."}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setAiMode((v) => !v)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
            aiMode
              ? "bg-brand-gradient text-primary-foreground shadow-brand"
              : "border bg-card text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={aiMode}
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI search {aiMode ? "on" : "off"}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={aiMode ? "Try: chicken dinners, pink dresses, Mexico trip ideas…" : "Search title, notes, URL, tag, collection…"}
            className="h-11 rounded-full border-0 bg-muted pl-11 pr-10 text-sm"
          />
          {aiLoading ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : q ? (
            <button
              onClick={() => setQ("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-muted px-4 text-sm font-semibold text-foreground hover:bg-accent">
            <ArrowUpDown className="h-4 w-4" />
            <span className="hidden sm:inline">{sortLabel}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <DropdownMenuRadioItem value="newest">Newest</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="oldest">Oldest</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="category">Category</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground",
              activeFilters.length > 0 ? "bg-accent text-primary" : "bg-muted"
            )}
            aria-label="Filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Collection</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={collectionFilter} onValueChange={setCollectionFilter}>
              <DropdownMenuRadioItem value="all">All collections</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="none">No collection</DropdownMenuRadioItem>
              {collections?.map((c) => (
                <DropdownMenuRadioItem key={c.id} value={c.id}>{c.name}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {allTags.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Tag</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={tagFilter} onValueChange={setTagFilter}>
                  <DropdownMenuRadioItem value="all">All tags</DropdownMenuRadioItem>
                  {allTags.map((t) => (
                    <DropdownMenuRadioItem key={t} value={t}>#{t}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Level 1: Content type chips (system + user-created) */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-2 pb-1">
          {allChips.map((c) => {
            const active = c.key === category;
            return (
              <button
                key={c.key}
                onClick={() => { setCategory(c.key); setSubcategory(""); setShowAllForCategory(false); }}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition",
                  active
                    ? "border-transparent bg-brand-gradient text-primary-foreground shadow-brand"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Level 2: Subcategory chips (dynamic, shown when a type is selected) */}
      {category !== "all" && availableSubcats.length > 0 && (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1.5 pb-1">
            <button
              onClick={() => setSubcategory("")}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition",
                !subcategory
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              All
            </button>
            {availableSubcats.map(({ sub, count }) => (
              <button
                key={sub}
                onClick={() => setSubcategory(sub === subcategory ? "" : sub)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition",
                  subcategory === sub
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {sub}
                <span className="ml-1 text-[10px] opacity-60">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((f) => (
            <button
              key={f.key}
              onClick={f.clear}
              className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground"
            >
              {f.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button onClick={clearAll} className="text-xs font-semibold text-primary hover:underline">
            Clear all
          </button>
        </div>
      )}

      {/* Recipes subcategory selection — shown when Recipes is selected but no subcategory picked yet */}
      {category === "Recipe" && !subcategory && !showAllForCategory && availableSubcats.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Subcategories
          </h2>
          <div className="space-y-2.5">
            {availableSubcats.map(({ sub, count: sc }, i) => {
              const palettes = [
                "bg-orange-100 text-orange-500",
                "bg-amber-100 text-amber-600",
                "bg-rose-100 text-rose-500",
                "bg-pink-100 text-pink-500",
                "bg-yellow-100 text-yellow-600",
                "bg-red-100 text-red-400",
              ];
              const palette = palettes[i % palettes.length];
              return (
                <button
                  key={sub}
                  onClick={() =>
                    navigate({ to: "/search", search: { type: category, sub } as never })
                  }
                  className="flex w-full items-center gap-3.5 rounded-2xl border border-border/40 bg-white px-4 py-3.5 text-left shadow-sm transition hover:shadow-md active:scale-[0.985]"
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${palette}`}>
                    <UtensilsCrossed className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-bold text-foreground">{sub}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold tabular-nums text-muted-foreground">{sc}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setShowAllForCategory(true)}
            className="text-sm font-semibold text-primary hover:underline"
          >
            View all Recipes →
          </button>
        </div>
      )}

      {/* Results — hidden while subcategory selection is shown for Recipes */}
      {!(category === "Recipe" && !subcategory && !showAllForCategory && availableSubcats.length > 0) && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight">
              {useSemanticRanking ? (
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Smart results
                </span>
              ) : q ? "Results" : "Recent"}
              <span className="ml-2 text-sm font-medium text-muted-foreground">{results.length}</span>
            </h2>
            {useSemanticRanking && aiQuery && (
              <span className="text-xs text-muted-foreground">Sorted by relevance to "{aiQuery}"</span>
            )}
          </div>

          {results.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {results.map((it) => <ResultCard key={it.id} item={it} similarity={(it as any)._sim} />)}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed bg-card/50 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {aiLoading
                  ? "Searching…"
                  : q
                    ? `No saves found for "${q}".`
                    : "Nothing matches these filters."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResultCard({ item, similarity }: { item: ItemWithCollection; similarity?: number }) {
  const navigate = useNavigate();

  const badgeLabel = (item as any).subcategory
    ? `${item.type} › ${(item as any).subcategory}`
    : item.type;

  return (
    <div
      className="group cursor-pointer"
      onClick={() => navigate({ to: "/item/$id", params: { id: item.id } })}
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted shadow-card">
        <ItemImage
          src={item.image_url}
          alt={item.title}
          url={item.url}
          source={item.source}
          imgClassName="h-full w-full object-cover transition group-hover:scale-105"
        />
        <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-card/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary backdrop-blur">
          {badgeLabel}
        </span>
        {typeof similarity === "number" && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-brand-gradient px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-brand">
            <Sparkles className="h-2.5 w-2.5" />
            {Math.round(similarity * 100)}% match
          </span>
        )}
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{item.title}</h3>
      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
        {item.source ?? "Saved"} · {timeAgo(item.created_at)}
      </p>
    </div>
  );
}
