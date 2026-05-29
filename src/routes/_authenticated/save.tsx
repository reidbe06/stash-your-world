import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Link2, UtensilsCrossed, Video, ShoppingBag, Shirt, Lightbulb, FileText, Bookmark, ImageIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/save")({
  head: () => ({ meta: [{ title: "Save new — STASHd" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ collection: (s.collection as string) || "" }),
  component: SavePage,
});

const schema = z.object({
  title: z.string().trim().min(1, "Title required").max(200),
  url: z.string().trim().max(2000).optional().or(z.literal("")),
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

function SavePage() {
  const { user } = useAuth();
  const { collection } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!user) return;
    setBusy(true);
    try {
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20);
      let source: string | null = null;
      try { if (form.url) source = new URL(form.url).hostname.replace("www.", ""); } catch {}
      const { error } = await supabase.from("items").insert({
        user_id: user.id,
        title: form.title.trim(),
        url: form.url || null,
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
        <p className="mt-1 text-muted-foreground">Stash it now — find it later.</p>
      </div>

      <form onSubmit={submit} className="space-y-6 rounded-3xl border bg-card p-6 shadow-card md:p-8">
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
          <Label htmlFor="url">URL</Label>
          <Input
            id="url"
            type="url"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://…"
            maxLength={2000}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Creamy Garlic Chicken Pasta"
            required
            maxLength={200}
            className="mt-1.5"
          />
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
            placeholder="Why are you saving this?"
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
            disabled={busy}
            className="rounded-full bg-brand-gradient px-8 py-3 text-sm font-semibold text-primary-foreground shadow-brand disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save to STASHd"}
          </button>
        </div>
      </form>
    </div>
  );
}
