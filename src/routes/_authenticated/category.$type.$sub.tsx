import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Item } from "@/components/ItemCard";
import { ItemCard } from "@/components/ItemCard";

export const Route = createFileRoute("/_authenticated/category/$type/$sub")({
  head: () => ({ meta: [{ title: "Collection — STASHd" }] }),
  component: CollectionPage,
});

const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  Recipe:        { label: "Recipes",       emoji: "🍝" },
  Fashion:       { label: "Fashion",       emoji: "👗" },
  Travel:        { label: "Travel",        emoji: "✈️" },
  Product:       { label: "Products",      emoji: "🛍️" },
  Fitness:       { label: "Workouts",      emoji: "🏃" },
  Home:          { label: "Home & Decor",  emoji: "🏡" },
  Beauty:        { label: "Beauty",        emoji: "✨" },
  Tutorial:      { label: "Tutorials",     emoji: "💡" },
  Business:      { label: "Business",      emoji: "💼" },
  Parenting:     { label: "Parenting",     emoji: "👶" },
  Entertainment: { label: "Entertainment", emoji: "🎬" },
  Other:         { label: "Other",         emoji: "📌" },
};

function CollectionPage() {
  const { type, sub } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const meta = CATEGORY_META[type] ?? { label: type, emoji: "📌" };

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["collection-items", user?.id, type, sub],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("type", type)
        .or(`subcategory.eq.${sub},ai_subcategory.eq.${sub}`)
        .not("user_override", "eq", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.title?.toLowerCase().includes(q) ||
        it.description?.toLowerCase().includes(q) ||
        it.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [items, search]);

  return (
    <div className="space-y-5">
      {/* Back */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/category/$type", params: { type } })}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white transition"
          style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.08)", border: "1px solid rgba(250,247,242,0.9)" }}
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5 text-[#1a1a1a]" />
        </button>
        <span className="text-[13px] text-[#9a8fa0]">{meta.label}</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-[#1a1a1a]">
          {sub}
        </h1>
        <p className="mt-1 text-[13px] text-[#9a8fa0]">
          {isLoading ? "Loading…" : `${items.length} save${items.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Scoped search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c8bfcf]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${sub}…`}
          className="w-full rounded-full bg-white py-3 pl-11 pr-4 text-sm text-[#1a1a1a] placeholder:text-[#b0a8b2] outline-none focus:ring-2 focus:ring-[#FD5897]/10"
          style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.05)", border: "1px solid rgba(250,247,242,0.95)" }}
        />
      </div>

      {/* Items */}
      <div className="space-y-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#c8bfd2]">
          {search ? `Results (${filteredItems.length})` : "Saves"}
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
              {search ? "No saves match your search." : `No saves in ${sub} yet.`}
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
