import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ExternalLink, FolderPlus, Pencil, Sparkles,
  Bell, CheckCircle2, Folder, Trash2, UtensilsCrossed, ChefHat,
  ChevronDown, ChevronUp, RefreshCw, ShoppingBag, Tag, Package,
  FolderSymlink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Item } from "@/components/ItemCard";
import { ItemImage } from "@/components/ItemImage";
import { EditItemModal } from "@/components/EditItemModal";
import { CollectionQuickAdd } from "@/components/CollectionQuickAdd";
import { ReminderPicker } from "@/components/ReminderPicker";
import { MoveOrganizeModal } from "@/components/MoveOrganizeModal";
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

type DetectedProduct = {
  product_name: string;
  brand?: string | null;
  retailer?: string | null;
  price?: string | null;
  original_product_url?: string | null;
  confidence_score: number;
  extraction_source: string;
  image_url?: string | null;
};

type FullItem = Item & {
  source_platform?: string | null;
  subcategory?: string | null;
  ai_subcategory?: string | null;
  media_format?: string | null;
  travel_details?: Record<string, unknown> | null;
  recipe_nutrition?: RecipeNutrition | null;
  product_brand?: string | null;
  product_price?: string | null;
  product_retailer?: string | null;
  product_category?: string | null;
  product_description?: string | null;
  product_image_url?: string | null;
  affiliate_url?: string | null;
  detected_products?: DetectedProduct[] | null;
  user_override?: boolean | null;
  user_category?: string | null;
  user_folder?: string | null;
  user_subfolder?: string | null;
  original_ai_category?: string | null;
  original_ai_subcategory?: string | null;
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

  const handleBack = () => {
    navigate({ to: "/search" });
  };

  const [editOpen, setEditOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [extracting, setExtracting] = useState(false);

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

  const handleExtractRecipe = async () => {
    if (!item) return;
    setExtracting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      // Build context from existing item data so the AI has something to work with
      const note = item.description
        || item.ai_summary
        || item.title
        || item.url
        || "Extract recipe details from this saved item.";

      const res = await fetch("/api/public/items/recategorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ item_id: item.id, note }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Extraction failed");

      const returned = json.item as { recipe_ingredients?: string[]; recipe_steps?: string[] } | undefined;
      const gotContent =
        (returned?.recipe_ingredients?.length ?? 0) > 0 ||
        (returned?.recipe_steps?.length ?? 0) > 0;

      if (gotContent) {
        toast.success("Recipe details extracted!");
      } else {
        toast.info(
          "Not enough recipe content found. Open the original source or edit this save to add details.",
          { duration: 6000 },
        );
      }

      qc.invalidateQueries({ queryKey: ["item-detail", id] });
      qc.invalidateQueries({ queryKey: ["items"] });
    } catch (err: any) {
      toast.error(err.message || "Could not extract recipe details");
    } finally {
      setExtracting(false);
    }
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

  const isProduct = item.category === "Products" || item.category === "Product";
  const isFashion = item.category === "Fashion";
  const isRecipe = item.category === "Recipes" || item.category === "Recipe";
  const hasProductData = !!(
    item.product_brand ||
    item.product_price ||
    item.product_retailer ||
    item.product_description ||
    item.product_image_url ||
    item.affiliate_url
  );
  const showProductUI = isProduct || isFashion || hasProductData;
  const hasIngredients = Array.isArray(item.recipe_ingredients) && item.recipe_ingredients.length > 0;
  const hasSteps = Array.isArray(item.recipe_steps) && item.recipe_steps.length > 0;
  const hasRecipeContent = hasIngredients || hasSteps;
  const VIDEO_PLATFORMS = new Set(["instagram_reel", "instagram", "tiktok", "youtube", "youtube_short", "vimeo"]);
  const isVideoSave = !!item.source_platform && VIDEO_PLATFORMS.has(item.source_platform);
  const isVideoRecipe = isVideoSave;
  const detectedProducts: DetectedProduct[] = Array.isArray(item.detected_products)
    ? (item.detected_products as unknown as DetectedProduct[])
    : [];
  const hasDetectedProducts = detectedProducts.length > 0;
  const showProductFallback = isVideoSave && (isProduct || isFashion) && !hasDetectedProducts;

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
        onClick={handleBack}
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
        <span className="absolute left-3 top-3 rounded-full bg-card/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary backdrop-blur">
          {typeLabel}
        </span>
      </div>

      {/* ── Title + meta ── */}
      <div className="space-y-1.5 px-0.5">
        {showProductUI && (item.product_brand || item.product_retailer) && (
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {[item.product_brand, item.product_retailer].filter(Boolean).join(" · ")}
          </p>
        )}
        <h1 className="text-xl font-extrabold leading-snug tracking-tight">
          {item.title}
        </h1>
        {showProductUI && item.product_price && (
          <p className="text-2xl font-bold text-primary">{item.product_price}</p>
        )}
        {showProductUI && item.product_description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {item.product_description}
          </p>
        )}
        {showProductUI && (item.affiliate_url || item.url) && (
          <a
            href={item.affiliate_url || item.url!}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-base font-semibold text-primary-foreground shadow-sm hover:opacity-90 active:scale-[0.98] transition mt-1"
          >
            <ShoppingBag className="h-5 w-5" />
            Buy Now
          </a>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground pt-0.5">
          {host && <span className="font-medium">{host}</span>}
          {host && <span aria-hidden>·</span>}
          <span>{formatDate(item.created_at)}</span>
        </div>

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

      {/* ── Detected Products (social video saves) ── */}
      {hasDetectedProducts && (
        <div className="rounded-2xl border border-border/40 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
              <Package className="h-3.5 w-3.5 text-primary" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {detectedProducts.length === 1 ? "Product in this save" : "Products in this save"}
            </p>
          </div>
          <div className="space-y-2.5">
            {detectedProducts.map((dp, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-accent/30 p-3">
                {dp.image_url ? (
                  <img
                    src={dp.image_url}
                    alt={dp.product_name}
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <ShoppingBag className="h-5 w-5 text-muted-foreground/50" />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-snug">{dp.product_name}</p>
                  {(dp.brand || dp.retailer) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[dp.brand, dp.retailer].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {dp.price && (
                    <p className="mt-1 text-sm font-bold text-primary">{dp.price}</p>
                  )}
                </div>
                {dp.original_product_url && (
                  <a
                    href={dp.original_product_url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 active:scale-[0.98] transition"
                  >
                    <ShoppingBag className="h-3 w-3" />
                    View
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Product fallback (video save with Products/Fashion category, no detected products) ── */}
      {showProductFallback && (
        <div className="rounded-2xl border border-border/30 bg-muted/20 p-4 flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <Package className="h-4 w-4 text-muted-foreground" />
          </span>
          <p className="text-sm text-muted-foreground">
            We couldn't identify a specific product from this video yet.
          </p>
        </div>
      )}

      {/* ── Key Takeaways (non-recipe only) ── */}
      {!isRecipe && item.ai_key_takeaways && item.ai_key_takeaways.length > 0 && (
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

      {/* ── Recipe: empty state — video vs web ── */}
      {isRecipe && !hasRecipeContent && (
        isVideoRecipe ? (
          /* Video recipe: ingredients aren't guaranteed to be in caption/transcript */
          <div className="rounded-2xl border border-border/30 bg-muted/20 p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 mt-0.5">
                <UtensilsCrossed className="h-4 w-4 text-orange-400" />
              </span>
              <div>
                <p className="text-sm font-medium">Recipe details couldn't be fully extracted from this video.</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ingredients and instructions are only available when they appear in the caption, description, or transcript.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition"
              >
                <Pencil className="h-3 w-3" />
                Add Recipe Notes
              </button>
              <button
                type="button"
                onClick={handleExtractRecipe}
                disabled={extracting}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <RefreshCw className={`h-3 w-3 ${extracting ? "animate-spin" : ""}`} />
                {extracting ? "Retrying…" : "Retry extraction"}
              </button>
            </div>
          </div>
        ) : (
          /* Web/blog recipe: still being prepared or can be retried */
          <div className="rounded-2xl border border-border/30 bg-muted/20 px-4 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100">
                <UtensilsCrossed className="h-4 w-4 text-orange-400" />
              </span>
              <p className="text-sm text-muted-foreground">
                {extracting ? "Extracting recipe details…" : "Recipe details are still being prepared."}
              </p>
            </div>
            <button
              type="button"
              onClick={handleExtractRecipe}
              disabled={extracting}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <RefreshCw className={`h-3 w-3 ${extracting ? "animate-spin" : ""}`} />
              {extracting ? "Retrying…" : "Retry extraction"}
            </button>
          </div>
        )
      )}

      {/* ── Ingredients ── */}
      {hasIngredients && (
        <div className="rounded-2xl border border-border/40 bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100">
                <UtensilsCrossed className="h-3.5 w-3.5 text-orange-500" />
              </span>
              <p className="text-sm font-semibold">Ingredients</p>
            </div>
            <span className="text-xs text-muted-foreground">{item.recipe_ingredients!.length} items</span>
          </div>
          <ul className="space-y-2">
            {(ingredientsOpen ? item.recipe_ingredients! : item.recipe_ingredients!.slice(0, 5)).map((ing, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {ing}
              </li>
            ))}
          </ul>
          {item.recipe_ingredients!.length > 5 && (
            <button
              onClick={() => setIngredientsOpen(!ingredientsOpen)}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              {ingredientsOpen
                ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</>
                : <><ChevronDown className="h-3.5 w-3.5" /> Show all {item.recipe_ingredients!.length} ingredients</>}
            </button>
          )}
        </div>
      )}

      {/* ── Instructions ── */}
      {hasSteps && (
        <div className="rounded-2xl border border-border/40 bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
                <ChefHat className="h-3.5 w-3.5 text-emerald-600" />
              </span>
              <p className="text-sm font-semibold">Instructions</p>
            </div>
            <span className="text-xs text-muted-foreground">{item.recipe_steps!.length} steps</span>
          </div>
          <ol className="space-y-3.5">
            {item.recipe_steps!.map((step, i) => (
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


      {/* ── Product names (related products mentioned in content) ── */}
      {!isProduct && item.product_names && item.product_names.length > 0 && (
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

        <div className="flex items-center gap-3 border-t border-border/20 px-4 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <Bell className="h-4 w-4 text-amber-500" />
          </span>
          <span className="flex-1 text-sm font-medium">Add Reminder</span>
          <ReminderPicker itemId={item.id} reminderAt={item.reminder_at} />
        </div>

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

        <button
          type="button"
          onClick={() => setMoveOpen(true)}
          className="flex w-full items-center gap-3 border-t border-border/20 px-4 py-3.5 text-left transition hover:bg-accent/20"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100">
            <FolderSymlink className="h-4 w-4 text-violet-600" />
          </span>
          <div className="flex-1">
            <span className="block text-sm font-medium">Move / Organize</span>
            {item.user_folder ? (
              <span className="block text-xs text-muted-foreground">
                {[item.user_category ?? item.type, item.user_folder, item.user_subfolder]
                  .filter(Boolean)
                  .join(" › ")}
              </span>
            ) : null}
          </div>
          <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
        </button>

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
      <MoveOrganizeModal
        item={item}
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        onMoved={() => qc.invalidateQueries({ queryKey: ["item-detail", id] })}
      />
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
