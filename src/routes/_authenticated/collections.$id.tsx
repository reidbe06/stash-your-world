import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Share2, Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ItemCard, type Item } from "@/components/ItemCard";
import { SaveItemDialog } from "@/components/SaveItemDialog";

export const Route = createFileRoute("/_authenticated/collections/$id")({
  component: CollectionDetail,
});

function CollectionDetail() {
  const { id } = Route.useParams();
  const [saveOpen, setSaveOpen] = useState(false);

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
      const { data, error } = await supabase.from("items").select("*").eq("collection_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  const share = () => {
    if (!collection?.share_slug) return;
    navigator.clipboard.writeText(`${window.location.origin}/share/${collection.share_slug}`);
    toast.success("Share link copied!");
  };

  return (
    <div className="space-y-6">
      <Link to="/collections" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All collections
      </Link>
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">{collection?.name ?? "…"}</h1>
            {collection && (
              <span className="flex h-7 items-center gap-1 rounded-full bg-accent px-2.5 text-xs font-semibold text-primary">
                {collection.is_public ? <><Globe className="h-3 w-3" /> Public</> : <><Lock className="h-3 w-3" /> Private</>}
              </span>
            )}
          </div>
          {collection?.description && <p className="mt-1 text-muted-foreground">{collection.description}</p>}
        </div>
        <div className="flex gap-2">
          {collection?.is_public && (
            <button onClick={share} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-sm font-semibold shadow-card">
              <Share2 className="h-4 w-4" /> Share
            </button>
          )}
          <button onClick={() => setSaveOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-primary-foreground shadow-brand">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      {items && items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => <ItemCard key={it.id} item={it} />)}
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">No items in this collection yet.</p>
      )}

      <SaveItemDialog open={saveOpen} onOpenChange={setSaveOpen} defaultCollection={id} />
    </div>
  );
}
