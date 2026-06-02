import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, UtensilsCrossed, Video, ShoppingBag, Shirt, Home, Plane, BookOpen, Dumbbell, Sparkles, Bookmark, ImageIcon, Loader2, Wand2, Plus, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categorizeItem, CATEGORIES } from "@/lib/ai-categorize.functions";
import { fetchSocialCaption } from "@/lib/social-caption.functions";
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
  { key: "Recipe",        label: "Recipe",        icon: UtensilsCrossed },
  { key: "Fashion",       label: "Fashion",       icon: Shirt },
  { key: "Product",       label: "Product",       icon: ShoppingBag },
  { key: "Home",          label: "Home",          icon: Home },
  { key: "Travel",        label: "Travel",        icon: Plane },
  { key: "Tutorial",      label: "Tutorial",      icon: BookOpen },
  { key: "Fitness",       label: "Fitness",       icon: Dumbbell },
  { key: "Beauty",        label: "Beauty",        icon: Sparkles },
  { key: "Parenting",     label: "Parenting",     icon: Video },
  { key: "Business",      label: "Business",      icon: Bookmark },
  { key: "Entertainment", label: "Entertainment", icon: Video },
  { key: "Other",         label: "Other",         icon: Bookmark },
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

// Returns true if the title appears to be derived from the URL slug
// e.g. Instagram /reel/C8tJ3oPsrQP/ → title "C8t J3o Psr QP"
function isUrlSlugTitle(title: string, url: string): boolean {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (!segments.length) return false;
    // Check the last two path segments
    for (const seg of segments.slice(-2)) {
      if (seg.length < 4) continue;
      const normalizedSeg = seg.replace(/[-_]/g, "").toLowerCase();
      const normalizedTitle = title.replace(/[\s\-_]/g, "").toLowerCase();
      if (normalizedTitle === normalizedSeg || normalizedSeg.includes(normalizedTitle) || normalizedTitle.includes(normalizedSeg)) {
        return true;
      }
    }
  } catch {}
  return false;
}

