import { useState, useEffect } from "react";
import { X, Check, Loader2, Plus, FolderOpen, ShoppingBag, ChevronDown, ChevronUp, Link2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CATEGORIES, SUBCATEGORY_TAXONOMY } from "@/lib/taxonomy";
import type { Item } from "./ItemCard";

// Reverse map: system type key → display label.
// Only needed for items that were categorized with the old type-key system.
const TYPE_TO_CATEGORY_LABEL: Record<string, string> = {
  Recipe: "Recipe",
  Fashion: "Fashion",
  Product: "Product",
  Home: "Home",
  Travel: "Travel",
  Tutorial: "Tutorial",
  Fitness: "Fitness",
  Beauty: "Beauty",
  Parenting: "Parenting",
  Business: "Business",
  Entertainment: "Entertainment",
  Other: "Other",
};

// Map display label → type key for system categories.
// Custom user categories fall through to the identity fallback.
const CATEGORY_TO_TYPE: Record<string, string> = {
  Recipes: "Recipe",
  Fashion: "Fashion",
  Products: "Product",
  Home: "Home",
  Travel: "Travel",
  Fitness: "Fitness",
  Beauty: "Beauty",
  Parenting: "Parenting",
  "Business Ideas": "Business",
  "Shopping Deals": "Product",
  Entertainment: "Entertainment",
  Videos: "Entertainment",
  Education: "Tutorial",
  Other: "Other",
  "Needs Review": "Other",
  Uncategorized: "Other",
};

const CATEGORY_TO_TAXONOMY_KEY: Record<string, string> = {
  Recipes: "Recipe",
  Fashion: "Fashion",
  Products: "Product",
  Home: "Home",
  Travel: "Travel",
  Fitness: "Fitness",
  Beauty: "Beauty",
  Parenting: "Parenting",
  "Business Ideas": "Business",
  "Shopping Deals": "Product",
  Entertainment: "Entertainment",
  Videos: "Entertainment",
  Education: "Tutorial",
};

const SHOWN_CATEGORIES = (CATEGORIES as readonly string[]).filter(
  (c) => !["Needs Review", "Uncategorized", "Videos"].includes(c),
);

interface EditFields {
  title: string;
  category: string;
  subcategory: string;
  tags: string;
  description: string;
  url: string;
  product_name: string;
  product_brand: string;
  product_retailer: string;
  product_price: string;
  product_url: string;
  affiliate_url: string;
  is_shoppable: boolean;
}

interface Props {
  item: Item;
  open: boolean;
  onClose: () => void;
}

