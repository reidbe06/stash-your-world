import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/hooks/useProfile";
import type { Item } from "@/components/ItemCard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "My Stash — STASHd" }] }),
  component: Dashboard,
});

// ── Category definitions ───────────────────────────────────────────────────────
type CategoryDef = {
  key: string;
  label: string;
  emoji: string;
  bgFrom: string;
  bgTo: string;
  match: (it: Item) => boolean;
};

const CATEGORIES: CategoryDef[] = [
  { key: "Recipe",    label: "Recipes",   emoji: "🍝", bgFrom: "#FFF3E8", bgTo: "#FFF9F2", match: (it) => it.type === "Recipe"   },
  { key: "Fashion",   label: "Fashion",   emoji: "👗", bgFrom: "#F5EEFF", bgTo: "#FEF2F8", match: (it) => it.type === "Fashion"  },
  { key: "Travel",    label: "Travel",    emoji: "✈️", bgFrom: "#E8F5FF", bgTo: "#F0FAF5", match: (it) => it.type === "Travel"   },
  { key: "Product",   label: "Products",  emoji: "🛍️", bgFrom: "#EBF0FF", bgTo: "#F3F8FF", match: (it) => it.type === "Product"  },
  { key: "Fitness",   label: "Workouts",  emoji: "🏃", bgFrom: "#EDFAED", bgTo: "#F4FFF0", match: (it) => it.type === "Fitness"  },
  { key: "Home",      label: "Home",      emoji: "🏡", bgFrom: "#FFF8E1", bgTo: "#FFFBF0", match: (it) => it.type === "Home"     },
  { key: "Beauty",    label: "Beauty",    emoji: "✨", bgFrom: "#FFF0F5", bgTo: "#FFF5FA", match: (it) => it.type === "Beauty"   },
  { key: "Tutorial",  label: "Tutorials", emoji: "💡", bgFrom: "#F0EEFF", bgTo: "#F6F3FF", match: (it) => it.type === "Tutorial" },
  { key: "Business",  label: "Business",  emoji: "💼", bgFrom: "#F5F5F0", bgTo: "#FAFAF7", match: (it) => it.type === "Business" },
  { key: "Parenting", label: "Parenting", emoji: "👶", bgFrom: "#FFF0F0", bgTo: "#FFF7F7", match: (it) => it.type === "Parenting"},
];

// Apple Wallet–style card elevation — layered soft shadows + warm cream border
const TILE_STYLE: React.CSSProperties = {
  boxShadow: "0 4px 12px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.06)",
  border: "1px solid rgba(250,247,242,0.9)",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getFirstName(profile: any, email?: string | null): string {
  if (profile?.full_name) return profile.full_name.split(" ")[0];
  if (profile?.username) return profile.username;
  if (email) return email.split("@")[0];
  return "there";
}

// ── Single collage image with warm fallback ────────────────────────────────────
function CImg({ src, bgFrom, bgTo }: { src: string; bgFrom: string; bgTo: string }) {
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
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

// ── Gradient placeholder panel ─────────────────────────────────────────────────
function GradientSlot({ bgFrom, bgTo, emoji, large }: {
  bgFrom: string; bgTo: string; emoji: string; large?: boolean;
}) {
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: `linear-gradient(160deg, ${bgFrom}, ${bgTo})` }}
    >
      {large && (
        <span className="text-5xl leading-none opacity-40 select-none">{emoji}</span>
      )}
    </div>
  );
}

