import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Share2, Lock, Globe, FolderOpen, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/collections")({
  head: () => ({ meta: [{ title: "Collections — STASHd" }] }),
  component: CollectionsPage,
});

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(300).optional(),
});

type CollectionRow = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  share_slug: string | null;
  color: string | null;
  item_collections: { items: { image_url: string | null } | null }[];
};

function CollectionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", is_public: false });

  const { data } = useQuery({
    queryKey: ["collections", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("*, item_collections(items(image_url))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CollectionRow[];
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = schema.safeParse(form);
    if (!p.success) return toast.error(p.error.issues[0].message);
    if (!user) return;
    const { data: created, error } = await supabase
      .from("collections")
      .insert({ user_id: user.id, name: form.name.trim(), description: form.description || null, is_public: form.is_public })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Collection created");
    qc.invalidateQueries({ queryKey: ["collections"] });
    setForm({ name: "", description: "", is_public: false });
    setOpen(false);
    navigate({ to: "/collections/$id", params: { id: created.id } });
  };

  const share = async (e: React.MouseEvent, c: CollectionRow) => {
    e.preventDefault();
    e.stopPropagation();
    let slug = c.share_slug;
    if (!c.is_public || !slug) {
      const { data: updated, error } = await supabase
        .from("collections")
        .update({ is_public: true })
        .eq("id", c.id)
        .select("share_slug")
        .single();
      if (error) return toast.error(error.message);
      slug = updated.share_slug;
      qc.invalidateQueries({ queryKey: ["collections"] });
    }
    if (!slug) return toast.error("Couldn't create share link");
    const link = `${window.location.origin}/share/${slug}`;
    try { await navigator.clipboard.writeText(link); } catch {}
    toast.success(c.is_public ? "Share link copied!" : "Made public — link copied!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Collections</h1>
          <p className="mt-1 text-muted-foreground">Organize your saves into shareable folders.</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-brand"
        >
          <Plus className="h-4 w-4" /> New
        </button>
      </div>

      {data && data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => {
            const coverImage = c.item_collections?.find((ic) => ic.items?.image_url)?.items?.image_url ?? null;
            const count = c.item_collections?.length ?? 0;
            return (
              <Link
                key={c.id}
                to="/collections/$id"
                params={{ id: c.id }}
                className="group overflow-hidden rounded-2xl border bg-card shadow-card transition hover:shadow-brand"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                  {coverImage ? (
                    <img
                      src={coverImage}
                      alt={c.name}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent to-muted">
                      <FolderOpen className="h-10 w-10 text-primary/30" />
                    </div>
                  )}
                  <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-card/90 backdrop-blur">
                    {c.is_public
                      ? <Globe className="h-3.5 w-3.5 text-primary" />
                      : <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                  </span>
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold leading-tight">{c.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">{count} {count === 1 ? "save" : "saves"}</p>
                    </div>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:text-primary" />
                  </div>

                  {c.description && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                  )}

                  <button
                    onClick={(e) => share(e, c)}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <Share2 className="h-3 w-3" />
                    {c.is_public ? "Copy share link" : "Share"}
                  </button>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border bg-card p-12 text-center shadow-card">
          <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <h2 className="mt-3 text-xl font-bold">No collections yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">Create your first to group related saves.</p>
          <button
            onClick={() => setOpen(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-brand"
          >
            <Plus className="h-4 w-4" /> Create Collection
          </button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New collection</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="cname">Name</Label>
              <Input id="cname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} required className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="cdesc">Description</Label>
              <Textarea id="cdesc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} rows={2} className="mt-1.5" />
            </div>
            <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Make it shareable</p>
                <p className="text-xs text-muted-foreground">Anyone with the link can view.</p>
              </div>
              <Switch checked={form.is_public} onCheckedChange={(v) => setForm({ ...form, is_public: v })} />
            </div>
            <button type="submit" className="w-full rounded-full bg-brand-gradient py-3 text-sm font-semibold text-primary-foreground shadow-brand">
              Create Collection
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
