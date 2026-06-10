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

type CategoryDef = {
  key: string;
  label: string;
  emoji: string;
  gradient: string;
  match: (it: Item) => boolean;
};

const CATEGORIES: CategoryDef[] = [
  { key: "Recipe",    label: "Recipes",       emoji: "🍝", gradient: "from-orange-100 to-amber-50",   match: (it) => it.type === "Recipe" },
  { key: "Fashion",   label: "Fashion",       emoji: "👗", gradient: "from-violet-100 to-pink-50",    match: (it) => it.type === "Fashion" },
  { key: "Travel",    label: "Travel",        emoji: "✈️", gradient: "from-sky-100 to-teal-50",       match: (it) => it.type === "Travel" },
  { key: "Product",   label: "Products",      emoji: "🛍️", gradient: "from-blue-100 to-indigo-50",    match: (it) => it.type === "Product" },
  { key: "Fitness",   label: "Workouts",      emoji: "🏃", gradient: "from-lime-100 to-green-50",     match: (it) => it.type === "Fitness" },
  { key: "Home",      label: "Home",          emoji: "🏡", gradient: "from-amber-100 to-yellow-50",   match: (it) => it.type === "Home" },
  { key: "Beauty",    label: "Beauty",        emoji: "✨", gradient: "from-pink-100 to-rose-50",      match: (it) => it.type === "Beauty" },
  { key: "Tutorial",  label: "Tutorials",     emoji: "💡", gradient: "from-indigo-100 to-blue-50",    match: (it) => it.type === "Tutorial" },
  { key: "Business",  label: "Business",      emoji: "💼", gradient: "from-stone-100 to-gray-50",     match: (it) => it.type === "Business" },
  { key: "Parenting", label: "Parenting",     emoji: "👶", gradient: "from-red-100 to-pink-50",       match: (it) => it.type === "Parenting" },
];

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

