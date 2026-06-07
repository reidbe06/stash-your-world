import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ExternalLink, FolderPlus, Pencil, Sparkles,
  Bell, CheckCircle2, Folder, Trash2, UtensilsCrossed, ChefHat,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Item } from "@/components/ItemCard";
import { ItemImage } from "@/components/ItemImage";
import { EditItemModal } from "@/components/EditItemModal";
import { CollectionQuickAdd } from "@/components/CollectionQuickAdd";
import { ReminderPicker } from "@/components/ReminderPicker";
import { toast } from "sonner";
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

export const Route = createFileRoute("/_authenticated/item/$id")({
  head: () => ({ meta: [{ title: "Save — STASHd" }] }),
  component: ItemDetailPage,
});

type RecipeNutrition = {
  calories_per_serving?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
};

type FullItem = Item & {
  source_platform?: string | null;
  subcategory?: string | null;
  ai_subcategory?: string | null;
  media_format?: string | null;
  travel_details?: Record<string, unknown> | null;
  recipe_nutrition?: RecipeNutrition | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });
}

function ItemDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!item) return;
    setDeleting(true);
    const { error } = await supabase
      .from("items")
      .delete()
      .eq("id", item.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["collection-items"] });
    toast.success("Save deleted");
    navigate({ to: "/dashboard" });
  };

  const { data: item, isLoading } = useQuery({
    queryKey: ["item-detail", id],
    enabled: !!user && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*, item_collections(collection_id, collections(id, name))")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as FullItem;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-5 w-20 rounded bg-muted" />
        <div className="aspect-video w-full rounded-2xl bg-muted" />
        <div className="space-y-2 px-1">
          <div className="h-6 w-3/4 rounded bg-muted" />
          <div className="h-4 w-1/2 rounded bg-muted" />
        </div>
        <div className="h-28 rounded-2xl bg-muted" />
        <div className="h-14 rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-muted-foreground">Save not found.</p>
        <button
          type="button"
          onClick={() => navigate({ to: "/search" })}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Back to search
        </button>
      </div>
    );
  }

  let host: string | null = item.source_platform ?? item.source ?? null;
  if (!host && item.url) {
    try { host = new URL(item.url).hostname.replace("www.", ""); } catch {}
  }

  const allTags = [
    ...(item.tags ?? []),
    ...(item.ai_tags ?? []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const collectionNames = (item.item_collections ?? [])
    .map((ic) => (ic as { collections: { id: string; name: string } | null }).collections?.name)
    .filter(Boolean) as string[];

  const subcategoryLabel = item.subcategory ?? item.ai_subcategory ?? null;
  const typeLabel = subcategoryLabel ? `${item.type} › ${subcategoryLabel}` : item.type;

  return (
    <div className="space-y-5 pb-10">
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate({ to: -1 as never })}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      {/* ── Hero image ── */}
      <div className="relative overflow-hidden rounded-2xl bg-muted aspect-video">
        <ItemImage
          src={item.image_url}
          alt={item.title}
          url={item.url}
          source={item.source}
        />
        {/* Type badge */}
        <span className="absolute left-3 top-3 rounded-full bg-card/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary backdrop-blur">
          {typeLabel}
        </span>
      </div>

      {/* ── Title + meta ── */}
      <div className="space-y-1.5 px-0.5">
        <h1 className="text-xl font-extrabold leading-snug tracking-tight">
          {item.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {host && <span className="font-medium">{host}</span>}
          {host && <span aria-hidden>·</span>}
          <span>{formatDate(item.created_at)}</span>
        </div>

        {/* Collections */}
        {collectionNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {collectionNames.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
              >
                <Folder className="h-3 w-3 shrink-0" />
                {name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── AI Summary ── */}
      {item.ai_summary && (
        <div className="rounded-2xl border border-border/40 bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100">
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              AI Summary
            </p>
          </div>
          <p className="text-sm leading-relaxed text-foreground">{item.ai_summary}</p>
        </div>
      )}

      {/* ── Key Takeaways ── */}
      {item.ai_key_takeaways && item.ai_key_takeaways.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-white p-4 shadow-sm space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Key Takeaways
          </p>
          <ul className="space-y-2">
            {item.ai_key_takeaways.map((t, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span className="leading-snug">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Ingredients ── */}
      {item.recipe_ingredients && item.recipe_ingredients.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100">
                <UtensilsCrossed className="h-3.5 w-3.5 text-orange-500" />
              </span>
              <p className="text-sm font-semibold">Ingredients</p>
            </div>
            <span className="text-xs text-muted-foreground">{item.recipe_ingredients.length} items</span>
          </div>
          <ul className="space-y-2">
            {(ingredientsOpen ? item.recipe_ingredients : item.recipe_ingredients.slice(0, 5)).map((ing, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {ing}
              </li>
            ))}
          </ul>
          {item.recipe_ingredients.length > 5 && (
            <button
              onClick={() => setIngredientsOpen(!ingredientsOpen)}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              {ingredientsOpen
                ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</>
                : <><ChevronDown className="h-3.5 w-3.5" /> Show all {item.recipe_ingredients.length} ingredients</>}
            </button>
          )}
        </div>
      )}

      {/* ── Instructions ── */}
      {item.recipe_steps && item.recipe_steps.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
                <ChefHat className="h-3.5 w-3.5 text-emerald-600" />
              </span>
              <p className="text-sm font-semibold">Instructions</p>
            </div>
            <span className="text-xs text-muted-foreground">{item.recipe_steps.length} steps</span>
          </div>
          <ol className="space-y-3.5">
            {item.recipe_steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <p className="pt-0.5 text-sm leading-relaxed text-foreground">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Nutrition ── */}
      {(() => {
        const n = item.recipe_nutrition as RecipeNutrition | null | undefined;
        if (!n) return null;
        const entries = [
          { label: "Calories", value: n.calories_per_serving, unit: "" },
          { label: "Protein", value: n.protein_g, unit: "g" },
          { label: "Carbs", value: n.carbs_g, unit: "g" },
          { label: "Fat", value: n.fat_g, unit: "g" },
        ].filter((e) => e.value != null && e.value !== undefined);
        if (entries.length === 0) return null;
        return (
          <div className="rounded-2xl border border-border/40 bg-card p-4 shadow-sm space-y-3">
            <p className="text-sm font-semibold">Nutrition <span className="text-xs font-normal text-muted-foreground">(per serving)</span></p>
            <div className="grid grid-cols-4 gap-2">
              {entries.map((e) => (
                <div key={e.label} className="flex flex-col items-center rounded-xl bg-accent/50 px-2 py-3 text-center">
                  <span className="text-lg font-bold leading-none">{e.value}{e.unit}</span>
                  <span className="mt-1 text-[10px] text-muted-foreground">{e.label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Product names ── */}
      {item.product_names && item.product_names.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-white p-4 shadow-sm space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Products
          </p>
          <div className="flex flex-wrap gap-1.5">
            {item.product_names.map((p) => (
              <span key={p} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Tags ── */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((t) => (
            <span key={t} className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* ── Notes / description ── */}
      {item.description && (
        <div className="rounded-2xl border border-border/40 bg-white p-4 shadow-sm space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notes</p>
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{item.description}</p>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="rounded-2xl border border-border/40 bg-white shadow-sm overflow-hidden">
        <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Actions
        </p>

        {/* Add Reminder */}
        <div className="flex items-center gap-3 border-t border-border/20 px-4 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <Bell className="h-4 w-4 text-amber-500" />
          </span>
          <span className="flex-1 text-sm font-medium">Add Reminder</span>
          <ReminderPicker itemId={item.id} reminderAt={item.reminder_at} />
        </div>

        {/* Add to Collection */}
        <button
          type="button"
          onClick={() => setQuickAddOpen(true)}
          className="flex w-full items-center gap-3 border-t border-border/20 px-4 py-3.5 text-left transition hover:bg-accent/20"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100">
            <FolderPlus className="h-4 w-4 text-blue-500" />
          </span>
          <span className="flex-1 text-sm font-medium">Add to Collection</span>
          <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
        </button>

        {/* Edit Save */}
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="flex w-full items-center gap-3 border-t border-border/20 px-4 py-3.5 text-left transition hover:bg-accent/20"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <Pencil className="h-4 w-4 text-emerald-600" />
          </span>
          <span className="flex-1 text-sm font-medium">Edit Save</span>
          <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
        </button>

        {/* Delete Save */}
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="flex w-full items-center gap-3 border-t border-border/20 px-4 py-3.5 text-left transition hover:bg-destructive/5"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
            <Trash2 className="h-4 w-4 text-destructive" />
          </span>
          <span className="flex-1 text-sm font-medium text-destructive">Delete Save</span>
        </button>

        {/* Open Original Source — secondary */}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-3 border-t border-border/20 px-4 py-3.5 text-left transition hover:bg-accent/20"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </span>
            <div className="flex-1">
              <span className="block text-sm font-medium text-muted-foreground">Open Original Source</span>
              {host && <span className="block text-xs text-muted-foreground/70">{host}</span>}
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" />
          </a>
        )}
      </div>

      {/* Modals */}
      <EditItemModal
        item={item}
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          qc.invalidateQueries({ queryKey: ["item-detail", id] });
        }}
      />
      <CollectionQuickAdd
        item={item}
        open={quickAddOpen}
        onClose={() => {
          setQuickAddOpen(false);
          qc.invalidateQueries({ queryKey: ["item-detail", id] });
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this save?</AlertDialogTitle>
            <AlertDialogDescription>
              "{item.title}" will be permanently removed from your library and any collection it belongs to. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
