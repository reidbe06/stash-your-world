import { useState } from "react";
import { Bookmark, ExternalLink, Folder, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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

export interface Item {
  id: string;
  title: string;
  url: string | null;
  description: string | null;
  image_url: string | null;
  type: string;
  source: string | null;
  tags: string[];
  created_at: string;
  collection_id?: string | null;
  collection?: { name: string } | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ItemCard({ item, readOnly }: { item: Item; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const del = async () => {
    setDeleting(true);
    const { error } = await supabase.from("items").delete().eq("id", item.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOpen(false);
    toast.success("Saved item deleted");
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["collection-items"] });
  };

  let host: string | null = item.source;
  if (!host && item.url) {
    try { host = new URL(item.url).hostname.replace("www.", ""); } catch {}
  }

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card transition hover:shadow-brand">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {item.image_url ? (
          <img src={item.image_url} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-brand-gradient/10">
            <Bookmark className="h-10 w-10 text-primary/40" />
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-card/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary backdrop-blur">
          {item.type}
        </span>
        {!readOnly && (
          <button
            onClick={() => setOpen(true)}
            className="absolute right-3 top-3 rounded-full bg-card/95 p-2 text-muted-foreground shadow-sm backdrop-blur transition hover:bg-destructive hover:text-destructive-foreground"
            aria-label="Delete saved item"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 font-semibold leading-snug">{item.title}</h3>

        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {host && (
            <>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="truncate hover:text-primary hover:underline">{host}</a>
              ) : (
                <span className="truncate">{host}</span>
              )}
              <span aria-hidden>•</span>
            </>
          )}
          <span className="shrink-0">{timeAgo(item.created_at)}</span>
        </div>

        {item.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">#{t}</span>
            ))}
            {item.tags.length > 3 && (
              <span className="text-[10px] font-medium text-muted-foreground">+{item.tags.length - 3}</span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-3">
          {item.collection?.name ? (
            <span className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground">
              <Folder className="h-3 w-3 shrink-0" />
              <span className="truncate">{item.collection.name}</span>
            </span>
          ) : <span />}
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Open <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
