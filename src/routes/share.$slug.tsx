import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ItemCard, type Item } from "@/components/ItemCard";
import { Logo } from "@/components/Logo";
import { UserAvatar } from "@/components/UserAvatar";

export const Route = createFileRoute("/share/$slug")({
  head: () => ({ meta: [{ title: "Shared collection — STASHd" }] }),
  component: SharePage,
});

function SharePage() {
  const { slug } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["share", slug],
    queryFn: async () => {
      const { data: c, error } = await supabase.from("collections").select("*").eq("share_slug", slug).eq("is_public", true).maybeSingle();
      if (error) throw error;
      if (!c) return null;
      const { data: items } = await supabase.from("items").select("*").eq("collection_id", c.id).order("created_at", { ascending: false });
      const { data: owner } = await supabase.from("profiles").select("display_name, avatar_url").eq("user_id", c.user_id).maybeSingle();
      return { collection: c, items: (items ?? []) as Item[], owner };
    },
  });

  return (
    <div className="min-h-screen bg-soft-gradient">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link to="/"><Logo /></Link>
        <Link to="/auth" className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-primary-foreground shadow-brand">Get STASHd</Link>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-16">
        {isLoading ? (
          <p className="py-20 text-center text-muted-foreground">Loading…</p>
        ) : !data ? (
          <div className="rounded-3xl border bg-card p-12 text-center shadow-card">
            <h1 className="text-2xl font-bold">Collection not found</h1>
            <p className="mt-2 text-muted-foreground">It may have been made private or removed.</p>
          </div>
        ) : (
          <>
            <div className="py-8">
              <p className="text-sm text-primary">Shared collection</p>
              <h1 className="mt-1 text-4xl font-extrabold tracking-tight">{data.collection.name}</h1>
              {data.collection.description && <p className="mt-2 text-muted-foreground">{data.collection.description}</p>}
              <div className="mt-4 flex items-center gap-2">
                <UserAvatar url={data.owner?.avatar_url} name={data.owner?.display_name} size="sm" />
                <p className="text-sm text-muted-foreground">
                  {data.owner?.display_name ? `Curated by ${data.owner.display_name} · ` : ""}{data.items.length} items
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((it) => <ItemCard key={it.id} item={it} readOnly />)}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
