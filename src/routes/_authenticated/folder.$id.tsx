import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, Folder, MoreHorizontal, Pencil, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Item } from "@/components/ItemCard";
import { ItemCard } from "@/components/ItemCard";
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

export const Route = createFileRoute("/_authenticated/folder/$id")({
  head: () => ({ meta: [{ title: "Folder — STASHd" }] }),
  component: FolderPage,
});

type FolderRecord = {
  id: string;
  category: string;
  name: string;
  parent_id: string | null;
  source: string; // 'user_created' | 'ai_generated'
  created_at: string;
};

const TILE_STYLE: React.CSSProperties = {
  boxShadow: "0 4px 16px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
  border: "1px solid rgba(0,0,0,0.06)",
};

function FolderPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [manageOpen, setManageOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: folder, isLoading: folderLoading } = useQuery({
    queryKey: ["folder", id],
    enabled: !!user && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("folders")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as FolderRecord;
    },
  });

  const { data: parentFolder } = useQuery({
    queryKey: ["folder", folder?.parent_id],
    enabled: !!folder?.parent_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("folders")
        .select("*")
        .eq("id", folder!.parent_id)
        .single();
      if (error) throw error;
      return data as FolderRecord;
    },
  });

  const { data: subfolders = [] } = useQuery({
    queryKey: ["subfolders", id],
    enabled: !!folder && !folder.parent_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("folders")
        .select("*")
        .eq("parent_id", id)
        .order("name");
      if (error) throw error;
      return data as FolderRecord[];
    },
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: [
      "folder-items", id,
      folder?.name, folder?.category, folder?.parent_id, folder?.source, parentFolder?.name,
    ],
    enabled: !!folder && (folder.parent_id ? !!parentFolder : true),
    queryFn: async () => {
      if (!folder) return [];

      // AI-generated top-level folders: merge native AI items + user-moved items
      if (folder.source === "ai_generated" && !folder.parent_id) {
        const [aiRes, movedRes] = await Promise.all([
          supabase
            .from("items")
            .select("*")
            .eq("type", folder.category)
            .or(`subcategory.eq.${folder.name},ai_subcategory.eq.${folder.name}`)
            .not("user_override", "eq", true)
            .order("created_at", { ascending: false }),
          supabase
            .from("items")
            .select("*")
            .eq("user_category", folder.category)
            .eq("user_folder", folder.name)
            .is("user_subfolder", null)
            .order("created_at", { ascending: false }),
        ]);
        const seen = new Set<string>();
        return [...(aiRes.data ?? []), ...(movedRes.data ?? [])]
          .filter((it) => { if (seen.has(it.id)) return false; seen.add(it.id); return true; })
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as Item[];
      }

      // User-created folders (and subfolders of AI folders)
      let q = supabase
        .from("items")
        .select("*")
        .eq("user_category", folder.category)
        .order("created_at", { ascending: false });

      if (folder.parent_id && parentFolder) {
        q = q
          .eq("user_folder", parentFolder.name)
          .eq("user_subfolder", folder.name);
      } else {
        q = q.eq("user_folder", folder.name).is("user_subfolder", null);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as Item[];
    },
  });

  const handleRename = async () => {
    const name = newName.trim();
    if (!name || !folder) return;
    setSaving(true);
    try {
      const { error: folderErr } = await supabase
        .from("folders")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", folder.id);
      if (folderErr) throw folderErr;

      const field = folder.parent_id ? "user_subfolder" : "user_folder";
      const { error: itemsErr } = await supabase
        .from("items")
        .update({ [field]: name, updated_at: new Date().toISOString() })
        .eq(field, folder.name)
        .eq("user_category", folder.category);
      if (itemsErr) throw itemsErr;

      qc.invalidateQueries({ queryKey: ["folder", id] });
      qc.invalidateQueries({ queryKey: ["folders"] });
      qc.invalidateQueries({ queryKey: ["folder-items"] });
      qc.invalidateQueries({ queryKey: ["items-category"] });
      toast.success("Folder renamed");
      setRenaming(false);
      setNewName("");
      setManageOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Could not rename folder");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!folder) return;
    setDeleting(true);
    try {
      const field = folder.parent_id ? "user_subfolder" : "user_folder";
      await supabase
        .from("items")
        .update({ [field]: null, updated_at: new Date().toISOString() })
        .eq(field, folder.name)
        .eq("user_category", folder.category);

      const { error } = await supabase
        .from("folders")
        .delete()
        .eq("id", folder.id);
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["folders"] });
      qc.invalidateQueries({ queryKey: ["items-category"] });
      toast.success("Folder deleted");

      if (folder.parent_id) {
        navigate({ to: "/folder/$id", params: { id: folder.parent_id } });
      } else {
        navigate({ to: "/category/$type", params: { type: folder.category } });
      }
    } catch (err: any) {
      toast.error(err.message || "Could not delete folder");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (folderLoading || !folder) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-9 w-9 rounded-full bg-[#f0ece8]" />
        <div className="h-8 w-48 rounded bg-[#f0ece8]" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-2xl bg-[#f0ece8]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Back */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (folder.parent_id) {
              navigate({ to: "/folder/$id", params: { id: folder.parent_id } });
            } else {
              navigate({ to: "/category/$type", params: { type: folder.category } });
            }
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white transition"
          style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.08)", border: "1px solid rgba(250,247,242,0.9)" }}
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5 text-[#1a1a1a]" />
        </button>
        <span className="text-[13px] text-[#9a8fa0]">
          {folder.parent_id ? (parentFolder?.name ?? "…") : folder.category}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-[#1a1a1a]">
            {folder.name}
          </h1>
          <p className="mt-1 text-[13px] text-[#9a8fa0]">
            {items.length} save{items.length !== 1 ? "s" : ""}
            {!folder.parent_id && subfolders.length > 0
              ? ` · ${subfolders.length} subfolder${subfolders.length !== 1 ? "s" : ""}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setManageOpen((v) => !v);
            setRenaming(false);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white transition"
          style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.08)", border: "1px solid rgba(250,247,242,0.9)" }}
          aria-label="Manage folder"
        >
          <MoreHorizontal className="h-5 w-5 text-[#6b6375]" />
        </button>
      </div>

      {/* Manage menu */}
      {manageOpen && !renaming && (
        <div className="rounded-2xl border border-border/40 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => {
              setNewName(folder.name);
              setRenaming(true);
              setManageOpen(false);
            }}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-accent/20"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
              <Pencil className="h-4 w-4 text-blue-600" />
            </span>
            <span className="text-sm font-medium">Rename folder</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteOpen(true);
              setManageOpen(false);
            }}
            className="flex w-full items-center gap-3 border-t border-border/20 px-4 py-3.5 text-left transition hover:bg-destructive/5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="h-4 w-4 text-destructive" />
            </span>
            <span className="text-sm font-medium text-destructive">Delete folder</span>
          </button>
        </div>
      )}

      {/* Rename input */}
      {renaming && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
            className="flex-1 rounded-full border border-[#d0c8d8] px-4 py-2.5 text-[15px] font-semibold text-[#1a1a1a] outline-none focus:border-[#FD5897]"
          />
          <button
            type="button"
            onClick={handleRename}
            disabled={!newName.trim() || saving}
            className="rounded-full bg-[#FD5897] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            className="text-[13px] text-[#9a8fa0]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Subfolders (top-level folders only) */}
      {!folder.parent_id && subfolders.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#c8bfd2]">
            Subfolders
          </p>
          <div className="grid grid-cols-2 gap-3">
            {subfolders.map((sf) => (
              <button
                key={sf.id}
                type="button"
                onClick={() =>
                  navigate({ to: "/folder/$id", params: { id: sf.id } })
                }
                className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left transition active:scale-[0.97]"
                style={TILE_STYLE}
              >
                <Folder className="h-5 w-5 shrink-0 text-[#FD5897]" />
                <span className="text-[13px] font-semibold leading-snug text-[#1a1a1a]">
                  {sf.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Items */}
      <div className="space-y-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#c8bfd2]">
          {folder.parent_id ? "Saves" : subfolders.length > 0 ? "Saves (not in a subfolder)" : "Saves"}
        </p>
        {itemsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-[#f0ece8]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Folder className="h-12 w-12 text-[#d8d0e0]" />
            <p className="text-sm text-[#9a8fa0]">
              No saves in this {folder.parent_id ? "subfolder" : "folder"} yet.
            </p>
            <p className="text-xs text-[#b8b0c0]">
              Open any save and tap "Move / Organize" to put it here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Delete dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{folder.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Saves inside will be kept but removed from this folder.
              {!folder.parent_id && " Subfolders will also be deleted."} This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
