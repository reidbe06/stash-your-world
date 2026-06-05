import { useRef, useState } from "react";
import { Bell, ChevronDown, ChevronUp, ExternalLink, Folder, FolderPlus, Pencil, Sparkles, Trash2 } from "lucide-react";
import { ItemImage } from "@/components/ItemImage";
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
import { EditItemModal } from "@/components/EditItemModal";
import { CollectionQuickAdd } from "@/components/CollectionQuickAdd";
import { ReminderPicker } from "@/components/ReminderPicker";

export interface Item {
  id: string;
  title: string;
  url: string | null;
  description: string | null;
  image_url: string | null;
  type: string;
  category?: string | null;
  subcategory?: string | null;
  source: string | null;
  tags: string[];
  created_at: string;
  collection_id?: string | null;
  collection?: { id?: string; name: string } | null;
  item_collections?: Array<{
    collection_id: string;
    collections: { id: string; name: string } | null;
  }> | null;
  reminder_at?: string | null;
  processing_status?: string | null;
  ai_summary?: string | null;
  ai_category?: string | null;
  ai_subcategory?: string | null;
  ai_tags?: string[];
  ai_key_takeaways?: string[];
  transcript?: string | null;
  original_caption?: string | null;
  recipe_ingredients?: string[];
  recipe_steps?: string[];
  product_names?: string[];
  confidence_score?: number | null;
  user_edited?: boolean | null;
  edited_at?: string | null;
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

type StatusConfig = {
  label: string;
  className: string;
};

const STATUS_MAP: Record<string, StatusConfig> = {
  fully_organized:   { label: "Fully Organized",   className: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800" },
  transcript_found:  { label: "Transcript Found",  className: "bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800" },
  caption_found:     { label: "Caption Found",     className: "bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800" },
  metadata_found:    { label: "Fully Organized",   className: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800" },
  needs_user_context:{ label: "Needs More Context",className: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-600 dark:border-amber-800" },
  ai_processed:      { label: "Fully Organized",   className: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800" },
  pending:           { label: "Saved Only",        className: "bg-muted text-muted-foreground border border-border" },
  error:             { label: "Processing Failed", className: "bg-destructive/10 text-destructive border border-destructive/20" },
  failed:            { label: "Processing Failed", className: "bg-destructive/10 text-destructive border border-destructive/20" },
};

function getStatusConfig(status: string | null | undefined): StatusConfig | null {
  if (!status) return null;
  return STATUS_MAP[status] ?? null;
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const cfg = getStatusConfig(status);
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function AIDetails({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);

  const transcript = item.transcript || item.original_caption || null;
  const hasContent =
    item.ai_summary ||
    transcript ||
    item.ai_category ||
    item.ai_subcategory ||
    (item.ai_tags?.length) ||
    (item.recipe_ingredients?.length) ||
    (item.recipe_steps?.length) ||
    (item.product_names?.length) ||
    (item.ai_key_takeaways?.length) ||
    item.confidence_score != null;

  if (!hasContent) return null;

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        <span>AI Details</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="flex flex-col gap-3 px-4 pb-4 text-xs">

          {item.ai_summary && (
            <div>
              <p className="mb-0.5 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Summary</p>
              <p className="text-foreground leading-relaxed">{item.ai_summary}</p>
            </div>
          )}

          {transcript && (
            <div>
              <p className="mb-0.5 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">
                {item.transcript ? "Transcript" : "Caption"}
              </p>
              <p className="line-clamp-4 text-foreground leading-relaxed whitespace-pre-wrap">{transcript}</p>
            </div>
          )}

          {(item.ai_category || item.ai_subcategory) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {item.ai_category && (
                <div>
                  <p className="mb-0.5 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Category</p>
                  <p className="text-foreground">{item.ai_category}</p>
                </div>
              )}
              {item.ai_subcategory && (
                <div>
                  <p className="mb-0.5 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Subcategory</p>
                  <p className="text-foreground">{item.ai_subcategory}</p>
                </div>
              )}
            </div>
          )}

          {item.ai_tags && item.ai_tags.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Tags</p>
              <div className="flex flex-wrap gap-1">
                {item.ai_tags.map((t) => (
                  <span key={t} className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">#{t}</span>
                ))}
              </div>
            </div>
          )}

          {item.recipe_ingredients && item.recipe_ingredients.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Ingredients</p>
              <ul className="list-disc list-inside space-y-0.5 text-foreground">
                {item.recipe_ingredients.map((ing, i) => <li key={i}>{ing}</li>)}
              </ul>
            </div>
          )}

          {item.recipe_steps && item.recipe_steps.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Steps</p>
              <ol className="list-decimal list-inside space-y-0.5 text-foreground">
                {item.recipe_steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            </div>
          )}

          {item.product_names && item.product_names.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Products</p>
              <div className="flex flex-wrap gap-1">
                {item.product_names.map((p) => (
                  <span key={p} className="rounded bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">{p}</span>
                ))}
              </div>
            </div>
          )}

          {item.ai_key_takeaways && item.ai_key_takeaways.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Key Takeaways</p>
              <ul className="list-disc list-inside space-y-0.5 text-foreground">
                {item.ai_key_takeaways.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}

          {item.confidence_score != null && (
            <div>
              <p className="mb-0.5 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Confidence</p>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round(item.confidence_score * 100)}%` }}
                  />
                </div>
                <span className="shrink-0 text-muted-foreground">{Math.round(item.confidence_score * 100)}%</span>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ─── Inline note prompt for "Needs More Context" items ───────────────────────
// Shown only when processing_status === "needs_user_context".
// Calls /api/public/items/recategorize, then refreshes the item list.

function NeedsContextPanel({ item, onDone }: { item: Item; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = note.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        toast.error("You need to be signed in to do this.");
        return;
      }

      const res = await fetch("/api/public/items/recategorize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ item_id: item.id, note: trimmed }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error || "Something went wrong. Please try again.");
        return;
      }

      toast.success("Organized! Your item has been categorized.");
      onDone();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-amber-200 bg-amber-50/60 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/20">
      <p className="mb-2 text-[11px] font-semibold text-amber-800 dark:text-amber-400">
        What do you want STASHd to remember about this?
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <textarea
          ref={textareaRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Pasta recipe for weeknights, or outfit idea for summer…"
          rows={2}
          disabled={busy}
          className="w-full resize-none rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-50 dark:border-amber-800/40 dark:bg-card"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e as any); }
          }}
        />
        <button
          type="submit"
          disabled={!note.trim() || busy}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          <Sparkles className="h-3 w-3" />
          {busy ? "Organizing…" : "Organize with AI"}
        </button>
      </form>
    </div>
  );
}

export function ItemCard({ item, readOnly }: { item: Item; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

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

  const handleRecategorizeDone = () => {
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["collection-items"] });
  };

  let host: string | null = item.source;
  if (!host && item.url) {
    try { host = new URL(item.url).hostname.replace("www.", ""); } catch {}
  }

  const needsContext = item.processing_status === "needs_user_context";

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card transition hover:shadow-brand">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <ItemImage
          src={item.image_url}
          alt={item.title}
          url={item.url}
          source={item.source}
        />
        <span className="absolute left-3 top-3 rounded-full bg-card/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary backdrop-blur">
          {item.type}
        </span>
        {!readOnly && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            <ReminderPicker itemId={item.id} reminderAt={item.reminder_at} />
            <button
              onClick={() => setQuickAddOpen(true)}
              className="rounded-full bg-card/95 p-2 text-muted-foreground shadow-sm backdrop-blur transition hover:bg-accent hover:text-foreground"
              aria-label="Add to collection"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setEditOpen(true)}
              className="rounded-full bg-card/95 p-2 text-muted-foreground shadow-sm backdrop-blur transition hover:bg-accent hover:text-foreground"
              aria-label="Edit saved item"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setOpen(true)}
              className="rounded-full bg-card/95 p-2 text-muted-foreground shadow-sm backdrop-blur transition hover:bg-destructive hover:text-destructive-foreground"
              aria-label="Delete saved item"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
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

