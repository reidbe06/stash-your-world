import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Search, FolderPlus, Folder, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Item } from "@/components/ItemCard";
import { ItemCard } from "@/components/ItemCard";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/category/$type")({
  head: () => ({ meta: [{ title: "Category — STASHd" }] }),
  component: CategorySubcategoryPage,
});

type CategoryMeta = {
  key: string;
  label: string;
  description: string;
  emoji: string;
  bgFrom: string;
  bgTo: string;
};

const CATEGORY_META: CategoryMeta[] = [
  { key: "Recipe",    label: "Recipes",      description: "All your recipe finds, organized by AI",      emoji: "🍝", bgFrom: "#FFF3E8", bgTo: "#FFF9F2" },
  { key: "Fashion",   label: "Fashion",      description: "All your fashion finds, organized by AI",      emoji: "👗", bgFrom: "#F5EEFF", bgTo: "#FEF2F8" },
  { key: "Travel",    label: "Travel",       description: "All your travel inspiration, organized by AI", emoji: "✈️", bgFrom: "#E8F5FF", bgTo: "#F0FAF5" },
  { key: "Product",   label: "Products",     description: "All your product saves, organized by AI",      emoji: "🛍️", bgFrom: "#EBF0FF", bgTo: "#F3F8FF" },
  { key: "Fitness",   label: "Workouts",     description: "All your workout saves, organized by AI",      emoji: "🏃", bgFrom: "#EDFAED", bgTo: "#F4FFF0" },
  { key: "Home",      label: "Home & Decor", description: "All your home inspiration, organized by AI",   emoji: "🏡", bgFrom: "#FFF8E1", bgTo: "#FFFBF0" },
  { key: "Beauty",    label: "Beauty",       description: "All your beauty finds, organized by AI",       emoji: "✨", bgFrom: "#FFF0F5", bgTo: "#FFF5FA" },
  { key: "Tutorial",  label: "Tutorials",    description: "All your tutorial saves, organized by AI",     emoji: "💡", bgFrom: "#F0EEFF", bgTo: "#F6F3FF" },
  { key: "Business",  label: "Business",     description: "All your business saves, organized by AI",     emoji: "💼", bgFrom: "#F5F5F0", bgTo: "#FAFAF7" },
  { key: "Parenting", label: "Parenting",    description: "All your parenting saves, organized by AI",    emoji: "👶", bgFrom: "#FFF0F0", bgTo: "#FFF7F7" },
];

const TILE_STYLE: React.CSSProperties = {
  boxShadow: "0 8px 24px rgba(0,0,0,0.06), 0 20px 40px rgba(0,0,0,0.08)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const VIDEO_PLATFORMS = new Set(["tiktok", "instagram_reel", "youtube", "youtube_short"]);

function heroScore(it: { type: string; source_platform?: string }): number {
  if (VIDEO_PLATFORMS.has((it as any).source_platform ?? "")) return 2;
  if (it.type === "Product") return 0;
  return 1;
}

function CImg({
  src, bgFrom, bgTo, objectPosition = "center",
}: {
  src: string; bgFrom: string; bgTo: string; objectPosition?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="h-full w-full" style={{ background: `linear-gradient(160deg, ${bgFrom}, ${bgTo})` }} />
    );
  }
  return (
    <img
      src={src}
      className="h-full w-full object-cover"
      style={{ objectPosition }}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function GradientSlot({ bgFrom, bgTo }: { bgFrom: string; bgTo: string }) {
  return (
    <div className="h-full w-full" style={{ background: `linear-gradient(160deg, ${bgFrom}, ${bgTo})` }} />
  );
}

function CollageCover({
  images, bgFrom, bgTo, emoji,
}: {
  images: string[]; bgFrom: string; bgTo: string; emoji: string;
}) {
  const imgs = images.slice(0, 3);

  if (imgs.length === 0) {
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ background: `linear-gradient(160deg, ${bgFrom}, ${bgTo})` }}
      >
        <span className="select-none text-4xl leading-none opacity-40">{emoji}</span>
      </div>
    );
  }

  if (imgs.length === 1) {
    return (
      <div className="h-full w-full overflow-hidden">
        <CImg src={imgs[0]} bgFrom={bgFrom} bgTo={bgTo} />
      </div>
    );
  }

  if (imgs.length === 2) {
    return (
      <div className="flex h-full w-full gap-[2px]">
        <div className="h-full overflow-hidden" style={{ width: "65%" }}>
          <CImg src={imgs[0]} bgFrom={bgFrom} bgTo={bgTo} />
        </div>
        <div className="flex h-full flex-1 flex-col gap-[2px]">
          <div className="flex-1 overflow-hidden">
            <CImg src={imgs[1]} bgFrom={bgFrom} bgTo={bgTo} />
          </div>
          <div className="flex-1 overflow-hidden">
            <GradientSlot bgFrom={bgFrom} bgTo={bgTo} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full gap-[2px]">
      <div className="h-full overflow-hidden" style={{ width: "65%" }}>
        <CImg src={imgs[0]} bgFrom={bgFrom} bgTo={bgTo} />
      </div>
      <div className="flex h-full flex-1 flex-col gap-[2px]">
        <div className="flex-1 overflow-hidden">
          <CImg src={imgs[1]} bgFrom={bgFrom} bgTo={bgTo} />
        </div>
        <div className="flex-1 overflow-hidden">
          <CImg src={imgs[2]} bgFrom={bgFrom} bgTo={bgTo} />
        </div>
      </div>
    </div>
  );
}

