import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Mail, Bell, Lock, HelpCircle, ChevronRight, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile & Settings — STASHd" }] }),
  component: Profile,
});

type Setting = { icon: LucideIcon; label: string; hint: string; onClick?: () => void };

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

  const settings: Setting[] = [
    { icon: Bell, label: "Notifications", hint: "Manage alerts and updates" },
    { icon: Lock, label: "Privacy", hint: "Control who sees your stash" },
    { icon: Sparkles, label: "Appearance", hint: "Theme and display options" },
    { icon: HelpCircle, label: "Help & support", hint: "Get answers and contact us" },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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
        <Link to="/dashboard" className="rounded-2xl border bg-card p-5 text-center shadow-card transition hover:shadow-brand">
          <p className="text-3xl font-extrabold text-brand-gradient">{stats?.items ?? 0}</p>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Saves</p>
        </Link>
        <Link to="/collections" className="rounded-2xl border bg-card p-5 text-center shadow-card transition hover:shadow-brand">
          <p className="text-3xl font-extrabold text-brand-gradient">{stats?.collections ?? 0}</p>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Collections</p>
        </Link>
      </div>

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Settings</h2>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
          {settings.map((s, i) => (
            <button
              key={s.label}
              onClick={s.onClick}
              className={`flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-accent/40 ${i < settings.length - 1 ? "border-b" : ""}`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
                <s.icon className="h-5 w-5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => supabase.auth.signOut()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border bg-card py-3 text-sm font-semibold shadow-card hover:bg-accent"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
