import { useState, useEffect } from "react";
import { X, FolderPlus, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<string, string> = {
  Recipe: "Recipes",
  Fashion: "Fashion",
  Product: "Products",
  Home: "Home & Decor",
  Travel: "Travel",
  Tutorial: "Tutorials",
  Fitness: "Workouts",
  Beauty: "Beauty",
  Parenting: "Parenting",
  Business: "Business",
  Entertainment: "Entertainment",
  Other: "Other",
};

const CATEGORY_KEYS = [
  "Recipe", "Fashion", "Product", "Home", "Travel",
  "Tutorial", "Fitness", "Beauty", "Parenting", "Business",
  "Entertainment", "Other",
];

type Folder = {
  id: string;
  category: string;
  name: string;
  parent_id: string | null;
};

type AnyItem = {
  id: string;
  type?: string | null;
  subcategory?: string | null;
  ai_subcategory?: string | null;
  user_override?: boolean | null;
  user_category?: string | null;
  user_folder?: string | null;
  user_subfolder?: string | null;
  original_ai_category?: string | null;
  original_ai_subcategory?: string | null;
};

type Props = {
  item: AnyItem;
  open: boolean;
  onClose: () => void;
  onMoved?: () => void;
};

export function MoveOrganizeModal({ item, open, onClose, onMoved }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const effectiveCategory = item.user_category ?? item.type ?? "";
  const effectiveFolder = item.user_folder ?? null;
  const effectiveSubfolder = item.user_subfolder ?? null;

  const [selectedCategory, setSelectedCategory] = useState(effectiveCategory);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedSubfolderId, setSelectedSubfolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newSubfolderName, setNewSubfolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewSubfolder, setShowNewSubfolder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingSubfolder, setCreatingSubfolder] = useState(false);

  const { data: folders = [], refetch: refetchFolders } = useQuery({
    queryKey: ["folders", selectedCategory],
    enabled: !!selectedCategory && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("folders")
        .select("*")
        .eq("category", selectedCategory)
        .is("parent_id", null)
        .order("name");
      if (error) throw error;
      return data as Folder[];
    },
  });

  const { data: subfolders = [], refetch: refetchSubfolders } = useQuery({
    queryKey: ["subfolders", selectedFolderId],
    enabled: !!selectedFolderId && open,
    queryFn: async () => {
      if (!selectedFolderId) return [];
      const { data, error } = await supabase
        .from("folders")
        .select("*")
        .eq("parent_id", selectedFolderId)
        .order("name");
      if (error) throw error;
      return data as Folder[];
    },
  });

  useEffect(() => {
    if (open) {
      setSelectedCategory(item.user_category ?? item.type ?? "");
      setSelectedFolderId(null);
      setSelectedSubfolderId(null);
      setNewFolderName("");
      setNewSubfolderName("");
      setShowNewFolder(false);
      setShowNewSubfolder(false);
    }
  }, [open]);

  useEffect(() => {
    if (folders.length > 0 && effectiveFolder) {
      const match = folders.find((f) => f.name === effectiveFolder);
      if (match) setSelectedFolderId(match.id);
    }
  }, [folders]);

  useEffect(() => {
    if (subfolders.length > 0 && effectiveSubfolder) {
      const match = subfolders.find((f) => f.name === effectiveSubfolder);
      if (match) setSelectedSubfolderId(match.id);
    }
  }, [subfolders]);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !selectedCategory) return;
    setCreatingFolder(true);
    try {
      const { data, error } = await supabase
        .from("folders")
        .insert({ category: selectedCategory, name, user_id: user?.id })
        .select()
        .single();
      if (error) throw error;
      await refetchFolders();
      setSelectedFolderId(data.id);
      setNewFolderName("");
      setShowNewFolder(false);
      toast.success(`Folder "${name}" created`);
    } catch (err: any) {
      toast.error(err.message || "Could not create folder");
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleCreateSubfolder = async () => {
    const name = newSubfolderName.trim();
    if (!name || !selectedFolderId) return;
    setCreatingSubfolder(true);
    try {
      const { data, error } = await supabase
        .from("folders")
        .insert({ category: selectedCategory, name, parent_id: selectedFolderId, user_id: user?.id })
        .select()
        .single();
      if (error) throw error;
      await refetchSubfolders();
      setSelectedSubfolderId(data.id);
      setNewSubfolderName("");
      setShowNewSubfolder(false);
      toast.success(`Subfolder "${name}" created`);
    } catch (err: any) {
      toast.error(err.message || "Could not create subfolder");
    } finally {
      setCreatingSubfolder(false);
    }
  };

  const handleSave = async () => {
    if (!selectedCategory) return;
    setSaving(true);
    try {
      const selectedFolder = folders.find((f) => f.id === selectedFolderId);
      const selectedSubfolder = subfolders.find((f) => f.id === selectedSubfolderId);

      const updatePayload: Record<string, unknown> = {
        user_category: selectedCategory,
        user_folder: selectedFolder?.name ?? null,
        user_subfolder: selectedSubfolder?.name ?? null,
        user_override: true,
        updated_at: new Date().toISOString(),
      };

      if (!item.original_ai_category) {
        updatePayload.original_ai_category = item.type ?? null;
        updatePayload.original_ai_subcategory =
          item.subcategory ?? item.ai_subcategory ?? null;
      }

      const { error } = await supabase
        .from("items")
        .update(updatePayload)
        .eq("id", item.id);

      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["item-detail", item.id] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["items-category"] });
      qc.invalidateQueries({ queryKey: ["folder-items"] });

      const destLabel = [
        CATEGORY_LABELS[selectedCategory] ?? selectedCategory,
        selectedFolder?.name,
        selectedSubfolder?.name,
      ]
        .filter(Boolean)
        .join(" › ");

      toast.success(`Moved to ${destLabel}`);
      onMoved?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Could not move save");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);
  const selectedSubfolder = subfolders.find((f) => f.id === selectedSubfolderId);

  const destLabel = [
    CATEGORY_LABELS[selectedCategory] ?? selectedCategory,
    selectedFolder?.name,
    selectedSubfolder?.name,
  ]
    .filter(Boolean)
    .join(" › ");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-t-[28px] bg-white shadow-2xl">
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-[#e0dce8]" />
        </div>

        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-[17px] font-bold text-[#1a1a1a]">Move / Organize</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5f0f8]"
          >
            <X className="h-4 w-4 text-[#6b6375]" />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-5 pb-8 space-y-5">
          {/* Step 1: Category */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b0a8b8]">
              Category
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(key);
                    setSelectedFolderId(null);
                    setSelectedSubfolderId(null);
                    setShowNewFolder(false);
                    setShowNewSubfolder(false);
                  }}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                    selectedCategory === key
                      ? "bg-[#FD5897] text-white"
                      : "bg-[#f5f0f8] text-[#5a4e64] hover:bg-[#ede5f5]"
                  }`}
                >
                  {CATEGORY_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Folder */}
          {selectedCategory && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b0a8b8]">
                Folder <span className="normal-case font-normal">(optional)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFolderId(null);
                    setSelectedSubfolderId(null);
                  }}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                    !selectedFolderId
                      ? "bg-[#6b5e79] text-white"
                      : "bg-[#f5f0f8] text-[#5a4e64] hover:bg-[#ede5f5]"
                  }`}
                >
                  No folder
                </button>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setSelectedFolderId(f.id);
                      setSelectedSubfolderId(null);
                    }}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                      selectedFolderId === f.id
                        ? "bg-[#FD5897] text-white"
                        : "bg-[#f5f0f8] text-[#5a4e64] hover:bg-[#ede5f5]"
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
                {!showNewFolder ? (
                  <button
                    type="button"
                    onClick={() => setShowNewFolder(true)}
                    className="flex items-center gap-1.5 rounded-full border border-dashed border-[#d0c8d8] px-3 py-1.5 text-[13px] font-semibold text-[#9a8fa8] transition hover:border-[#FD5897] hover:text-[#FD5897]"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    New folder
                  </button>
                ) : (
                  <div className="flex w-full items-center gap-2 mt-1">
                    <input
                      autoFocus
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                      placeholder="Folder name…"
                      className="flex-1 rounded-full border border-[#d0c8d8] px-3 py-1.5 text-[13px] outline-none focus:border-[#FD5897]"
                    />
                    <button
                      type="button"
                      onClick={handleCreateFolder}
                      disabled={!newFolderName.trim() || creatingFolder}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FD5897] text-white disabled:opacity-40"
                    >
                      {creatingFolder ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewFolder(false);
                        setNewFolderName("");
                      }}
                      className="shrink-0 text-[13px] text-[#9a8fa8]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Subfolder */}
          {selectedFolderId && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b0a8b8]">
                Subfolder <span className="normal-case font-normal">(optional)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSubfolderId(null)}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                    !selectedSubfolderId
                      ? "bg-[#6b5e79] text-white"
                      : "bg-[#f5f0f8] text-[#5a4e64] hover:bg-[#ede5f5]"
                  }`}
                >
                  No subfolder
                </button>
                {subfolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedSubfolderId(f.id)}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                      selectedSubfolderId === f.id
                        ? "bg-[#FD5897] text-white"
                        : "bg-[#f5f0f8] text-[#5a4e64] hover:bg-[#ede5f5]"
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
                {!showNewSubfolder ? (
                  <button
                    type="button"
                    onClick={() => setShowNewSubfolder(true)}
                    className="flex items-center gap-1.5 rounded-full border border-dashed border-[#d0c8d8] px-3 py-1.5 text-[13px] font-semibold text-[#9a8fa8] transition hover:border-[#FD5897] hover:text-[#FD5897]"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    New subfolder
                  </button>
                ) : (
                  <div className="flex w-full items-center gap-2 mt-1">
                    <input
                      autoFocus
                      type="text"
                      value={newSubfolderName}
                      onChange={(e) => setNewSubfolderName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateSubfolder()}
                      placeholder="Subfolder name…"
                      className="flex-1 rounded-full border border-[#d0c8d8] px-3 py-1.5 text-[13px] outline-none focus:border-[#FD5897]"
                    />
                    <button
                      type="button"
                      onClick={handleCreateSubfolder}
                      disabled={!newSubfolderName.trim() || creatingSubfolder}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FD5897] text-white disabled:opacity-40"
                    >
                      {creatingSubfolder ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewSubfolder(false);
                        setNewSubfolderName("");
                      }}
                      className="shrink-0 text-[13px] text-[#9a8fa8]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Destination preview */}
          <div className="rounded-xl bg-[#faf7fc] px-4 py-3 text-[13px] text-[#5a4e64]">
            <span className="font-semibold text-[#3d3346]">Moving to: </span>
            {destLabel || "—"}
          </div>

          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !selectedCategory}
            className="w-full rounded-full bg-[#FD5897] py-3.5 text-[15px] font-bold text-white shadow-lg shadow-[#FD5897]/20 transition active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? "Moving…" : "Move Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