function SubcategoryTile({
  name, count, images, bgFrom, bgTo, emoji, onClick,
}: {
  name: string; count: number; images: string[];
  bgFrom: string; bgTo: string; emoji: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col overflow-hidden rounded-[20px] bg-white text-left transition-transform active:scale-[0.97]"
      style={TILE_STYLE}
    >
      <div className="aspect-[16/9] w-full overflow-hidden">
        <CollageCover images={images} bgFrom={bgFrom} bgTo={bgTo} emoji={emoji} />
      </div>
      <div className="px-3.5 pb-3.5 pt-3">
        <p className="text-[13px] font-bold leading-snug text-[#1a1a1a]">{name}</p>
        <p className="mt-[3px] text-[11px] font-medium text-[#b0a5b8]">
          {count} save{count !== 1 ? "s" : ""}
        </p>
      </div>
    </button>
  );
}


type FolderRecord = {
  id: string;
  category: string;
  name: string;
  parent_id: string | null;
};

function CategorySubcategoryPage() {
  const { type } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const meta: CategoryMeta = CATEGORY_META.find((c) => c.key === type) ?? {
    key: type,
    label: type,
    description: `All your ${type.toLowerCase()} saves, organized by AI`,
    emoji: "📌",
    bgFrom: "#FFF0F5",
    bgTo: "#FEF2F8",
  };

  // Items: native (type = X, not overridden) + moved (user_category = X)
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["items-category", user?.id, type],
    enabled: !!user,
    queryFn: async () => {
      const [nativeRes, movedRes] = await Promise.all([
        supabase
          .from("items")
          .select("*")
          .eq("type", type)
          .is("user_category", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("items")
          .select("*")
          .eq("user_category", type)
          .order("created_at", { ascending: false }),
      ]);
      const all = [
        ...(nativeRes.data ?? []),
        ...(movedRes.data ?? []),
      ] as Item[];
      return all.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    },
  });

  // User-created folders for this category
  const { data: folders = [], refetch: refetchFolders } = useQuery({
    queryKey: ["folders", type],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("folders")
        .select("*")
        .eq("category", type)
        .is("parent_id", null)
        .order("name");
      if (error) throw error;
      return data as FolderRecord[];
    },
  });

  // Per-folder item counts and cover images derived from items
  const folderStats = useMemo(() => {
    const map: Record<string, { count: number; images: string[] }> = {};
    for (const f of folders) {
      const folderItems = items.filter(
        (it) => (it as any).user_folder === f.name,
      );
      map[f.id] = {
        count: folderItems.length,
        images: folderItems
          .filter((it) => it.image_url)
          .sort((a, b) => heroScore(b) - heroScore(a))
          .slice(0, 3)
          .map((it) => it.image_url as string),
      };
    }
    return map;
  }, [folders, items]);

  // AI subcategory groups — exclude items the user has explicitly relocated
  const subcategories = useMemo(() => {
    const map: Record<string, { count: number; candidates: Item[] }> = {};
    for (const it of items) {
      if ((it as any).user_override) continue; // user relocated — don't show in AI bucket
      const sub =
        (it as any).subcategory ?? (it as any).ai_subcategory ?? null;
      if (!sub) continue;
      if (!map[sub]) map[sub] = { count: 0, candidates: [] };
      map[sub].count += 1;
      if (it.image_url && map[sub].candidates.length < 6)
        map[sub].candidates.push(it);
    }
    return Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, { count, candidates }]) => ({
        name,
        count,
        images: candidates
          .sort((a, b) => heroScore(b) - heroScore(a))
          .slice(0, 3)
          .map((it) => it.image_url as string),
      }));
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(
      (it) =>
        it.title?.toLowerCase().includes(q) ||
        it.description?.toLowerCase().includes(q) ||
        it.tags?.some((t) => t.toLowerCase().includes(q)) ||
        (it as any).subcategory?.toLowerCase().includes(q) ||
        (it as any).ai_subcategory?.toLowerCase().includes(q) ||
        (it as any).user_folder?.toLowerCase().includes(q) ||
        (it as any).user_subfolder?.toLowerCase().includes(q),
    );
  }, [items, search]);

  // Unified collection items: user folders first, then AI subcategories
  const allCollections = useMemo(() => {
    const folderItems = folders.map((f) => {
      const stats = folderStats[f.id] ?? { count: 0, images: [] };
      return {
        key: `folder-${f.id}`,
        name: f.name,
        count: stats.count,
        images: stats.images,
        onClick: () => navigate({ to: "/folder/$id", params: { id: f.id } }),
      };
    });
    const subItems = subcategories.map((s) => ({
      key: `sub-${s.name}`,
      name: s.name,
      count: s.count,
      images: s.images,
      onClick: () =>
        navigate({ to: "/category/$type/$sub", params: { type, sub: s.name } }),
    }));
    return [...folderItems, ...subItems];
  }, [folders, folderStats, subcategories]);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !user) return;
    setCreatingFolder(true);
    try {
      const { error } = await supabase
        .from("folders")
        .insert({ category: type, name, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      await refetchFolders();
      setNewFolderName("");
      setShowNewFolder(false);
      toast.success(`"${name}" added to Collections`);
    } catch (err: any) {
      toast.error(err.message || "Could not create folder");
    } finally {
      setCreatingFolder(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Back */}
      <button
        type="button"
        onClick={() => navigate({ to: "/dashboard" })}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white transition"
        style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.08)", border: "1px solid rgba(250,247,242,0.9)" }}
        aria-label="Back"
      >
        <ChevronLeft className="h-5 w-5 text-[#1a1a1a]" />
      </button>

      {/* Header */}
      <div>
        <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-[#1a1a1a]">
          {meta.label}
        </h1>
        <p className="mt-1 text-[13px] text-[#9a8fa0]">{meta.description}</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c8bfcf]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${meta.label.toLowerCase()}…`}
          className="w-full rounded-full bg-white py-3 pl-11 pr-4 text-sm text-[#1a1a1a] placeholder:text-[#b0a8b2] outline-none focus:ring-2 focus:ring-[#FD5897]/10"
          style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.05)", border: "1px solid rgba(250,247,242,0.95)" }}
        />
      </div>

      {/* Unified Collections — user folders + AI subcategories in one grid */}
      {(allCollections.length > 0 || showNewFolder) && !search && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#c8bfd2]">
              {meta.label} Collections
            </p>
            {!showNewFolder && (
              <button
                type="button"
                onClick={() => setShowNewFolder(true)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold text-[#FD5897] transition hover:bg-[#FD5897]/5"
                style={{ border: "1px solid rgba(253,88,151,0.2)" }}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                New Folder
              </button>
            )}
          </div>

          {/* Inline new-folder input */}
          {showNewFolder && (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                placeholder="Folder name…"
                className="flex-1 rounded-full border border-[#d0c8d8] px-4 py-2.5 text-[14px] font-semibold text-[#1a1a1a] outline-none focus:border-[#FD5897]"
              />
              <button
                type="button"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || creatingFolder}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FD5897] text-white disabled:opacity-40"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}
                className="shrink-0 text-[13px] text-[#9a8fa0]"
              >
                Cancel
              </button>
            </div>
          )}

          {allCollections.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {allCollections.map((c) => (
                <SubcategoryTile
                  key={c.key}
                  name={c.name}
                  count={c.count}
                  images={c.images}
                  bgFrom={meta.bgFrom}
                  bgTo={meta.bgTo}
                  emoji={meta.emoji}
                  onClick={c.onClick}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() =>
              navigate({ to: "/search", search: { type } as never })
            }
            className="w-full rounded-full py-2.5 text-sm font-semibold text-[#FD5897] transition hover:bg-[#FD5897]/5"
            style={{ border: "1px solid rgba(253,88,151,0.2)" }}
          >
            View all {items.length} {meta.label} →
          </button>
        </div>
      )}

      {/* All Saves */}
      <div className="space-y-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#c8bfd2]">
          {search ? `Results (${filteredItems.length})` : "All Saves"}
        </p>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-[#f0ece8]" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="text-5xl opacity-50">{meta.emoji}</span>
            <p className="text-sm text-[#9a8fa0]">
              {search
                ? "No saves match your search."
                : `No ${meta.label.toLowerCase()} saved yet.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
