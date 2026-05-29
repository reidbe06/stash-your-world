import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search as SearchIcon, SlidersHorizontal, Bookmark, X, ArrowUpDown, Trash2, Sparkles, Loader2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Search — STASHd" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    type: (s.type as string) || "all",
    q: (s.q as string) || "",
  }),
  component: SearchPage,
});

type SortKey = "newest" | "oldest" | "category";

const CATEGORY_CHIPS = [
  { key: "all", label: "All" },
  { key: "link", label: "Links" },
  { key: "recipe", label: "Recipes" },
  { key: "video", label: "Videos" },
  { key: "product", label: "Products" },
  { key: "fashion", label: "Fashion" },
  { key: "idea", label: "Ideas" },
  { key: "article", label: "Articles" },
];

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
  const { type, q: initialQ } = Route.useSearch();
  const [q, setQ] = useState(initialQ);
  const [category, setCategory] = useState(
    CATEGORY_CHIPS.some((c) => c.key === type) ? type : "all"
  );
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
        .select("*, collection:collections(id,name), embedding_updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ItemWithCollection[];
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

  // One-time backfill so older items become searchable
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

  // Debounced semantic search whenever the query changes (in AI mode)
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

  const useSemanticRanking = aiMode && q.trim().length > 0 && aiScores !== null;

  const results = useMemo(() => {
    if (!items) return [] as (ItemWithCollection & { _sim?: number })[];
    const needle = q.trim().toLowerCase();

    const passesFilters = (it: ItemWithCollection) => {
      if (category !== "all" && it.type !== category) return false;
      if (collectionFilter !== "all") {
        if (collectionFilter === "none" && it.collection_id) return false;
        if (collectionFilter !== "none" && it.collection_id !== collectionFilter) return false;
      }
      if (tagFilter !== "all" && !it.tags.includes(tagFilter)) return false;
      return true;
    };

    if (useSemanticRanking) {
      const ranked = items
        .filter(passesFilters)
        .filter((it) => aiScores!.has(it.id))
        .map((it) => ({ ...it, _sim: aiScores!.get(it.id)! }))
        .sort((a, b) => (b._sim ?? 0) - (a._sim ?? 0));
      return ranked;
    }

    const filtered = items.filter((it) => {
      if (!passesFilters(it)) return false;
      if (!needle) return true;
      return (
        it.title.toLowerCase().includes(needle) ||
        (it.description ?? "").toLowerCase().includes(needle) ||
        (it.source ?? "").toLowerCase().includes(needle) ||
        (it.url ?? "").toLowerCase().includes(needle) ||
        (it.collection?.name ?? "").toLowerCase().includes(needle) ||
        it.type.toLowerCase().includes(needle) ||
        it.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });

    const sorted = [...filtered];
    if (sort === "oldest") sorted.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    else if (sort === "category") sorted.sort((a, b) => a.type.localeCompare(b.type) || +new Date(b.created_at) - +new Date(a.created_at));
    else sorted.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return sorted;
  }, [items, q, category, collectionFilter, tagFilter, sort, useSemanticRanking, aiScores]);



  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (category !== "all") activeFilters.push({ key: "cat", label: `Category: ${category}`, clear: () => setCategory("all") });
  if (collectionFilter !== "all") {
    const name = collectionFilter === "none" ? "No collection" : collections?.find((c) => c.id === collectionFilter)?.name ?? "Collection";
    activeFilters.push({ key: "col", label: `In: ${name}`, clear: () => setCollectionFilter("all") });
  }
  if (tagFilter !== "all") activeFilters.push({ key: "tag", label: `#${tagFilter}`, clear: () => setTagFilter("all") });

  const clearAll = () => {
    setCategory("all");
    setCollectionFilter("all");
    setTagFilter("all");
    setQ("");
  };

  const sortLabel = sort === "newest" ? "Newest" : sort === "oldest" ? "Oldest" : "Category";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Search</h1>
        <p className="mt-1 text-sm text-muted-foreground">Find anything you've stashed.</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, notes, URL, tag, collection…"
            className="h-11 rounded-full border-0 bg-muted pl-11 pr-10 text-sm"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
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

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-2 pb-1">
          {CATEGORY_CHIPS.map((c) => {
            const active = c.key === category;
            return (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
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

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight">
          {q ? "Results" : "Recent"}
          <span className="ml-2 text-sm font-medium text-muted-foreground">{results.length}</span>
        </h2>
      </div>

      {results.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {results.map((it) => <ResultCard key={it.id} item={it} />)}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed bg-card/50 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {q ? `No matches for "${q}".` : "Nothing matches these filters."}
          </p>
        </div>
      )}
    </div>
  );
}

function ResultCard({ item }: { item: ItemWithCollection }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const del = async () => {
    setDeleting(true);
    const { error } = await supabase.from("items").delete().eq("id", item.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    setOpen(false);
    toast.success("Saved item deleted");
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["collection-items"] });
  };

  return (
    <div className="group relative">
      <a
        href={item.url ?? "#"}
        target={item.url ? "_blank" : undefined}
        rel="noreferrer"
        className="block"
      >
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted shadow-card">
          {item.image_url ? (
            <img src={item.image_url} alt={item.title} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-brand-gradient/10">
              <Bookmark className="h-10 w-10 text-primary/40" />
            </div>
          )}
          <span className="absolute left-2 top-2 rounded-full bg-card/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary backdrop-blur">
            {item.type}
          </span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{item.title}</h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {item.source ?? "Saved"} · {timeAgo(item.created_at)}
          {item.collection?.name && ` · ${item.collection.name}`}
        </p>
      </a>

      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className="absolute right-2 top-2 rounded-full bg-card/95 p-1.5 text-muted-foreground shadow-sm backdrop-blur transition hover:bg-destructive hover:text-destructive-foreground"
        aria-label="Delete saved item"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this saved item?</AlertDialogTitle>
            <AlertDialogDescription>
              "{item.title}" will be permanently removed from your library and any collection it belongs to. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); del(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
