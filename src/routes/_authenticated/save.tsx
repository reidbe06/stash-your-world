import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Link2, UtensilsCrossed, Video, ShoppingBag, Shirt, Lightbulb, FileText, Bookmark, ImageIcon, Loader2, Sparkles, Wand2, Plus, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchUrlMetadata } from "@/lib/url-metadata.functions";
import { categorizeItem, CATEGORIES } from "@/lib/ai-categorize.functions";
import { embedItem } from "@/lib/semantic-search.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/save")({
  head: () => ({ meta: [{ title: "Save new — STASHd" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ collection: (s.collection as string) || "" }),
  component: SavePage,
});

const schema = z.object({
  url: z.string().trim().min(1, "URL is required").url("Enter a valid URL").max(2000),
  title: z.string().trim().max(200).optional(),
  image_url: z.string().trim().max(2000).optional().or(z.literal("")),
  description: z.string().max(1000).optional(),
  type: z.string().max(40),
  tags: z.string().max(300).optional(),
  collection_id: z.string().optional(),
  category: z.string().max(80).optional(),
  subcategory: z.string().max(200).optional(),
  ai_summary: z.string().max(500).optional(),
  suggested_collection: z.string().max(80).optional(),
});

const TYPES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "link", label: "Link", icon: Link2 },
  { key: "recipe", label: "Recipe", icon: UtensilsCrossed },
  { key: "video", label: "Video", icon: Video },
  { key: "product", label: "Product", icon: ShoppingBag },
  { key: "fashion", label: "Fashion", icon: Shirt },
  { key: "idea", label: "Idea", icon: Lightbulb },
  { key: "article", label: "Article", icon: FileText },
];

const HELP_OPTIONS = [
  "Recipe",
  "Outfit",
  "Product",
  "Travel idea",
  "Home idea",
  "Workout",
  "Beauty",
  "Business idea",
  "Parenting",
  "Other",
];

function getPlatform(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("tiktok.com")) return "TikTok";
    if (host.includes("instagram.com")) return "Instagram";
    return host;
  } catch { return ""; }
}

function isSocialVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return host.includes("tiktok.com") || host.includes("instagram.com") || /\/(reel|reels)\//i.test(parsed.pathname);
  } catch { return false; }
}

function hasUsefulSocialMetadata(f: { title: string; description: string; image_url: string; url: string }) {
  const platform = getPlatform(f.url).toLowerCase();
  const title = f.title.trim().toLowerCase();
  return !!(
    f.description.trim().length >= 8 ||
    (title.length >= 8 && platform && !title.includes(platform.toLowerCase())) ||
    (f.image_url && !f.image_url.includes("google.com/s2/favicons"))
  );
}

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

