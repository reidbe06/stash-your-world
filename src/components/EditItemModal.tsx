import { useState, useEffect } from "react";
import { X, Check, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, SUBCATEGORY_TAXONOMY } from "@/lib/taxonomy";
import type { Item } from "./ItemCard";

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
}

interface Props {
  item: Item;
  open: boolean;
  onClose: () => void;
}

export function EditItemModal({ item, open, onClose }: Props) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const initialCategory = item.category ?? item.ai_category ?? "";

  const [fields, setFields] = useState<EditFields>({
    title: item.title ?? "",
    category: initialCategory,
    subcategory: item.subcategory ?? "",
    tags: item.tags?.join(", ") ?? "",
    description: item.description ?? "",
    url: item.url ?? "",
  });

  useEffect(() => {
    if (open) {
      setFields({
        title: item.title ?? "",
        category: item.category ?? item.ai_category ?? "",
        subcategory: item.subcategory ?? "",
        tags: item.tags?.join(", ") ?? "",
        description: item.description ?? "",
        url: item.url ?? "",
      });
    }
  }, [open, item.id]);

  const taxonomyKey = CATEGORY_TO_TAXONOMY_KEY[fields.category] ?? "";
  const suggestedSubs: string[] = taxonomyKey ? (SUBCATEGORY_TAXONOMY[taxonomyKey] ?? []) : [];

  const categoryChanged = fields.category !== (item.category ?? item.ai_category ?? "");
  const subcategoryChanged = fields.subcategory !== (item.subcategory ?? "");
  const userEditing = categoryChanged || subcategoryChanged;

  const parseTags = (raw: string): string[] =>
    raw
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
      .filter(Boolean);

  const handleSave = async () => {
    setSaving(true);
    const newType = CATEGORY_TO_TYPE[fields.category] ?? fields.category;
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
      updated_at: now,
    };

    const fullPayload = userEditing
      ? { ...corePayload, user_edited: true, edited_at: now }
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

    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Save updated.");
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["collection-items"] });
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