function hasUsefulSocialMetadata(f: { title: string; description: string; image_url: string; url: string }) {
  const platform = getPlatform(f.url).toLowerCase();
  const title = f.title.trim();
  // Slug-derived titles ("C8t J3o Psr QP") are not real content
  if (isUrlSlugTitle(title, f.url)) return false;
  const titleLower = title.toLowerCase();
  return !!(
    f.description.trim().length >= 8 ||
    (title.length >= 8 && platform && !titleLower.includes(platform.toLowerCase()))
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
  const runCategorize = useServerFn(categorizeItem);
  const fetchSocialCaptionFn = useServerFn(fetchSocialCaption);
  const embedItemFn = useServerFn(embedItem);

  const [form, setForm] = useState({
    title: "",
    url: "",
    image_url: "",
    description: "",
    type: "Other",
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
  const [extractedCaption, setExtractedCaption] = useState("");
  const [extractedMethod, setExtractedMethod] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
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

  const runExtract = async (url: string) => {
    if (!isSocialVideoUrl(url)) return;
    const platform = url.includes("tiktok.com") ? "tiktok" : "instagram_reel";
    console.log(`[SAVE] Extracting caption: platform=${platform}`);
    setExtracting(true);
    try {
      const result = await fetchSocialCaptionFn({ data: { url, platform } });
      const cap = result.caption?.trim() ?? "";
      if (cap.length > 20) {
        console.log(`[SAVE] Caption extracted: method=${result.method} len=${cap.length} preview=${JSON.stringify(cap.slice(0, 80))}`);
        setExtractedCaption(cap);
        setExtractedMethod(result.method);
      } else {
        console.log(`[SAVE] Caption extraction: nothing useful (len=${cap.length})`);
      }
    } catch (err: any) {
      console.warn("[SAVE] Caption extraction failed:", err?.message ?? err);
    } finally {
      setExtracting(false);
    }
  };

  const runMetaFetch = async (url: string) => {
    if (!isValidUrl(url) || url === lastFetchedUrl.current) return;
    lastFetchedUrl.current = url;
    setFetching(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/public/url-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ url }),
      });
      const meta: { title?: string | null; description?: string | null; image?: string | null; type?: string | null; ok?: boolean } = await res.json();
      if (res.ok && meta) {
        setForm((f) => ({
          ...f,
          title: f.title || meta.title || "",
          image_url: f.image_url || meta.image || "",
          description: f.description || meta.description || "",
          type: f.type,
        }));
        setMetaLoaded(true);
        // For social video URLs always fire background caption extraction.
        // The result updates extractedCaption → triggers AI re-run automatically.
        if (isSocialVideoUrl(url)) {
          runExtract(url);
          if (!hasUsefulSocialMetadata({
            title: meta.title || "",
            description: meta.description || "",
            image_url: meta.image || "",
            url,
          })) {
            setSaveStatus("needs_info");
          }
        }
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

    // captionForAi: prefer the live-extracted caption (og:description, yt-dlp, etc.) over
    // the URL metadata description, which is often null for Instagram/TikTok.
    const captionForAi = extractedCaption || f.description || "";

    // Opaque video: social platform with no extractable caption/description and no user note/hint.
    // If we extracted a caption > 100 chars, treat it as having real content — do NOT skip AI.
    const isOpaque = isSocialVideoUrl(url)
      && captionForAi.trim().length <= 100
      && !hasUsefulSocialMetadata({ title: f.title, description: f.description, image_url: f.image_url, url })
      && !help.contextType
      && !help.note.trim();

    if (isOpaque) {
      const stillExtracting = extracting;
      console.log(
        `[SAVE] Skipping AI — opaque ${getPlatform(url)} video: caption_len=${captionForAi.length} extracting=${stillExtracting}. Setting Needs Review.`,
      );
      setForm((cur) => ({ ...cur, category: "Needs Review", ai_summary: "" }));
      setSaveStatus("needs_info");
      setAiLoaded(false);
      return;
    }

    let source = "";
    try { source = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    const key = JSON.stringify([url, f.title, f.description, extractedCaption, help.contextType, help.note]);
    if (key === lastAiKey.current) return;
    lastAiKey.current = key;
    setCategorizing(true);

    console.log(
      `[SAVE] Calling OpenAI: platform=${getPlatform(url)} ` +
      `title=${JSON.stringify(f.title)} caption_len=${captionForAi.length} ` +
      `caption_preview=${JSON.stringify(captionForAi.slice(0, 80))} ` +
      `note=${JSON.stringify(help.note)} hint=${JSON.stringify(help.contextType)}`,
    );

    try {
      const ai = await runCategorize({
        data: {
          url,
          title: f.title || "",
          description: captionForAi,
          notes: help.note,
          contextType: help.contextType,
          source,
          existingCollections: (collections || []).map((c) => c.name),
        },
      });

      console.log(
        `[SAVE] OpenAI returned: category=${ai.category} content_type=${ai.content_type} ` +
        `subcategory=${ai.subcategory} tags=${ai.tags.join(",")} title=${JSON.stringify(ai.generated_title)}`,
      );

      setForm((cur) => ({
        ...cur,
        title: cur.title || ai.generated_title || "",
        category: ai.category,
        type: ai.content_type || cur.type,
        subcategory: cur.subcategory || ai.subcategory,
        ai_summary: ai.summary || cur.ai_summary,
        description: cur.description || ai.notes || ai.summary || "",
        suggested_collection: cur.suggested_collection || ai.suggested_collection,
        tags: cur.tags?.trim() ? cur.tags : ai.tags.join(", "),
      }));
      setSuggestedCollections(ai.suggested_collections?.length ? ai.suggested_collections : (ai.suggested_collection ? [ai.suggested_collection] : []));
      setAiLoaded(true);
      setSaveStatus(ai.category === "Uncategorized" ? "uncategorized" : "organized");
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

  // Auto-run AI shortly after metadata fills in (or URL alone is valid).
  // Also re-runs when extractedCaption changes (i.e. after background caption extraction completes).
  useEffect(() => {
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    if (!isValidUrl(form.url)) return;
    aiDebounceRef.current = setTimeout(() => { runAi(); }, 1200);
    return () => { if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.url, form.title, form.description, extractedCaption, help.contextType, help.note]);

  // Reset extraction state when the URL changes
  useEffect(() => {
    setExtractedCaption("");
    setExtractedMethod(null);
    setExtracting(false);
  }, [form.url]);

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
      const finalCategory = form.category || "Uncategorized";
      const finalDescription = form.description || help.note || null;
      const processingStatus = aiLoaded ? "ai_processed" : saveStatus === "needs_info" ? "needs_user_context" : "pending";
      const sourcePlatform = isSocialVideoUrl(form.url)
        ? (form.url.includes("tiktok.com") ? "tiktok" : "instagram_reel")
        : null;
      const captionToStore = extractedCaption || null;
      console.log(
        `[SAVE] Submitting: category=${finalCategory} subcategory=${form.subcategory || "none"} ` +
        `tags=${tags.join(",")} processing_status=${processingStatus} ` +
        `source_platform=${sourcePlatform ?? "none"} caption_len=${captionToStore?.length ?? 0} ` +
        `aiLoaded=${aiLoaded} extraction_method=${extractedMethod ?? "none"}`,
      );

      const { data: inserted, error } = await supabase.from("items").insert({
        user_id: user.id,
        title: form.title.trim() || fallbackTitle,
        url: form.url,
        image_url: form.image_url || null,
        description: finalDescription,
        type: form.type,
        tags,
        source,
        collection_id: form.collection_id || null,
        category: finalCategory,
        subcategory: form.subcategory || null,
        ai_summary: form.ai_summary || null,
        processing_status: processingStatus,
        source_platform: sourcePlatform,
        transcript: captionToStore,
        original_caption: captionToStore,
        ai_subcategory: form.subcategory || null,
        ai_tags: tags,
      }).select("id").single();
      if (error) throw error;
      const finalStatusMessage = finalCategory === "Uncategorized" ? "Saved as Uncategorized" : "AI organized this save";
      if (!form.category || finalCategory === "Uncategorized") setSaveStatus("uncategorized");
      toast.success(finalStatusMessage);
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

  const hasHelp = !!help.contextType || !!help.note.trim();
  // Don't show help prompt if we extracted a real caption (>100 chars) — AI can categorize it.
  const captionExtracted = extractedCaption.trim().length > 100;
  const showHelpPrompt = isSocialVideoUrl(form.url) && !hasUsefulSocialMetadata(form) && !captionExtracted && saveStatus !== "organized" && (!hasHelp || saveStatus === "needs_info");
  const displayStatus = showHelpPrompt && saveStatus === "idle" ? "needs_info" : saveStatus;
  const statusMessage = displayStatus === "organized"
    ? "AI organized this save"
    : displayStatus === "needs_info"
      ? "AI needs more info"
      : displayStatus === "uncategorized"
        ? "Saved as Uncategorized"
        : "";

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

        {/* Thumbnail preview / manual image entry */}
        {metaLoaded && !fetching && (
          form.image_url ? (
            <div className="flex items-center gap-3 rounded-2xl border bg-accent/30 px-4 py-3">
              <img
                src={form.image_url}
                alt=""
                className="h-14 w-14 shrink-0 rounded-xl object-cover border"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">Thumbnail</p>
                <p className="mt-0.5 truncate text-xs text-foreground/70">{form.image_url}</p>
              </div>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                className="shrink-0 text-xs text-destructive hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-2xl border border-dashed px-4 py-3">
              <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                type="url"
                value={form.image_url}
                onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                placeholder="No thumbnail found — paste an image URL to add one"
                maxLength={2000}
                className="h-auto border-0 p-0 text-sm shadow-none focus-visible:ring-0"
              />
            </div>
          )
        )}

        {statusMessage && (
          <div className="flex items-center gap-2 rounded-2xl border bg-accent/40 px-4 py-3 text-sm font-semibold">
            {displayStatus === "organized" ? <Sparkles className="h-4 w-4 text-primary" /> : <Wand2 className="h-4 w-4 text-muted-foreground" />}
            {statusMessage}
          </div>
        )}

        {showHelpPrompt && (
          <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 md:p-5">
            <div>
              <h2 className="text-base font-bold">STASHd couldn't read this post</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                STASHd could not read enough content from this {getPlatform(form.url) || "post"}. Add a quick note so AI can organize it.
              </p>
            </div>
            <div>
              <Label>What is this about?</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {HELP_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setHelp((cur) => ({ ...cur, contextType: option }));
                      lastAiKey.current = "";
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                      help.contextType === option ? "border-primary bg-accent text-primary" : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="help-note">Quick note <span className="font-normal text-muted-foreground">(e.g. "chicken pasta recipe", "summer outfit idea")</span></Label>
              <Textarea
                id="help-note"
                value={help.note}
                onChange={(e) => setHelp((cur) => ({ ...cur, note: e.target.value }))}
                rows={2}
                maxLength={500}
                className="mt-1.5"
                placeholder="Describe what this post is about…"
              />
            </div>
            <button
              type="button"
              onClick={() => { lastAiKey.current = ""; runAi(); }}
              disabled={categorizing || (!help.note.trim() && !help.contextType)}
              className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-brand disabled:opacity-60"
            >
              {categorizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Organize with AI
            </button>
          </div>
        )}

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