function SavePage() {
  const { user } = useAuth();
  const { collection } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchMeta = useServerFn(fetchUrlMetadata);
  const runCategorize = useServerFn(categorizeItem);
  const embedItemFn = useServerFn(embedItem);

  const [form, setForm] = useState({
    title: "",
    url: "",
    image_url: "",
    description: "",
    type: "link",
    tags: "",
    collection_id: collection,
    category: "",
    subcategory: "",
    ai_summary: "",
    suggested_collection: "",
  });
  const [help, setHelp] = useState({ contextType: "", note: "" });
  const [saveStatus, setSaveStatus] = useState<"idle" | "organized" | "needs_info" | "uncategorized">("idle");
  const [suggestedCollections, setSuggestedCollections] = useState<string[]>([]);
  const [acceptingCollection, setAcceptingCollection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [aiLoaded, setAiLoaded] = useState(false);
  const lastFetchedUrl = useRef<string>("");
  const lastAiKey = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setForm((f) => ({ ...f, collection_id: collection })); }, [collection]);

  const { data: collections } = useQuery({
    queryKey: ["collections", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("collections").select("id,name").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const runMetaFetch = async (url: string) => {
    if (!isValidUrl(url) || url === lastFetchedUrl.current) return;
    lastFetchedUrl.current = url;
    setFetching(true);
    try {
      const meta = await fetchMeta({ data: { url } });
      setForm((f) => ({
        ...f,
        title: f.title || meta.title || "",
        image_url: f.image_url || meta.image || "",
        description: f.description || meta.description || "",
        type: f.type === "link" && meta.type ? meta.type : f.type,
      }));
      setMetaLoaded(true);
      if (isSocialVideoUrl(url) && !hasUsefulSocialMetadata({
        title: meta.title || "",
        description: meta.description || "",
        image_url: meta.image || "",
        url,
      })) {
        setSaveStatus("needs_info");
      }
    } catch (err: any) {
      console.warn("Metadata fetch failed", err);
      if (isSocialVideoUrl(url)) setSaveStatus("needs_info");
    } finally {
      setFetching(false);
    }
  };

  const runAi = async (override?: Partial<typeof form>) => {
    const f = { ...form, ...(override || {}) };
    const url = f.url.trim();
    if (!isValidUrl(url)) return;
    let source = "";
    try { source = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    const key = JSON.stringify([url, f.title, f.description, help.contextType, help.note]);
    if (key === lastAiKey.current) return;
    lastAiKey.current = key;
    setCategorizing(true);
    try {
      const ai = await runCategorize({
        data: {
          url,
          title: f.title || "",
          description: f.description || "",
          notes: help.note,
          contextType: help.contextType,
          source,
          existingCollections: (collections || []).map((c) => c.name),
        },
      });
      setForm((cur) => ({
        ...cur,
        title: cur.title || ai.generated_title || "",
        category: cur.category || ai.category,
        subcategory: cur.subcategory || ai.subcategory,
        ai_summary: cur.ai_summary || ai.summary,
        description: cur.description || ai.notes || ai.summary || "",
        suggested_collection: cur.suggested_collection || ai.suggested_collection,
        tags: cur.tags?.trim() ? cur.tags : ai.tags.join(", "),
      }));
      setSuggestedCollections(ai.suggested_collections?.length ? ai.suggested_collections : (ai.suggested_collection ? [ai.suggested_collection] : []));
      setAiLoaded(true);
      const needsHelp = isSocialVideoUrl(url) && !hasUsefulSocialMetadata(f) && !help.contextType && !help.note;
      setSaveStatus(needsHelp ? "needs_info" : ai.category === "Uncategorized" ? "uncategorized" : "organized");
    } catch (err: any) {
      console.warn("AI categorize failed", err);
      setForm((cur) => ({ ...cur, category: cur.category || "Uncategorized" }));
      setSaveStatus("uncategorized");
      toast.error(err.message || "AI suggestion failed");
    } finally {
      setCategorizing(false);
    }
  };

  // Debounced auto-fetch when URL changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const url = form.url.trim();
    if (!url) { setMetaLoaded(false); lastFetchedUrl.current = ""; setSaveStatus("idle"); return; }
    if (!isValidUrl(url)) return;
    if (url === lastFetchedUrl.current) return;
    debounceRef.current = setTimeout(() => { runMetaFetch(url); }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.url]);

  // Auto-run AI shortly after metadata fills in (or URL alone is valid)
  useEffect(() => {
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    if (!isValidUrl(form.url)) return;
    aiDebounceRef.current = setTimeout(() => { runAi(); }, 1200);
    return () => { if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.url, form.title, form.description, help.contextType, help.note]);

  const acceptCollection = async (rawName: string) => {
    const name = rawName.trim();
    if (!name || !user) return;
    setAcceptingCollection(name);
    try {
      const existing = collections?.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        setForm((f) => ({ ...f, collection_id: existing.id }));
        toast.success(`Added to "${existing.name}"`);
        return;
      }
      const { data, error } = await supabase
        .from("collections")
        .insert({ user_id: user.id, name })
        .select("id,name")
        .single();
      if (error) { toast.error(error.message); return; }
      qc.invalidateQueries({ queryKey: ["collections"] });
      setForm((f) => ({ ...f, collection_id: data.id }));
      toast.success(`Created "${data.name}" and added`);
    } finally {
      setAcceptingCollection(null);
    }
  };


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!user) return;
    setBusy(true);
    try {
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20);
      let source: string | null = null;
      try { source = new URL(form.url).hostname.replace(/^www\./, ""); } catch {}
      const fallbackTitle = source ?? "Saved link";
      const { data: inserted, error } = await supabase.from("items").insert({
        user_id: user.id,
        title: form.title.trim() || fallbackTitle,
        url: form.url,
        image_url: form.image_url || null,
        description: form.description || null,
        type: form.type,
        tags,
        source,
        collection_id: form.collection_id || null,
        category: form.category || null,
        subcategory: form.subcategory || null,
        ai_summary: form.ai_summary || null,
      }).select("id").single();
      if (error) throw error;
      toast.success("Saved to STASHd!");
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["collection-items"] });
      if (inserted?.id) {
        embedItemFn({ data: { itemId: inserted.id } }).catch((err: unknown) =>
          console.warn("Embedding failed", err),
        );
      }
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div>
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-primary-foreground shadow-brand">
          <Bookmark className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Save something new</h1>
        <p className="mt-1 text-muted-foreground">Paste a link — we'll fill in the rest with AI.</p>
      </div>

      <form onSubmit={submit} className="space-y-6 rounded-3xl border bg-card p-6 shadow-card md:p-8">
        <div>
          <Label htmlFor="url">URL *</Label>
          <div className="relative mt-1.5">
            <Input
              id="url"
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              onBlur={() => runMetaFetch(form.url.trim())}
              placeholder="https://…"
              maxLength={2000}
              required
              autoFocus
              className="pr-10"
            />
            {fetching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            {fetching ? (
              <>Fetching page details…</>
            ) : metaLoaded ? (
              <><Sparkles className="h-3 w-3 text-primary" /> Auto-filled from the page. Edit anything below.</>
            ) : (
              <>Only the URL is required. AI will categorize the rest.</>
            )}
          </p>
        </div>

        {/* AI suggestions panel */}
        {(aiLoaded || categorizing) && (
          <div className="rounded-2xl border bg-accent/40 p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Wand2 className="h-4 w-4 text-primary" />
                AI suggestions
                {categorizing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <button
                type="button"
                onClick={() => { lastAiKey.current = ""; runAi(); }}
                disabled={categorizing}
                className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
              >
                Regenerate
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="category" className="text-xs">Category</Label>
                <Select
                  value={form.category || ""}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick a category" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="subcategory" className="text-xs">Subcategory</Label>
                <Input
                  id="subcategory"
                  value={form.subcategory}
                  onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                  placeholder="e.g. Dinner > Chicken"
                  maxLength={200}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="ai_summary" className="text-xs">AI summary</Label>
              <Textarea
                id="ai_summary"
                value={form.ai_summary}
                onChange={(e) => setForm({ ...form, ai_summary: e.target.value })}
                rows={2}
                maxLength={500}
                className="mt-1.5"
                placeholder="One-sentence summary"
              />
            </div>

            {suggestedCollections.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Suggested collections</span>
                  <span className="text-[10px] text-muted-foreground">One-click to add</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestedCollections.map((name) => {
                    const existing = collections?.find((c) => c.name.toLowerCase() === name.toLowerCase());
                    const isSelected = !!existing && form.collection_id === existing.id;
                    const isBusy = acceptingCollection === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => acceptCollection(name)}
                        disabled={isBusy || isSelected}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-card hover:border-primary hover:text-primary",
                          isBusy && "opacity-60",
                        )}
                      >
                        {isBusy ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : isSelected ? (
                          <Check className="h-3 w-3" />
                        ) : existing ? (
                          <Bookmark className="h-3 w-3" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                        {name}
                        {!existing && !isSelected && (
                          <span className="ml-1 text-[10px] font-normal opacity-70">new</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <Label>Type</Label>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setForm({ ...form, type: t.key })}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-semibold transition",
                  form.type === t.key
                    ? "border-primary bg-accent text-primary"
                    : "bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                <t.icon className="h-5 w-5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Auto-filled from the page"
            maxLength={200}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="image_url">Thumbnail image URL</Label>
          <div className="mt-1.5 flex gap-3">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted text-muted-foreground">
              {form.image_url ? (
                <img
                  src={form.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <ImageIcon className="h-6 w-6" />
              )}
            </div>
            <Input
              id="image_url"
              type="url"
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              placeholder="Auto-filled from the page"
              maxLength={2000}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="desc">Notes</Label>
          <Textarea
            id="desc"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            maxLength={1000}
            className="mt-1.5"
            placeholder="Auto-filled from the page — add your own notes too."
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="dinner, chicken, easy"
              maxLength={300}
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">Separate with commas. AI suggests these.</p>
          </div>

          <div>
            <Label>Collection</Label>
            <Select
              value={form.collection_id || "none"}
              onValueChange={(v) => setForm({ ...form, collection_id: v === "none" ? "" : v })}
            >
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No collection</SelectItem>
                {collections?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-full border bg-card px-6 py-3 text-sm font-semibold shadow-card"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={busy || !form.url.trim()}
            className="rounded-full bg-brand-gradient px-8 py-3 text-sm font-semibold text-primary-foreground shadow-brand disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save to STASHd"}
          </button>
        </div>
      </form>
    </div>
  );
}
