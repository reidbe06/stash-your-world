import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Home, Search, Library, User as UserIcon, Plus, LogOut, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/UserAvatar";
import { useProfile } from "@/hooks/useProfile";

export const Route = createFileRoute("/_authenticated")({ component: AuthedLayout });

const navItems = [
  { to: "/dashboard", icon: Home, label: "Home" },
  { to: "/search", icon: Search, label: "Search" },
  { to: "/ask", icon: Sparkles, label: "Ask" },
  { to: "/collections", icon: Library, label: "Collections" },
  { to: "/profile", icon: UserIcon, label: "Profile" },
] as const;

function AuthedLayout() {
  const { user, loading } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [user, loading, navigate]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-pulse rounded-full bg-brand-gradient" /></div>;
  }

  return (
    <div className="min-h-screen bg-soft-gradient pb-24">
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 md:px-6">
          <Link to="/dashboard"><Logo size="sm" /></Link>
          <div className="hidden gap-1 md:flex">
            {navItems.map((n) => {
              const active = pathname.startsWith(n.to);
              return (
                <Link key={n.to} to={n.to} className={cn("rounded-full px-4 py-2 text-sm font-medium transition", active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {n.label}
                </Link>
              );
            })}
          </div>
          <button onClick={() => supabase.auth.signOut()} className="text-muted-foreground hover:text-foreground" aria-label="Sign out">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        <Outlet />
      </main>

      {/* Bottom mobile nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t bg-card/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-around px-2 py-2">
          {navItems.slice(0, 2).map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} className={cn("flex flex-col items-center gap-0.5 px-3 py-1.5", active ? "text-primary" : "text-muted-foreground")}>
                <n.icon className="h-5 w-5" /><span className="text-[10px] font-medium">{n.label}</span>
              </Link>
            );
          })}
          <Link to="/save" className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-primary-foreground shadow-brand" aria-label="Save new">
            <Plus className="h-6 w-6" />
          </Link>
          {navItems.slice(2).map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} className={cn("flex flex-col items-center gap-0.5 px-3 py-1.5", active ? "text-primary" : "text-muted-foreground")}>
                <n.icon className="h-5 w-5" /><span className="text-[10px] font-medium">{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop FAB */}
      <Link to="/save" className="fixed bottom-8 right-8 z-30 hidden items-center gap-2 rounded-full bg-brand-gradient px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-brand md:inline-flex">
        <Plus className="h-4 w-4" /> Save an Item
      </Link>
    </div>
  );
}
