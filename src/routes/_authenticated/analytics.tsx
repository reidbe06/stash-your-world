import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Tooltip,
} from "recharts";
import {
  ShoppingBag, MousePointerClick, TrendingUp, AlertCircle,
  ExternalLink, Package, Tag, Percent, ChevronRight, Users, UserCheck, UserPlus, Bookmark,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Commerce Analytics — STASHd" }] }),
  component: AnalyticsPage,
});

// ── types ─────────────────────────────────────────────────────────────────────
type AnalyticsItem = {
  id: string;
  title: string;
  type: string;
  category: string | null;
  product_name: string | null;
  product_brand: string | null;
  affiliate_url: string | null;
  product_url: string | null;
  is_shoppable: boolean;
  affiliate_click_count: number;
  user_id: string;
  created_at: string;
  last_affiliate_click_at: string | null;
};

type PlatformStats = {
  totalUsers: number;
  newUsersThisWeek: number;
  activeUsersToday: number;
  activeUsersThisWeek: number;
  totalSaves: number;
  savesThisWeek: number;
};

// ── helpers ───────────────────────────────────────────────────────────────────
const BRAND_COLORS = ["#FD5897", "#a855f7", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6"];

function pct(num: number, den: number) {
  if (!den) return "—";
  return `${((num / den) * 100).toFixed(1)}%`;
}

function KpiCard({
  label, value, sub, icon: Icon, color,
}: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-white p-4 shadow-sm flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${color}18` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </span>
      </div>
      <p className="text-3xl font-extrabold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
function AnalyticsPage() {
  const { user } = useAuth();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();

  if (adminLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-primary/30" />
      </div>
    );
  }

  if (!isAdmin) {
    navigate({ to: "/dashboard" });
    return null;
  }

  return <AnalyticsDashboard user={user} />;
}

// ── dashboard (only mounts when isAdmin = true) ───────────────────────────────
function AnalyticsDashboard({ user }: { user: { id: string } | null }) {
  const { data: analyticsData, isLoading } = useQuery<{ items: AnalyticsItem[]; stats: PlatformStats }>({
    queryKey: ["analytics-items-all"],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");
      const res = await fetch("/api/admin/analytics", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`Analytics fetch failed: ${res.status}`);
      const json = await res.json();
      return {
        items: (json.items ?? []).map((r: any) => ({
          ...r,
          is_shoppable: !!r.is_shoppable,
          affiliate_click_count: r.affiliate_click_count ?? 0,
        })),
        stats: json.stats ?? {
          totalUsers: 0,
          newUsersThisWeek: 0,
          activeUsersToday: 0,
          activeUsersThisWeek: 0,
          totalSaves: 0,
          savesThisWeek: 0,
        },
      };
    },
  });

  const items = analyticsData?.items ?? [];
  const pStats: PlatformStats = analyticsData?.stats ?? {
    totalUsers: 0,
    newUsersThisWeek: 0,
    activeUsersToday: 0,
    activeUsersThisWeek: 0,
    totalSaves: 0,
    savesThisWeek: 0,
  };

  // ── derived commerce metrics ──────────────────────────────────────────────
  const shoppable    = items.filter((i) => i.is_shoppable);
  const totalClicks  = items.reduce((s, i) => s + i.affiliate_click_count, 0);
  const withLinks    = shoppable.filter((i) => i.affiliate_url || i.product_url);
  const missingLinks = shoppable.filter((i) => !i.affiliate_url && !i.product_url);
  const ctr          = shoppable.length ? totalClicks / shoppable.length : 0;

  const byCategory = Object.entries(
    items.reduce<Record<string, { saves: number; clicks: number; shoppable: number }>>((acc, item) => {
      const cat = item.category || item.type || "Uncategorized";
      if (!acc[cat]) acc[cat] = { saves: 0, clicks: 0, shoppable: 0 };
      acc[cat].saves++;
      acc[cat].clicks += item.affiliate_click_count;
      if (item.is_shoppable) acc[cat].shoppable++;
      return acc;
    }, {}),
  )
    .filter(([, v]) => v.shoppable > 0)
    .sort((a, b) => b[1].clicks - a[1].clicks)
    .slice(0, 10)
    .map(([category, v]) => ({ category, ...v }));

  const topSaves = [...items]
    .filter((i) => i.affiliate_click_count > 0)
    .sort((a, b) => b.affiliate_click_count - a.affiliate_click_count)
    .slice(0, 10);

  const brandMap = items.reduce<Record<string, number>>((acc, i) => {
    if (i.product_brand && i.affiliate_click_count > 0) {
      acc[i.product_brand] = (acc[i.product_brand] ?? 0) + i.affiliate_click_count;
    }
    return acc;
  }, {});
  const topBrands = Object.entries(brandMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([brand, clicks]) => ({ brand, clicks }));
  const maxBrandClicks = topBrands[0]?.clicks ?? 1;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-brand-gradient" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Commerce Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform-wide performance across {pStats.totalSaves.toLocaleString()} saved item{pStats.totalSaves !== 1 ? "s" : ""}
        </p>
      </div>

      {/* ── Founder Overview ── */}
      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Founder Overview</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard label="Total Users" value={pStats.totalUsers.toLocaleString()} sub="all-time signups" icon={Users} color="#6366f1" />
          <KpiCard label="Active Today" value={pStats.activeUsersToday.toLocaleString()} sub="saved or clicked today" icon={UserCheck} color="#FD5897" />
          <KpiCard label="Active This Week" value={pStats.activeUsersThisWeek.toLocaleString()} sub="saved or clicked (7d)" icon={TrendingUp} color="#a855f7" />
          <KpiCard label="New Users (7d)" value={pStats.newUsersThisWeek.toLocaleString()} sub="joined this week" icon={UserPlus} color="#10b981" />
          <KpiCard label="Total Saves" value={pStats.totalSaves.toLocaleString()} sub="across all users" icon={Bookmark} color="#3b82f6" />
          <KpiCard label="Saves This Week" value={pStats.savesThisWeek.toLocaleString()} sub="new saves (7d)" icon={ShoppingBag} color="#f59e0b" />
        </div>
      </div>

      {/* ── Commerce Performance ── */}
      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Commerce Performance</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Shoppable Saves" value={shoppable.length} sub={`${pct(shoppable.length, pStats.totalSaves)} of all saves`} icon={ShoppingBag} color="#FD5897" />
          <KpiCard label="Total Clicks" value={totalClicks} sub="Buy Now taps" icon={MousePointerClick} color="#a855f7" />
          <KpiCard label="Avg CTR" value={ctr.toFixed(2)} sub="clicks per shoppable save" icon={Percent} color="#3b82f6" />
          <KpiCard label="Has Links" value={withLinks.length} sub={`${missingLinks.length} still missing`} icon={TrendingUp} color="#10b981" />
        </div>
      </div>

      {/* ── Clicks by category chart ── */}
      {byCategory.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold">Clicks by Category</h2>
          <ResponsiveContainer width="100%" height={Math.max(180, byCategory.length * 40)}>
            <BarChart data={byCategory} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
              <Tooltip
                cursor={{ fill: "#f5f5f5" }}
                contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid #e5e7eb" }}
                formatter={(value: number, name: string) => [
                  name === "clicks" ? `${value} clicks` : `${value} saves`,
                  name === "clicks" ? "Buy Now Clicks" : "Shoppable Saves",
                ]}
              />
              <Bar dataKey="shoppable" fill="#FD589725" radius={[0, 4, 4, 0]} name="shoppable" />
              <Bar dataKey="clicks" radius={[0, 4, 4, 0]} name="clicks">
                {byCategory.map((_, i) => (
                  <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Light bar = shoppable saves · Dark bar = Buy Now clicks
          </p>
        </div>
      )}

      {byCategory.length === 0 && shoppable.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-8 text-center">
          <ShoppingBag className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">No shoppable saves yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Save a product link or re-extract an existing save to generate shoppable data.
          </p>
        </div>
      )}

      {/* ── Top clicked saves ── */}
      {topSaves.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/40 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                <MousePointerClick className="h-3.5 w-3.5 text-primary" />
              </span>
              <h2 className="text-sm font-bold">Top Clicked Saves</h2>
            </div>
          </div>
          <ul className="divide-y divide-border/30">
            {topSaves.map((item, i) => (
              <li key={item.id}>
                <Link
                  to="/item/$id"
                  params={{ id: item.id }}
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-accent/30"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium leading-snug">{item.product_name || item.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {[item.product_brand, item.category || item.type].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                      {item.affiliate_click_count}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Top brands + CTR by category (side-by-side on desktop) ── */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {topBrands.length > 0 && (
          <div className="rounded-2xl border border-border/40 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border/40 px-5 py-3.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100">
                <Tag className="h-3.5 w-3.5 text-violet-500" />
              </span>
              <h2 className="text-sm font-bold">Top Clicked Brands</h2>
            </div>
            <ul className="divide-y divide-border/30 px-5 py-1">
              {topBrands.map(({ brand, clicks }, i) => (
                <li key={brand} className="flex items-center gap-3 py-2.5">
                  <span className="text-[11px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="truncate text-sm font-medium">{brand}</p>
                      <span className="ml-2 shrink-0 text-xs font-bold text-primary">{clicks}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${(clicks / maxBrandClicks) * 100}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {byCategory.length > 0 && (
          <div className="rounded-2xl border border-border/40 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border/40 px-5 py-3.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50">
                <Percent className="h-3.5 w-3.5 text-blue-500" />
              </span>
              <h2 className="text-sm font-bold">CTR by Category</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Category</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Saves</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Clicks</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {byCategory.map(({ category, shoppable: sh, clicks }) => (
                  <tr key={category} className="hover:bg-accent/20 transition-colors">
                    <td className="px-5 py-2.5 font-medium">{category}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{sh}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-primary">{clicks}</td>
                    <td className="px-5 py-2.5 text-right">
                      <span className={`font-bold ${clicks > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                        {pct(clicks, sh)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Missing links — needs attention ── */}
      {missingLinks.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border/40 px-5 py-3.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-50">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            </span>
            <div className="flex-1">
              <h2 className="text-sm font-bold">Missing Product Link</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {missingLinks.length} shoppable save{missingLinks.length !== 1 ? "s" : ""} without an affiliate or product URL — Buy Now has nowhere to point.
              </p>
            </div>
          </div>
          <ul className="divide-y divide-border/30">
            {missingLinks.slice(0, 15).map((item) => (
              <li key={item.id}>
                <Link
                  to="/item/$id"
                  params={{ id: item.id }}
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-accent/30"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Package className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{item.product_name || item.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.category || item.type}{item.product_brand ? ` · ${item.product_brand}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Add link
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </div>
                </Link>
              </li>
            ))}
            {missingLinks.length > 15 && (
              <li className="px-5 py-3 text-xs text-muted-foreground">
                +{missingLinks.length - 15} more — re-extract or edit each save to add links.
              </li>
            )}
          </ul>
        </div>
      )}

      {/* ── All-clear state ── */}
      {missingLinks.length === 0 && shoppable.length > 0 && (
        <div className="rounded-2xl border border-green-100 bg-green-50/50 p-5 flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
            <TrendingUp className="h-4 w-4 text-green-600" />
          </span>
          <div>
            <p className="text-sm font-semibold text-green-800">All shoppable saves have product links!</p>
            <p className="text-xs text-green-700 mt-0.5">Every Buy Now button has a destination.</p>
          </div>
        </div>
      )}

    </div>
  );
}