export function EditItemModal({ item, open, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [productOpen, setProductOpen] = useState(false);

  // When the user has manually moved a save, show the effective location —
  // not the original AI-assigned category that may still sit in item.category.
  const effectiveCategory = item.user_override && item.user_category
    ? (TYPE_TO_CATEGORY_LABEL[item.user_category] ?? item.user_category)
    : (item.category ?? item.type ?? item.ai_category ?? "");
  const effectiveSubcategory = item.user_override
    ? (item.user_folder ?? "")
    : (item.subcategory ?? "");

  const [fields, setFields] = useState<EditFields>({
    title: item.title ?? "",
    category: effectiveCategory,
    subcategory: effectiveSubcategory,
    tags: item.tags?.join(", ") ?? "",
    description: item.description ?? "",
    url: item.url ?? "",
    product_name: item.product_name ?? "",
    product_brand: item.product_brand ?? "",
    product_retailer: item.product_retailer ?? "",
    product_price: item.product_price ?? "",
    product_url: item.product_url ?? "",
    affiliate_url: item.affiliate_url ?? "",
    is_shoppable: item.is_shoppable ?? false,
  });

  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string> | null>(null);
  const [newColName, setNewColName] = useState("");
  const [creatingCol, setCreatingCol] = useState(false);

  const { data: collections } = useQuery({
    queryKey: ["collections", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("id,name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: userCats = [] } = useQuery<{ id: string; name: string; emoji: string }[]>({
    queryKey: ["user-categories", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_categories")
        .select("id,name,emoji")
        .order("created_at", { ascending: true });
      return (data ?? []) as { id: string; name: string; emoji: string }[];
    },
  });

  const { data: currentMemberships } = useQuery({
    queryKey: ["item-collections", item.id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("item_collections")
        .select("collection_id")
        .eq("item_id", item.id);
      return new Set((data ?? []).map((r) => r.collection_id));
    },
  });

  useEffect(() => {
    if (open) {
      const effCat = item.user_override && item.user_category
        ? (TYPE_TO_CATEGORY_LABEL[item.user_category] ?? item.user_category)
        : (item.category ?? item.type ?? item.ai_category ?? "");
      const effSub = item.user_override
        ? (item.user_folder ?? "")
        : (item.subcategory ?? "");
      setFields({
        title: item.title ?? "",
        category: effCat,
        subcategory: effSub,
        tags: item.tags?.join(", ") ?? "",
        description: item.description ?? "",
        url: item.url ?? "",
        product_name: item.product_name ?? "",
        product_brand: item.product_brand ?? "",
        product_retailer: item.product_retailer ?? "",
        product_price: item.product_price ?? "",
        product_url: item.product_url ?? "",
        affiliate_url: item.affiliate_url ?? "",
        is_shoppable: item.is_shoppable ?? false,
      });
      setNewColName("");
      setSelectedCollectionIds(null);
    }
  }, [open, item.id]);

  useEffect(() => {
    if (open && currentMemberships && selectedCollectionIds === null) {
      setSelectedCollectionIds(new Set(currentMemberships));
    }
  }, [open, currentMemberships]);

  const toggleCollection = (colId: string) => {
    setSelectedCollectionIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return next;
    });
  };

  const createCollection = async () => {
    const name = newColName.trim();
    if (!name || !user || creatingCol) return;
    setCreatingCol(true);

    const { data: col, error } = await supabase
      .from("collections")
      .insert({ user_id: user.id, name })
      .select("id,name")
      .single();

    if (error || !col) {
      toast.error(error?.message ?? "Failed to create collection");
    } else {
      setSelectedCollectionIds((prev) => new Set([...(prev ?? []), col.id]));
      setNewColName("");
      qc.invalidateQueries({ queryKey: ["collections"] });
    }
    setCreatingCol(false);
  };

  // For system categories, look up taxonomy subcategories.
  // Custom user categories don't have taxonomy subcategories.
  const taxonomyKey = CATEGORY_TO_TAXONOMY_KEY[fields.category] ?? fields.category;
  const suggestedSubs: string[] = taxonomyKey ? (SUBCATEGORY_TAXONOMY[taxonomyKey] ?? []) : [];

  const categoryChanged = fields.category !== effectiveCategory;
  const subcategoryChanged = fields.subcategory !== effectiveSubcategory;
  const userEditing = categoryChanged || subcategoryChanged;

  const parseTags = (raw: string): string[] =>
    raw
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
      .filter(Boolean);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    // For user-created categories the name IS the type key (e.g., "Cleaning").
    // For system categories, map display label → type key.
    const isUserCat = userCats.some((c) => c.name === fields.category);
    const newType = isUserCat
      ? fields.category
      : (CATEGORY_TO_TYPE[fields.category] ?? fields.category);

    const parsedTags = parseTags(fields.tags);
    const now = new Date().toISOString();

    const corePayload: Record<string, unknown> = {
      title: fields.title.trim() || item.title,
      category: fields.category || null,
      type: newType,
      subcategory: fields.subcategory.trim() || null,
      tags: parsedTags,
      description: fields.description.trim() || null,
      url: fields.url.trim() || null,
      product_name: fields.product_name.trim() || null,
      product_brand: fields.product_brand.trim() || null,
      product_retailer: fields.product_retailer.trim() || null,
      product_price: fields.product_price.trim() || null,
      product_url: fields.product_url.trim() || null,
      affiliate_url: fields.affiliate_url.trim() || null,
      is_shoppable: fields.is_shoppable,
      updated_at: now,
    };

    // When user manually picks a custom category, lock it so AI re-extract
    // won't overwrite it (user_override = true).
    // For system categories, just update type/category directly.
    const overrideFields: Record<string, unknown> = isUserCat
      ? { user_override: true, user_category: newType, user_folder: null }
      : {};

    const fullPayload = userEditing
      ? { ...corePayload, ...overrideFields, user_edited: true, edited_at: now }
      : corePayload;

    let { error } = await supabase
      .from("items")
      .update(fullPayload as any)
      .eq("id", item.id);

    if (error?.message?.includes("user_edited") || error?.message?.includes("edited_at")) {
      const fallback = await supabase
        .from("items")
        .update(corePayload as any)
        .eq("id", item.id);
      error = fallback.error;
    }

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    if (selectedCollectionIds !== null && currentMemberships !== undefined) {
      const toAdd = [...selectedCollectionIds].filter((id) => !currentMemberships.has(id));
      const toRemove = [...currentMemberships].filter((id) => !selectedCollectionIds.has(id));

      if (toAdd.length > 0) {
        await supabase.from("item_collections").insert(
          toAdd.map((cid) => ({ user_id: user.id, item_id: item.id, collection_id: cid })),
        );
      }
      if (toRemove.length > 0) {
        await supabase
          .from("item_collections")
          .delete()
          .eq("item_id", item.id)
          .in("collection_id", toRemove);
      }
    }

    setSaving(false);
    toast.success("Save updated.");
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["collection-items"] });
    qc.invalidateQueries({ queryKey: ["item-collections", item.id] });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-card shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <h2 className="font-bold text-base">Edit Save</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5 overflow-y-auto">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Title
            </label>
            <input
              type="text"
              value={fields.title}
              onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Category
            </label>
            <select
              value={fields.category}
              onChange={(e) =>
                setFields((f) => ({ ...f, category: e.target.value, subcategory: "" }))
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="">— Select category —</option>
              {SHOWN_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {userCats.length > 0 && (
                <>
                  <option disabled>──────────────</option>
                  <option disabled style={{ fontWeight: 600, color: "#FD5897" }}>
                    My Categories
                  </option>
                  {userCats.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Subcategory
            </label>
            <input
              type="text"
              value={fields.subcategory}
              onChange={(e) => setFields((f) => ({ ...f, subcategory: e.target.value }))}
              placeholder="e.g. Dresses, Lunch, Hotels…"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {suggestedSubs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestedSubs.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFields((f) => ({ ...f, subcategory: s }))}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                      fields.subcategory === s
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tags
              <span className="ml-1 font-normal normal-case text-muted-foreground/60">
                (comma-separated)
              </span>
            </label>
            <input
              type="text"
              value={fields.tags}
              onChange={(e) => setFields((f) => ({ ...f, tags: e.target.value }))}
              placeholder="fashion, summer, floral"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {parseTags(fields.tags).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {parseTags(fields.tags).map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </label>
            <textarea
              value={fields.description}
              onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Any notes about this save…"
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Source URL
            </label>
            <input
              type="url"
              value={fields.url}
              onChange={(e) => setFields((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://…"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* ── Product Links (always visible) ── */}
          <div className="rounded-xl border border-border bg-background px-4 py-4 space-y-3">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Link2 className="h-3.5 w-3.5" />
              Product Links
            </p>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                Product URL
              </label>
              <input
                type="url"
                value={fields.product_url}
                onChange={(e) => setFields((f) => ({ ...f, product_url: e.target.value }))}
                placeholder="https://shop.example.com/product"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                Affiliate URL
              </label>
              <input
                type="url"
                value={fields.affiliate_url}
                onChange={(e) => setFields((f) => ({ ...f, affiliate_url: e.target.value }))}
                placeholder="https://go.affiliate.com/…"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* ── Product Details ── */}
          <div className="rounded-xl border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setProductOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-accent/40"
            >
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <ShoppingBag className="h-3.5 w-3.5" />
                Product Details
                {fields.is_shoppable && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary normal-case tracking-normal">
                    Shoppable
                  </span>
                )}
              </span>
              {productOpen
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
              }
            </button>

            {productOpen && (
              <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={fields.product_name}
                    onChange={(e) => setFields((f) => ({ ...f, product_name: e.target.value }))}
                    placeholder="e.g. Laneige Lip Mask"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Brand
                    </label>
                    <input
                      type="text"
                      value={fields.product_brand}
                      onChange={(e) => setFields((f) => ({ ...f, product_brand: e.target.value }))}
                      placeholder="e.g. Laneige"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Retailer
                    </label>
                    <input
                      type="text"
                      value={fields.product_retailer}
                      onChange={(e) => setFields((f) => ({ ...f, product_retailer: e.target.value }))}
                      placeholder="e.g. Amazon"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Price
                  </label>
                  <input
                    type="text"
                    value={fields.product_price}
                    onChange={(e) => setFields((f) => ({ ...f, product_price: e.target.value }))}
                    placeholder="e.g. $24.99"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border bg-accent/20 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Mark as Shoppable</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Shows Buy Now button on this save</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFields((f) => ({ ...f, is_shoppable: !f.is_shoppable }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                      fields.is_shoppable ? "bg-primary" : "bg-muted"
                    }`}
                    role="switch"
                    aria-checked={fields.is_shoppable}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                        fields.is_shoppable ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <FolderOpen className="h-3.5 w-3.5" />
              Collections
            </label>

            {!collections || collections.length === 0 ? (
              <p className="text-xs text-muted-foreground">No collections yet. Create one below.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {collections.map((col) => {
                  const active = selectedCollectionIds?.has(col.id) ?? false;
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => toggleCollection(col.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                      }`}
                    >
                      {active && <Check className="h-3 w-3" />}
                      {col.name}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createCollection()}
                placeholder="New collection…"
                disabled={creatingCol}
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
              <button
                type="button"
                onClick={createCollection}
                disabled={!newColName.trim() || creatingCol}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                aria-label="Create collection"
              >
                {creatingCol ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-5 py-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-gradient py-3 text-sm font-semibold text-primary-foreground shadow-brand transition hover:opacity-90 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
