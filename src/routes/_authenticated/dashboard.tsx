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

// ── Collage image ──────────────────────────────────────────────────────────────
function CImg({ src, className = "" }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`bg-[#f5f0ec] ${className}`} />;
  return (
    <img
      src={src}
      className={`h-full w-full object-cover ${className}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

// ── Collage cover — matches the Pinterest-style layout from the mockup ─────────
// 0 imgs → gradient placeholder
// 1 img  → full bleed
// 2 imgs → 50 / 50 side-by-side
// 3 imgs → 55% left + two stacked 45% right
// 4 imgs → 2 × 2 grid
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
  const imgs = images.slice(0, 4);
  const GAP = "gap-[2px]";

  if (imgs.length === 0) {
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${bgFrom}, ${bgTo})` }}
      >
        <span className="text-5xl leading-none opacity-50 select-none">{emoji}</span>
      </div>
    );
  }

  if (imgs.length === 1) {
    return (
      <div className="h-full w-full overflow-hidden">
        <CImg src={imgs[0]} />
      </div>
    );
  }

  if (imgs.length === 2) {
    return (
      <div className={`flex h-full w-full ${GAP}`}>
        <div className="h-full flex-1 overflow-hidden"><CImg src={imgs[0]} /></div>
        <div className="h-full flex-1 overflow-hidden"><CImg src={imgs[1]} /></div>
      </div>
    );
  }

  if (imgs.length === 3) {
    return (
      <div className={`flex h-full w-full ${GAP}`}>
        <div className="h-full overflow-hidden" style={{ width: "55%" }}>
          <CImg src={imgs[0]} />
        </div>
        <div className={`flex h-full flex-1 flex-col ${GAP}`}>
          <div className="flex-1 overflow-hidden"><CImg src={imgs[1]} /></div>
          <div className="flex-1 overflow-hidden"><CImg src={imgs[2]} /></div>
        </div>
      </div>
    );
  }

  // 4 images — 2×2
  return (
    <div className={`grid h-full w-full grid-cols-2 grid-rows-2 ${GAP}`}>
      {imgs.map((src, i) => (
        <div key={i} className="overflow-hidden"><CImg src={src} /></div>
      ))}
    </div>
  );
}

// ── Skeleton tile shown while data loads ───────────────────────────────────────
function TileSkeleton() {
  return (
    <div className="overflow-hidden rounded-[20px] bg-white shadow-[0_2px_18px_rgba(0,0,0,0.07)]">
      <div className="aspect-[3/2] w-full animate-pulse bg-[#f0ebe7]" />
      <div className="px-3.5 py-3">
        <div className="h-3.5 w-20 animate-pulse rounded-full bg-[#f0ebe7]" />
        <div className="mt-1.5 h-2.5 w-12 animate-pulse rounded-full bg-[#f5f1ee]" />
      </div>
    </div>
  );
}

// ── Single category tile ───────────────────────────────────────────────────────
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
      className="flex flex-col overflow-hidden rounded-[20px] bg-white text-left shadow-[0_2px_18px_rgba(0,0,0,0.08)] transition-transform active:scale-[0.97]"
    >
      {/* Image collage — 3:2 ratio matches the mockup proportions */}
      <div className="aspect-[3/2] w-full overflow-hidden">
        <CollageCover
          images={images}
          bgFrom={bgFrom}
          bgTo={bgTo}
          emoji={emoji}
        />
      </div>
      {/* Text footer */}
      <div className="px-3.5 pb-3.5 pt-3">
        <p className="text-[14px] font-bold leading-tight text-[#1a1a1a]">{label}</p>
        <p className="mt-[3px] text-[12px] font-medium text-[#b0a5b8]">
          {count > 0 ? `${count} save${count !== 1 ? "s" : ""}` : "No saves yet"}
        </p>
      </div>
    </button>
  );
}

// ── Main dashboard component ───────────────────────────────────────────────────
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

  // Per-category counts and cover images
  const categoryData = useMemo(() => {
    const all = items ?? [];
    return CATEGORIES.map((cat) => {
      const matched = all.filter(cat.match);
      const imgs = matched
        .filter((it) => it.image_url)
        .slice(0, 4)
        .map((it) => it.image_url as string);
      const hasSubs = (() => {
        const subs = new Set(
          matched.map((it) => (it as any).subcategory ?? (it as any).ai_subcategory).filter(Boolean)
        );
        return subs.size > 0;
      })();
      return { ...cat, count: matched.length, images: imgs, hasSubs };
    });
  }, [items]);

  // "All Saves" catch-all (counts every item, shown only when user has saves)
  const totalCount = items?.length ?? 0;
  const allImages = useMemo(
    () =>
      (items ?? [])
        .filter((it) => it.image_url)
        .slice(0, 4)
        .map((it) => it.image_url as string),
    [items]
  );

  // Sort: populated categories first (by count desc), empty ones below
  const sortedCategories = useMemo(
    () => [...categoryData].sort((a, b) => b.count - a.count),
    [categoryData]
  );

  function handleCategoryTap(cat: (typeof categoryData)[number]) {
    if (cat.count === 0) return; // no-op on empty tiles
    if (cat.hasSubs) {
      navigate({ to: "/category/$type", params: { type: cat.key } });
    } else {
      navigate({ to: "/search", search: { type: cat.key } as never });
    }
  }

  const firstName = getFirstName(profile, user?.email);

  return (
    <div className="space-y-5 pb-4">
      {/* ── Greeting ── */}
      <div>
        <p className="text-[14px] text-[#b0a5b8]">
          {getGreeting()}, {firstName}
        </p>
        <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight text-[#1a1a1a]">
          What inspires you today?
        </h1>
      </div>

      {/* ── Search bar ── */}
      <button
        type="button"
        onClick={() => navigate({ to: "/search", search: {} as never })}
        className="flex w-full items-center gap-3 rounded-full border border-[#ede8e3] bg-white px-4 py-3 text-left text-sm text-[#b8b0c0] shadow-[0_1px_6px_rgba(0,0,0,0.05)] transition hover:border-[#FD5897]/30"
      >
        <Search className="h-[17px] w-[17px] shrink-0 text-[#d4ccd8]" />
        Search your saves…
      </button>

      {/* ── YOUR STASH label ── */}
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#c8bfd2]">
        Your Stash
      </p>

      {/* ── Category grid — always rendered ── */}
      {isLoading ? (
        // Skeleton while loading — grid always visible
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => <TileSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* All Saves tile — shown only when user has items */}
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

          {/* Per-category tiles — always rendered, empty ones still visible */}
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

      {/* ── First-save nudge — only when no items at all ── */}
      {!isLoading && totalCount === 0 && (
        <div className="mt-2 rounded-2xl border border-dashed border-[#FD5897]/25 bg-white/60 px-5 py-8 text-center">
          <p className="text-2xl">📲</p>
          <p className="mt-2 text-sm font-semibold text-[#1a1a1a]">
            Nothing saved yet
          </p>
          <p className="mt-1 text-[13px] text-[#b0a5b8]">
            Use the iOS Shortcut or tap + to save your first link.
          </p>
        </div>
      )}
    </div>
  );
}