// ── Collage cover ──────────────────────────────────────────────────────────────
// Premium 3-image layout: 1 large hero (70%) left + 2 stacked thumbnails right.
// Gracefully degrades: 0→gradient, 1→full bleed, 2→hero+one, 3+→hero+two.
// No play icons, no video UI — images only.
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

  // ── 0 images ──
  if (imgs.length === 0) {
    return <GradientSlot bgFrom={bgFrom} bgTo={bgTo} emoji={emoji} large />;
  }

  // ── 1 image — full bleed ──
  if (imgs.length === 1) {
    return (
      <div className="h-full w-full overflow-hidden">
        <CImg src={imgs[0]} bgFrom={bgFrom} bgTo={bgTo} />
      </div>
    );
  }

  // ── 2 images — hero left (70%) + one stacked right ──
  if (imgs.length === 2) {
    return (
      <div className="flex h-full w-full gap-[2px]">
        <div className="h-full overflow-hidden" style={{ width: "69%" }}>
          <CImg src={imgs[0]} bgFrom={bgFrom} bgTo={bgTo} />
        </div>
        <div className="flex h-full flex-1 flex-col gap-[2px]">
          <div className="flex-1 overflow-hidden">
            <CImg src={imgs[1]} bgFrom={bgFrom} bgTo={bgTo} />
          </div>
          {/* Fill second slot with warm gradient */}
          <div className="flex-1 overflow-hidden">
            <GradientSlot bgFrom={bgFrom} bgTo={bgTo} emoji={emoji} />
          </div>
        </div>
      </div>
    );
  }

  // ── 3 images — hero left (70%) + two stacked right ──
  return (
    <div className="flex h-full w-full gap-[2px]">
      <div className="h-full overflow-hidden" style={{ width: "69%" }}>
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

// ── Skeleton tile ──────────────────────────────────────────────────────────────
function TileSkeleton() {
  return (
    <div className="overflow-hidden rounded-[20px] bg-white" style={TILE_STYLE}>
      <div className="aspect-[3/2] w-full animate-pulse bg-[#f2ede9]" />
      <div className="px-3.5 py-3">
        <div className="h-3.5 w-20 animate-pulse rounded-full bg-[#f0ebe7]" />
        <div className="mt-1.5 h-2.5 w-12 animate-pulse rounded-full bg-[#f5f1ee]" />
      </div>
    </div>
  );
}

// ── Category tile ──────────────────────────────────────────────────────────────
function CategoryTile({
  label,
  count,
  images,
  bgFrom,
  bgTo,
  emoji,
  onClick,
}: {
  label: string;
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
      {/* Hero + two-stack collage */}
      <div className="aspect-[3/2] w-full overflow-hidden">
        <CollageCover images={images} bgFrom={bgFrom} bgTo={bgTo} emoji={emoji} />
      </div>
      {/* Label footer */}
      <div className="px-3.5 pb-3.5 pt-3">
        <p className="text-[14px] font-bold leading-tight text-[#1a1a1a]">{label}</p>
        <p className="mt-[3px] text-[12px] font-medium text-[#b0a5b8]">
          {count > 0 ? `${count} save${count !== 1 ? "s" : ""}` : "No saves yet"}
        </p>
      </div>
    </button>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────
function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: profile } = useProfile();

  const { data: items, isLoading } = useQuery({
    queryKey: ["items", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  // Per-category stats: count + first 3 images for hero collage
  const categoryData = useMemo(() => {
    const all = items ?? [];
    return CATEGORIES.map((cat) => {
      const matched = all.filter(cat.match);
      const imgs = matched
        .filter((it) => it.image_url)
        .slice(0, 3)
        .map((it) => it.image_url as string);
      const hasSubs = new Set(
        matched.map((it) => (it as any).subcategory ?? (it as any).ai_subcategory).filter(Boolean)
      ).size > 0;
      return { ...cat, count: matched.length, images: imgs, hasSubs };
    });
  }, [items]);

  const totalCount = items?.length ?? 0;
  const allImages = useMemo(
    () =>
      (items ?? [])
        .filter((it) => it.image_url)
        .slice(0, 3)
        .map((it) => it.image_url as string),
    [items]
  );

  // Populated categories first, then empty (by count desc)
  const sortedCategories = useMemo(
    () => [...categoryData].sort((a, b) => b.count - a.count),
    [categoryData]
  );

  function handleCategoryTap(cat: (typeof categoryData)[number]) {
    if (cat.count === 0) return;
    if (cat.hasSubs) {
      navigate({ to: "/category/$type", params: { type: cat.key } });
    } else {
      navigate({ to: "/search", search: { type: cat.key } as never });
    }
  }

  const firstName = getFirstName(profile, user?.email);

  return (
    <div className="space-y-5 pb-4">
      {/* Greeting */}
      <div>
        <p className="text-[14px] text-[#b0a5b8]">{getGreeting()}, {firstName}</p>
        <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight text-[#1a1a1a]">
          What inspires you today?
        </h1>
      </div>

      {/* Search */}
      <button
        type="button"
        onClick={() => navigate({ to: "/search", search: {} as never })}
        className="flex w-full items-center gap-3 rounded-full bg-white px-4 py-3 text-left text-sm text-[#b8b0c0] transition hover:border-[#FD5897]/30"
        style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.05)", border: "1px solid rgba(250,247,242,0.95)" }}
      >
        <Search className="h-[17px] w-[17px] shrink-0 text-[#d4ccd8]" />
        Search your saves…
      </button>

      {/* Section label */}
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#c8bfd2]">
        Your Stash
      </p>

      {/* Tile grid — always rendered, gap-4 for breathing room */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => <TileSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {totalCount > 0 && (
            <CategoryTile
              label="All Saves"
              count={totalCount}
              images={allImages}
              bgFrom="#FFF0F5"
              bgTo="#FEF2F8"
              emoji="📌"
              onClick={() => navigate({ to: "/search", search: {} as never })}
            />
          )}
          {sortedCategories.map((cat) => (
            <CategoryTile
              key={cat.key}
              label={cat.label}
              count={cat.count}
              images={cat.images}
              bgFrom={cat.bgFrom}
              bgTo={cat.bgTo}
              emoji={cat.emoji}
              onClick={() => handleCategoryTap(cat)}
            />
          ))}
        </div>
      )}

      {/* Zero-state nudge */}
      {!isLoading && totalCount === 0 && (
        <div className="mt-2 rounded-2xl bg-white/60 px-5 py-8 text-center"
          style={{ border: "1px dashed rgba(253,88,151,0.2)" }}>
          <p className="text-2xl">📲</p>
          <p className="mt-2 text-sm font-semibold text-[#1a1a1a]">Nothing saved yet</p>
          <p className="mt-1 text-[13px] text-[#b0a5b8]">
            Use the iOS Shortcut or tap + to save your first link.
          </p>
        </div>
      )}
    </div>
  );
}
