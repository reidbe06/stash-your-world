import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — STASHd" }] }),
  component: Profile,
});

function Profile() {
  const { user } = useAuth();
  const { data: stats } = useQuery({
    queryKey: ["stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [items, cols] = await Promise.all([
        supabase.from("items").select("id", { count: "exact", head: true }),
        supabase.from("collections").select("id", { count: "exact", head: true }),
      ]);
      return { items: items.count ?? 0, collections: cols.count ?? 0 };
    },
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="rounded-3xl border bg-card p-8 text-center shadow-card">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-gradient text-3xl font-bold text-primary-foreground shadow-brand">
          {user?.email?.[0].toUpperCase()}
        </div>
        <h1 className="mt-4 text-xl font-bold">{user?.email}</h1>
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Mail className="h-3 w-3" /> Verified member
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-card p-5 text-center shadow-card">
          <p className="text-3xl font-extrabold text-brand-gradient">{stats?.items ?? 0}</p>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Saves</p>
        </div>
        <div className="rounded-2xl border bg-card p-5 text-center shadow-card">
          <p className="text-3xl font-extrabold text-brand-gradient">{stats?.collections ?? 0}</p>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Collections</p>
        </div>
      </div>

      <button onClick={() => supabase.auth.signOut()} className="inline-flex w-full items-center justify-center gap-2 rounded-full border bg-card py-3 text-sm font-semibold shadow-card hover:bg-accent">
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
