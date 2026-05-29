import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Link2, UtensilsCrossed, Video, ShoppingBag, Shirt, Lightbulb, FileText, Bookmark, ImageIcon, Loader2, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchUrlMetadata } from "@/lib/url-metadata.functions";
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

  const [form, setForm] = useState({
    title: "",
    url: "",
    image_url: "",
    description: "",
    type: "link",
    tags: "",
    collection_id: collection,
  });
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [metaLoaded, setMetaLoaded] = useState(false);
  const lastFetchedUrl = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        // Only fill blanks — never clobber edits the user already made
        title: f.title || meta.title || "",
        image_url: f.image_url || meta.image || "",
        description: f.description || meta.description || "",
        type: f.type === "link" && meta.type ? meta.type : f.type,
      }));
      setMetaLoaded(true);
    } catch (err: any) {
      // Soft failure — user can still fill manually
      console.warn("Metadata fetch failed", err);
    } finally {
      setFetching(false);
    }
  };

  // Debounced auto-fetch when the URL changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const url = form.url.trim();
    if (!url) { setMetaLoaded(false); lastFetchedUrl.current = ""; return; }
    if (!isValidUrl(url)) return;
    if (url === lastFetchedUrl.current) return;
    debounceRef.current = setTimeout(() => { runMetaFetch(url); }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.url]);

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
      // Fallback title from the hostname/path so URL-only saves still look sensible
      const fallbackTitle = source ?? "Saved link";
      const { error } = await supabase.from("items").insert({
        user_id: user.id,
        title: form.title.trim() || fallbackTitle,
        url: form.url,
        image_url: form.image_url || null,
        description: form.description || null,
        type: form.type,
        tags,
        source,
        collection_id: form.collection_id || null,
      });
      if (error) throw error;
      toast.success("Saved to STASHd!");
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["collection-items"] });
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
        <p className="mt-1 text-muted-foreground">Paste a link — we'll fill in the rest.</p>
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
              <>Only the URL is required. Everything else is optional.</>
            )}
          </p>
        </div>

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
            <p className="mt-1 text-xs text-muted-foreground">Separate with commas.</p>
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
