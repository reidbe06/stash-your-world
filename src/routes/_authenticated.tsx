import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Home, Search, Plus, LogOut, Sparkles, Bell } from "lucide-react";
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
  { to: "/reminders", icon: Bell, label: "Reminders" },
] as const;

function AuthedLayout() {
  const { user, loading } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) {
      // Preserve a pending share URL in sessionStorage so auth.tsx can restore it after login.
      if (typeof window !== "undefined" && window.location.pathname === "/share") {
        const params = new URLSearchParams(window.location.search);
        const pendingUrl = params.get("url");
        if (pendingUrl) sessionStorage.setItem("stashd_pending_share", pendingUrl);
      }
      navigate({ to: "/auth" });
    }
  }, [user, loading, navigate]);

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
          <div className="flex items-center gap-2">
            <Link to="/profile" aria-label="Profile">
              <UserAvatar url={profile?.avatar_url} email={user.email} size="sm" />
            </Link>
            <button onClick={() => supabase.auth.signOut()} className="text-muted-foreground hover:text-foreground" aria-label="Sign out">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        <Outlet />
      </main>

      {/* Bottom mobile nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid h-14 grid-cols-5">
          {navItems.slice(0, 2).map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-[3px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <n.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} />
                <span className="text-[9px] font-semibold tracking-tight leading-none">{n.label}</span>
              </Link>
            );
          })}

          {/* Save — center col */}
          <Link
            to="/save"
            className="flex flex-col items-center justify-center gap-[3px]"
            aria-label="Save new item"
          >
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-brand-gradient shadow-sm">
              <Plus className="h-[17px] w-[17px] text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="text-[9px] font-semibold tracking-tight leading-none text-muted-foreground">Save</span>
          </Link>

          {navItems.slice(2).map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-[3px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <n.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} />
                <span className="text-[9px] font-semibold tracking-tight leading-none">{n.label}</span>
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
