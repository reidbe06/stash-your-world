import { useState } from "react";
import { X, Plus, Check, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Item } from "./ItemCard";

interface Props {
  item: Item;
  open: boolean;
  onClose: () => void;
}

export function CollectionQuickAdd({ item, open, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newColName, setNewColName] = useState("");
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

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

  const { data: memberSet, refetch } = useQuery({
    queryKey: ["item-collections", item.id],
    enabled: !!user && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("item_collections")
        .select("collection_id")
        .eq("item_id", item.id);
      return new Set((data ?? []).map((r) => r.collection_id));
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["collection-items"] });
    qc.invalidateQueries({ queryKey: ["item-collections", item.id] });
  };

  const toggle = async (colId: string, colName: string) => {
    if (!user || toggling) return;
    setToggling(colId);
    const inCollection = memberSet?.has(colId) ?? false;

    if (inCollection) {
      const { error } = await supabase
        .from("item_collections")
        .delete()
        .eq("item_id", item.id)
        .eq("collection_id", colId);
      if (error) toast.error(error.message);
      else { toast.success(`Removed from "${colName}"`); invalidate(); await refetch(); }
    } else {
      const { error } = await supabase
        .from("item_collections")
        .insert({ user_id: user.id, item_id: item.id, collection_id: colId });
      if (error) toast.error(error.message);
      else { toast.success(`Added to "${colName}".`); invalidate(); await refetch(); }
    }
    setToggling(null);
  };

  const createAndAdd = async () => {
    const name = newColName.trim();
    if (!name || !user || creating) return;
    setCreating(true);

    const { data: col, error: createErr } = await supabase
      .from("collections")
      .insert({ user_id: user.id, name })
      .select("id,name")
      .single();

    if (createErr || !col) {
      toast.error(createErr?.message ?? "Failed to create collection");
      setCreating(false);
      return;
    }

    const { error: addErr } = await supabase
      .from("item_collections")
      .insert({ user_id: user.id, item_id: item.id, collection_id: col.id });

    if (addErr) toast.error(addErr.message);
    else {
      toast.success(`Created "${col.name}" and added item.`);
      setNewColName("");
      qc.invalidateQueries({ queryKey: ["collections"] });
      invalidate();
      await refetch();
    }
    setCreating(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-card shadow-2xl overflow-hidden flex flex-col max-h-[80dvh]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div>
            <h2 className="font-bold text-base">Add to Collection</h2>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.title}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {!collections || collections.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No collections yet. Create one below.
            </p>
          ) : (
            collections.map((col) => {
              const active = memberSet?.has(col.id) ?? false;
              const loading = toggling === col.id;
              return (
                <button
                  key={col.id}
                  onClick={() => toggle(col.id, col.name)}
                  disabled={!!toggling}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
                    active ? "bg-primary/10" : "hover:bg-accent"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
                      active ? "border-primary bg-primary" : "border-border"
                    }`}
                  >
                    {loading ? (
                      <Loader2 className="h-3 w-3 animate-spin text-primary-foreground" />
                    ) : active ? (
                      <Check className="h-3 w-3 text-primary-foreground" />
                    ) : null}
                  </span>
                  <span className={`text-sm font-medium ${active ? "text-primary" : ""}`}>
                    {col.name}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
              placeholder="New collection name…"
              disabled={creating}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <button
              onClick={createAndAdd}
              disabled={!newColName.trim() || creating}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              aria-label="Create collection"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