// ── Image component with silent fallback ──────────────────────────────────────
function CImg({ src, className = "" }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      className={`h-full w-full object-cover ${className}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

// ── Collage cover for a category tile ────────────────────────────────────────
function CollageCover({ images, gradient, emoji }: { images: string[]; gradient: string; emoji: string }) {
  const imgs = images.slice(0, 4);

  if (imgs.length === 0) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}>
        <span className="text-5xl leading-none opacity-60">{emoji}</span>
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
      <div className="grid h-full grid-cols-2 gap-[1.5px]">
        <div className="overflow-hidden"><CImg src={imgs[0]} /></div>
        <div className="overflow-hidden"><CImg src={imgs[1]} /></div>
      </div>
    );
  }

  if (imgs.length === 3) {
    return (
      <div className="flex h-full gap-[1.5px]">
        <div className="h-full w-[55%] overflow-hidden"><CImg src={imgs[0]} /></div>
        <div className="flex h-full flex-1 flex-col gap-[1.5px]">
          <div className="h-1/2 overflow-hidden"><CImg src={imgs[1]} /></div>
          <div className="h-1/2 overflow-hidden"><CImg src={imgs[2]} /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-2 grid-rows-2 gap-[1.5px]">
      {imgs.map((src, i) => (
        <div key={i} className="overflow-hidden"><CImg src={src} /></div>
      ))}
    </div>
  );
}

// ── Category tile ─────────────────────────────────────────────────────────────
function CategoryTile({
  cat,
  count,
  images,
  onClick,
}: {
  cat: CategoryDef;
  count: number;
  images: string[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-[18px] bg-white text-left shadow-[0_2px_16px_rgba(0,0,0,0.07)] transition active:scale-[0.98]"
    >
      {/* Image collage */}
      <div className="aspect-[4/3] w-full overflow-hidden rounded-t-[18px]">
        <CollageCover images={images} gradient={cat.gradient} emoji={cat.emoji} />
      </div>
      {/* Text */}
      <div className="px-3.5 py-3">
        <p className="text-[15px] font-bold text-[#1a1a1a]">{cat.label}</p>
        <p className="mt-0.5 text-[12px] text-[#9a8fa0]">{count} save{count !== 1 ? "s" : ""}</p>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: profile } = useProfile();

  const { data: items = [] } = useQuery({
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

  // Count + image lists per category
  const { counts, imageMap } = useMemo(() => {
    const counts: Record<string, number> = {};
    const imageMap: Record<string, string[]> = {};
    for (const cat of CATEGORIES) {
      const catItems = items.filter(cat.match);
      counts[cat.key] = catItems.length;
      imageMap[cat.key] = catItems
        .filter((it) => it.image_url)
        .slice(0, 4)
        .map((it) => it.image_url as string);
    }
    return { counts, imageMap };
  }, [items]);

  // Subcategory presence — determines whether to go to /category or /search
  const hasSubs = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const cat of CATEGORIES) {
      const catItems = items.filter(cat.match);
      const subs = new Set(catItems.map((it) => (it as any).subcategory ?? (it as any).ai_subcategory).filter(Boolean));
      map[cat.key] = subs.size > 0;
    }
    return map;
  }, [items]);

  function handleCategoryTap(key: string) {
    if (hasSubs[key]) {
      navigate({ to: "/category/$type", params: { type: key } });
    } else {
      navigate({ to: "/search", search: { type: key } as never });
    }
  }

  const firstName = getFirstName(profile, user?.email);
  const visibleCategories = CATEGORIES.filter((c) => counts[c.key] > 0);
  const emptyCategories = CATEGORIES.filter((c) => counts[c.key] === 0);

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <p className="text-[14px] text-[#9a8fa0]">
          {getGreeting()}, {firstName}
        </p>
        <h1 className="mt-0.5 text-[28px] font-extrabold leading-tight tracking-tight text-[#1a1a1a]">
          What inspires<br />you today?
        </h1>
      </div>

      {/* Search bar */}
      <button
        type="button"
        onClick={() => navigate({ to: "/search", search: {} as never })}
        className="flex w-full items-center gap-3 rounded-full border border-[#ede8e3] bg-white px-4 py-3 text-left text-sm text-[#b0a8b2] shadow-[0_1px_6px_rgba(0,0,0,0.05)] transition hover:shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
      >
        <Search className="h-4 w-4 shrink-0 text-[#c8bfcf]" />
        Search your saves…
      </button>

      {/* YOUR STASH heading */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#c0b8ca]">
        Your Stash
      </p>

      {/* Category tiles grid */}
      {visibleCategories.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {visibleCategories.map((cat) => (
            <CategoryTile
              key={cat.key}
              cat={cat}
              count={counts[cat.key]}
              images={imageMap[cat.key]}
              onClick={() => handleCategoryTap(cat.key)}
            />
          ))}
        </div>
      ) : (
        // Empty state — no saves yet
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="text-6xl">📌</span>
          <div>
            <p className="text-base font-bold text-[#1a1a1a]">Your stash is empty</p>
            <p className="mt-1 max-w-xs text-sm text-[#9a8fa0]">
              Start saving from Instagram, TikTok, or any website to see your categories here.
            </p>
          </div>
        </div>
      )}

      {/* Empty categories (discoverable) — show dimmed tiles */}
      {emptyCategories.length > 0 && visibleCategories.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#c0b8ca]">
            Discover more
          </p>
          <div className="grid grid-cols-2 gap-3">
            {emptyCategories.map((cat) => (
              <div
                key={cat.key}
                className="flex flex-col overflow-hidden rounded-[18px] bg-white/60 text-left shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
              >
                <div className={`flex aspect-[4/3] items-center justify-center bg-gradient-to-br ${cat.gradient} opacity-50`}>
                  <span className="text-4xl leading-none">{cat.emoji}</span>
                </div>
                <div className="px-3.5 py-3">
                  <p className="text-[14px] font-bold text-[#1a1a1a]/40">{cat.label}</p>
                  <p className="mt-0.5 text-[12px] text-[#9a8fa0]/60">No saves yet</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
