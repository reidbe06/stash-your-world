import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Item } from "@/components/ItemCard";
import { ItemCard } from "@/components/ItemCard";

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

// Apple Wallet–style tile elevation
const TILE_STYLE: React.CSSProperties = {
  boxShadow: "0 4px 12px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.06)",
  border: "1px solid rgba(250,247,242,0.9)",
};

// ── Collage image — plain img so flex/height inheritance is never broken ──────
function CImg({
  src,
  bgFrom,
  bgTo,
  objectPosition = "center",
}: {
  src: string;
  bgFrom: string;
  bgTo: string;
  objectPosition?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="h-full w-full"
        style={{ background: `linear-gradient(160deg, ${bgFrom}, ${bgTo})` }}
      />
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

// Radial mask centred at the play-button hotspot — placed as a sibling div
// inside each slot so the img itself remains a plain block element.
const PLAY_MASK = {
  background:
    "radial-gradient(ellipse at 50% 50%, rgba(250,247,242,0.58) 0%, rgba(250,247,242,0.22) 30%, transparent 62%)",
} as const;

// ── Gradient slot (placeholder panel inside collage) ──────────────────────────
function GradientSlot({ bgFrom, bgTo }: { bgFrom: string; bgTo: string }) {
  return (
    <div
      className="h-full w-full"
      style={{ background: `linear-gradient(160deg, ${bgFrom}, ${bgTo})` }}
    />
  );
}

// ── 3-image premium collage ────────────────────────────────────────────────────
// Layout: large hero (69%) left + two stacked thumbnails right.
// 0 imgs → gradient; 1 → full bleed; 2 → hero+one+slot; 3+ → hero+two.
function CollageCover({
  images,
  bgFrom,
  bgTo,
  emoji,
}: {
  images: string[];
  bgFrom: string;
  bgTo: string;
  emoji: string;
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
        <div className="relative h-full overflow-hidden" style={{ width: "70%" }}>
          <CImg src={imgs[0]} bgFrom={bgFrom} bgTo={bgTo} objectPosition="center top" />
          <div className="pointer-events-none absolute inset-0" style={PLAY_MASK} />
        </div>
        <div className="flex h-full flex-1 flex-col gap-[2px]">
          <div className="relative flex-1 overflow-hidden">
            <CImg src={imgs[1]} bgFrom={bgFrom} bgTo={bgTo} objectPosition="top" />
            <div className="pointer-events-none absolute inset-0" style={PLAY_MASK} />
          </div>
          <div className="flex-1 overflow-hidden"><GradientSlot bgFrom={bgFrom} bgTo={bgTo} /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full gap-[2px]">
      <div className="relative h-full overflow-hidden" style={{ width: "70%" }}>
        <CImg src={imgs[0]} bgFrom={bgFrom} bgTo={bgTo} objectPosition="center top" />
        <div className="pointer-events-none absolute inset-0" style={PLAY_MASK} />
      </div>
      <div className="flex h-full flex-1 flex-col gap-[2px]">
        <div className="relative flex-1 overflow-hidden">
          <CImg src={imgs[1]} bgFrom={bgFrom} bgTo={bgTo} objectPosition="top" />
          <div className="pointer-events-none absolute inset-0" style={PLAY_MASK} />
        </div>
        <div className="relative flex-1 overflow-hidden">
          <CImg src={imgs[2]} bgFrom={bgFrom} bgTo={bgTo} objectPosition="top" />
          <div className="pointer-events-none absolute inset-0" style={PLAY_MASK} />
        </div>
      </div>
    </div>
  );
}

// ── Subcategory tile ───────────────────────────────────────────────────────────
function SubcategoryTile({
  name,
  count,
  images,
  bgFrom,
  bgTo,
  emoji,
  onClick,
}: {
  name: string;
  count: number;
  images: string[];
  bgFrom: string;
  bgTo: string;
  emoji: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col overflow-hidden rounded-[20px] bg-white text-left transition-transform active:scale-[0.97]"
      style={TILE_STYLE}
    >
      <div className="aspect-[4/3] w-full overflow-hidden">
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

// ── Page ───────────────────────────────────────────────────────────────────────
function CategorySubcategoryPage() {
  const { type } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const meta: CategoryMeta = CATEGORY_META.find((c) => c.key === type) ?? {
    key: type,
    label: type,
    description: `All your ${type.toLowerCase()} saves, organized by AI`,
    emoji: "📌",
    bgFrom: "#FFF0F5",
    bgTo: "#FEF2F8",
  };

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["items-category", user?.id, type],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("type", type)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  // Subcategory map: name → { count, images }
  const subcategories = useMemo(() => {
    const map: Record<string, { count: number; images: string[] }> = {};
    for (const it of items) {
      const sub = (it as any).subcategory ?? (it as any).ai_subcategory ?? null;
      if (!sub) continue;
      if (!map[sub]) map[sub] = { count: 0, images: [] };
      map[sub].count += 1;
      if (it.image_url && map[sub].images.length < 3) map[sub].images.push(it.image_url);
    }
    return Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, data]) => ({ name, ...data }));
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
        (it as any).ai_subcategory?.toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div className="space-y-5">
      {/* Back button */}
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

      {/* AI Collections */}
      {subcategories.length > 0 && !search && (
        <div className="space-y-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#c8bfd2]">
            AI Collections
          </p>
          <div className="grid grid-cols-2 gap-4">
            {subcategories.map(({ name, count, images }) => (
              <SubcategoryTile
                key={name}
                name={name}
                count={count}
                images={images}
                bgFrom={meta.bgFrom}
                bgTo={meta.bgTo}
                emoji={meta.emoji}
                onClick={() => navigate({ to: "/search", search: { type, sub: name } as never })}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: "/search", search: { type } as never })}
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
              {search ? "No saves match your search." : `No ${meta.label.toLowerCase()} saved yet.`}
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
