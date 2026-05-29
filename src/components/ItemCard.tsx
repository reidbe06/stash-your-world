import { Bookmark, ExternalLink, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
}

export function ItemCard({ item, readOnly }: { item: Item; readOnly?: boolean }) {
  const qc = useQueryClient();
  const del = async () => {
    if (!confirm("Delete this save?")) return;
    const { error } = await supabase.from("items").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["collection-items"] });
  };

  return (
    <article className="group relative overflow-hidden rounded-2xl border bg-card shadow-card transition hover:shadow-brand">
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
          <button onClick={del} className="absolute right-3 top-3 rounded-full bg-card/90 p-1.5 text-muted-foreground opacity-0 backdrop-blur transition hover:text-destructive group-hover:opacity-100" aria-label="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 font-semibold leading-snug">{item.title}</h3>
        {item.source && <p className="mt-1 text-xs text-muted-foreground">{item.source}</p>}
        {item.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">#{t}</span>
            ))}
          </div>
        )}
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            Open <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </article>
  );
}
