import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ItemCard, type Item } from "@/components/ItemCard";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Search — STASHd" }] }),
  component: SearchPage,
});

const TYPES = ["all", "link", "recipe", "video", "product", "fashion", "idea", "article"];

function SearchPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");

  const { data: items } = useQuery({
    queryKey: ["items", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  const results = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (type !== "all" && it.type !== type) return false;
      if (!needle) return true;
      return (
        it.title.toLowerCase().includes(needle) ||
        (it.description ?? "").toLowerCase().includes(needle) ||
        (it.source ?? "").toLowerCase().includes(needle) ||
        it.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
  }, [items, q, type]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Search</h1>
      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, tags, sources…" className="h-12 rounded-full pl-11" />
      </div>
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button key={t} onClick={() => setType(t)} className={cn("rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition", type === t ? "bg-brand-gradient text-primary-foreground shadow-brand" : "bg-card border text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>
      {results.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((it) => <ItemCard key={it.id} item={it} />)}
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">No matches yet.</p>
      )}
    </div>
  );
}