        {item.processing_status && !needsContext && (
          <div className="mt-2">
            <StatusBadge status={item.processing_status} />
          </div>
        )}

        {item.tags.length > 0 && !needsContext && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">#{t}</span>
            ))}
            {item.tags.length > 3 && (
              <span className="text-[10px] font-medium text-muted-foreground">+{item.tags.length - 3}</span>
            )}
          </div>
        )}

        <div className="mt-auto pt-3">
          {(() => {
            const names = (item.item_collections ?? [])
              .map((ic) => ic.collections?.name)
              .filter(Boolean) as string[];
            return names.length > 0 ? (
              <div className="mb-2 flex flex-wrap items-center gap-1">
                {names.slice(0, 2).map((name) => (
                  <span key={name} className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                    <Folder className="h-2.5 w-2.5 shrink-0" />
                    {name}
                  </span>
                ))}
                {names.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">+{names.length - 2} more</span>
                )}
              </div>
            ) : null;
          })()}
          <div className="flex items-center justify-between">
            <span />
            {item.url && (
              <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                Open <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      {needsContext && !readOnly && (
        <NeedsContextPanel item={item} onDone={handleRecategorizeDone} />
      )}

      {!needsContext && <AIDetails item={item} />}

      <EditItemModal item={item} open={editOpen} onClose={() => setEditOpen(false)} />
      <CollectionQuickAdd item={item} open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />

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
    </article>
  );
}
