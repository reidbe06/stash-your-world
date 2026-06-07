import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, Share2, Globe, Lock,
  Pencil, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ItemCard, type Item } from "@/components/ItemCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/collections/$id")({
  component: CollectionDetail,
});

function CollectionDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data: collection } = useQuery({
    queryKey: ["collection", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("collections").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["collection-items", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*, item_collections!inner(collection_id), collection:collections(id,name)")
        .eq("item_collections.collection_id", id)
        .order("created_at", { ascending: false });
      if (error?.message?.includes("item_collections")) {
        const { data: fb, error: fbErr } = await supabase
          .from("items")
          .select("*")
          .eq("collection_id", id)
          .order("created_at", { ascending: false });
        if (fbErr) throw fbErr;
        return (fb ?? []) as Item[];
      }
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  const share = async () => {
    if (!collection) return;
    let slug = collection.share_slug;
    if (!collection.is_public || !slug) {
      const { data, error } = await supabase
        .from("collections")
        .update({ is_public: true })
        .eq("id", collection.id)
        .select("share_slug")
        .single();
      if (error) return toast.error(error.message);
      slug = data.share_slug;
      qc.invalidateQueries({ queryKey: ["collection", id] });
      qc.invalidateQueries({ queryKey: ["collections"] });
    }
    if (!slug) return toast.error("Couldn't create share link");
    try { await navigator.clipboard.writeText(`${window.location.origin}/share/${slug}`); } catch {}
    toast.success(collection.is_public ? "Share link copied!" : "Made public — link copied!");
  };

  const handleRenameOpen = () => {
    setRenameValue(collection?.name ?? "");
    setRenameOpen(true);
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setRenaming(true);
    const { error } = await supabase
      .from("collections")
      .update({ name: trimmed })
      .eq("id", id);
    setRenaming(false);
    if (error) return toast.error(error.message);
    toast.success("Collection renamed");
    qc.invalidateQueries({ queryKey: ["collection", id] });
    qc.invalidateQueries({ queryKey: ["collections"] });
    setRenameOpen(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from("collections").delete().eq("id", id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("Collection deleted");
    qc.invalidateQueries({ queryKey: ["collections"] });
    navigate({ to: "/collections" });
  };

  const handleRemove = async (itemId: string) => {
    setRemovingId(itemId);
    const { error } = await supabase
      .from("item_collections")
      .delete()
      .eq("item_id", itemId)
      .eq("collection_id", id);
    setRemovingId(null);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["collection-items", id] });
    qc.invalidateQueries({ queryKey: ["collections"] });
  };

  return (
    <div className="space-y-6">
      <Link
        to="/collections"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All collections
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">{collection?.name ?? "…"}</h1>
            {collection && (
              <span className="flex h-7 items-center gap-1 rounded-full bg-accent px-2.5 text-xs font-semibold text-primary">
                {collection.is_public
                  ? <><Globe className="h-3 w-3" /> Public</>
                  : <><Lock className="h-3 w-3" /> Private</>}
              </span>
            )}
          </div>
          {collection?.description && (
            <p className="mt-1 text-muted-foreground">{collection.description}</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">{items?.length ?? 0} {items?.length === 1 ? "save" : "saves"}</p>
        </div>

        {collection && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={share}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-sm font-semibold shadow-card hover:text-primary"
            >
              <Share2 className="h-4 w-4" /> Share
            </button>
            <button
              onClick={handleRenameOpen}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-sm font-semibold shadow-card hover:text-primary"
            >
              <Pencil className="h-4 w-4" /> Rename
            </button>
            <button
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-card px-4 py-2 text-sm font-semibold text-destructive shadow-card hover:bg-destructive/5"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
            <Link
              to="/save"
              search={{ collection: id } as never}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-primary-foreground shadow-brand"
            >
              <Plus className="h-4 w-4" /> Add
            </Link>
          </div>
        )}
      </div>

      {items && items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div key={it.id} className="relative">
              <ItemCard item={it} />
              <button
                onClick={() => handleRemove(it.id)}
                disabled={removingId === it.id}
                aria-label="Remove from collection"
                className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-card/95 shadow-sm backdrop-blur transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">No saves in this collection yet.</p>
          <Link
            to="/save"
            search={{ collection: id } as never}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-brand"
          >
            <Plus className="h-4 w-4" /> Add your first save
          </Link>
        </div>
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename collection</DialogTitle></DialogHeader>
          <form onSubmit={handleRename} className="space-y-4">
            <div>
              <Label htmlFor="rename-input">Name</Label>
              <Input
                id="rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                maxLength={80}
                required
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRenameOpen(false)}
                className="flex-1 rounded-full border py-2.5 text-sm font-semibold hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={renaming || !renameValue.trim()}
                className="flex-1 rounded-full bg-brand-gradient py-2.5 text-sm font-semibold text-primary-foreground shadow-brand disabled:opacity-50"
              >
                {renaming ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{collection?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This collection will be permanently deleted. Your saved items will not be deleted — only this collection folder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete collection"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
