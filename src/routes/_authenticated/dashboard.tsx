import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ItemCard, type Item } from "@/components/ItemCard";
import { Bookmark } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Your Stash — STASHd" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const { data: items, isLoading } = useQuery({
    queryKey: ["items", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  })();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">{greeting} 👋</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Your stash</h1>
        <p className="mt-1 text-muted-foreground">{items?.length ?? 0} saved {items?.length === 1 ? "item" : "items"}</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : items && items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => <ItemCard key={it.id} item={it} />)}
        </div>
      ) : (
        <div className="rounded-3xl border bg-card p-12 text-center shadow-card">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
            <Bookmark className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mt-4 text-xl font-bold">Your stash is empty</h2>
          <p className="mt-2 text-sm text-muted-foreground">Tap the + button to save your first link, recipe, or idea.</p>
        </div>
      )}
    </div>
  );
}
