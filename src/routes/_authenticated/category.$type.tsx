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
  gradient: string;
};

const CATEGORY_META: CategoryMeta[] = [
  { key: "Recipe",    label: "Recipes",       description: "All your recipe finds, organized by AI",      emoji: "🍝", gradient: "from-orange-100 to-amber-50"  },
  { key: "Fashion",   label: "Fashion",       description: "All your fashion finds, organized by AI",      emoji: "👗", gradient: "from-violet-100 to-pink-50"   },
  { key: "Travel",    label: "Travel",        description: "All your travel inspiration, organized by AI", emoji: "✈️", gradient: "from-sky-100 to-teal-50"      },
  { key: "Product",   label: "Products",      description: "All your product saves, organized by AI",      emoji: "🛍️", gradient: "from-blue-100 to-indigo-50"   },
  { key: "Fitness",   label: "Workouts",      description: "All your workout saves, organized by AI",      emoji: "🏃", gradient: "from-lime-100 to-green-50"    },
  { key: "Home",      label: "Home & Decor",  description: "All your home inspiration, organized by AI",   emoji: "🏡", gradient: "from-amber-100 to-yellow-50"  },
  { key: "Beauty",    label: "Beauty",        description: "All your beauty finds, organized by AI",       emoji: "✨", gradient: "from-pink-100 to-rose-50"     },
  { key: "Tutorial",  label: "Tutorials",     description: "All your tutorial saves, organized by AI",     emoji: "💡", gradient: "from-indigo-100 to-blue-50"   },
  { key: "Business",  label: "Business",      description: "All your business saves, organized by AI",     emoji: "💼", gradient: "from-stone-100 to-gray-50"    },
  { key: "Parenting", label: "Parenting",     description: "All your parenting saves, organized by AI",    emoji: "👶", gradient: "from-red-100 to-pink-50"      },
];

function getFirstName(email?: string | null): string {
  if (email) return email.split("@")[0];
  return "";
}

// ── Image component with silent fallback ──────────────────────────────────────
function CImg({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

// ── Collage cover ─────────────────────────────────────────────────────────────
function CollageCover({ images, gradient, emoji }: { images: string[]; gradient: string; emoji: string }) {
  const imgs = images.slice(0, 4);

  if (imgs.length === 0) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}>
        <span className="text-4xl leading-none opacity-60">{emoji}</span>
      </div>
    );
  }
  if (imgs.length === 1) {
    return <div className="h-full w-full overflow-hidden"><CImg src={imgs[0]} /></div>;
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

// ── Subcategory tile ──────────────────────────────────────────────────────────
function SubcategoryTile({
  name,
  count,
  images,
  gradient,
  emoji,
  onClick,
}: {
  name: string;
  count: number;
  images: string[];
  gradient: string;
  emoji: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col overflow-hidden rounded-[18px] bg-white text-left shadow-[0_2px_16px_rgba(0,0,0,0.07)] transition active:scale-[0.98]"
    >
      <div className="aspect-[4/3] w-full overflow-hidden rounded-t-[18px]">
        <CollageCover images={images} gradient={gradient} emoji={emoji} />
      </div>
      <div className="px-3 py-2.5">
        <p className="text-[13px] font-bold leading-snug text-[#1a1a1a]">{name}</p>
        <p className="mt-0.5 text-[11px] text-[#9a8fa0]">{count} save{count !== 1 ? "s" : ""}</p>
      </div>
    </button>
  );
}

// ── Page component ────────────────────────────────────────────────────────────
function CategorySubcategoryPage() {
  const { type } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const meta = CATEGORY_META.find((c) => c.key === type) ?? {
    key: type,
    label: type,
    description: `All your ${type.toLowerCase()} saves, organized by AI`,
    emoji: "📌",
    gradient: "from-pink-100 to-rose-50",
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

  // Subcategory data: name → count + images
  const subcategories = useMemo(() => {
    const map: Record<string, { count: number; images: string[] }> = {};
    for (const it of items) {
      const sub = (it as any).subcategory ?? (it as any).ai_subcategory ?? null;
      if (!sub) continue;
      if (!map[sub]) map[sub] = { count: 0, images: [] };
      map[sub].count += 1;
      if (it.image_url && map[sub].images.length < 4) {
        map[sub].images.push(it.image_url);
      }
    }
    return Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, data]) => ({ name, ...data }));
  }, [items]);

  // Filter all saves by search term
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
      {/* Back + page header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/dashboard" })}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_1px_6px_rgba(0,0,0,0.08)] transition hover:shadow-[0_2px_10px_rgba(0,0,0,0.12)]"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5 text-[#1a1a1a]" />
        </button>
      </div>

      {/* Category title + description */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-[#1a1a1a]">
            {meta.label}
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#9a8fa0]">
            {meta.description}
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c8bfcf]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${meta.label.toLowerCase()}…`}
          className="w-full rounded-full border border-[#ede8e3] bg-white py-3 pl-11 pr-4 text-sm text-[#1a1a1a] placeholder:text-[#b0a8b2] shadow-[0_1px_6px_rgba(0,0,0,0.05)] outline-none focus:border-[#FD5897]/30 focus:ring-2 focus:ring-[#FD5897]/10"
        />
      </div>

      {/* AI Collections */}
      {subcategories.length > 0 && !search && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#c0b8ca]">
            AI Collections
          </p>
          <div className="grid grid-cols-2 gap-3">
            {subcategories.map(({ name, count, images }) => (
              <SubcategoryTile
                key={name}
                name={name}
                count={count}
                images={images}
                gradient={meta.gradient}
                emoji={meta.emoji}
                onClick={() => navigate({ to: "/search", search: { type, sub: name } as never })}
              />
            ))}
          </div>

          {/* View all saves link */}
          <button
            type="button"
            onClick={() => navigate({ to: "/search", search: { type } as never })}
            className="w-full rounded-full border border-[#FD5897]/25 py-2.5 text-sm font-semibold text-[#FD5897] transition hover:bg-[#FD5897]/5"
          >
            View all {items.length} {meta.label} →
          </button>
        </div>
      )}

      {/* All Saves section */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#c0b8ca]">
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
