import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin-debug")({
  head: () => ({ meta: [{ title: "Admin Debug" }] }),
  component: AdminDebugPage,
});

function AdminDebugPage() {
  const { user, loading: authLoading } = useAuth();

  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ["debug-profile", user?.id],
    enabled: !!user,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const isAdminRaw = (profile as any)?.is_admin;
  const isAdmin = isAdminRaw === true;

  const redirectReason = !user
    ? "No authenticated user found"
    : !profile
    ? "No profile row found matching this user_id"
    : isAdminRaw === undefined
    ? "is_admin column is MISSING from profile row (migration not run?)"
    : isAdminRaw === null
    ? "is_admin column exists but value is NULL"
    : isAdminRaw === false
    ? "is_admin is explicitly FALSE — UPDATE not applied to this row"
    : isAdmin
    ? "✅ Admin check PASSES — redirect should not occur"
    : `Unexpected is_admin value: ${JSON.stringify(isAdminRaw)}`;

  const loading = authLoading || profileLoading;

  return (
    <div className="mx-auto max-w-2xl p-8 font-mono text-sm space-y-6">
      <div className="rounded-2xl border-2 border-blue-400 bg-blue-50 p-6 space-y-4">
        <p className="text-base font-bold text-blue-800">🔍 Admin Diagnostic Panel</p>

        <div className="space-y-3 text-blue-900">
          <Row label="Auth loading" value={String(authLoading)} />
          <Row label="Profile loading" value={String(profileLoading)} />
          <hr className="border-blue-200" />
          <Row label="User email" value={user?.email ?? "— not found"} />
          <Row label="Auth user_id" value={user?.id ?? "— not found"} />
          <hr className="border-blue-200" />
          {loading ? (
            <p className="italic text-blue-500">Loading profile…</p>
          ) : profileError ? (
            <Row label="Profile error" value={String(profileError)} />
          ) : (
            <>
              <Row label="Profile found" value={profile ? "YES" : "NO"} />
              <Row label="Profile user_id" value={(profile as any)?.user_id ?? "—"} />
              <Row label="Profile id" value={(profile as any)?.id ?? "—"} />
              <Row label="is_admin (raw)" value={String(isAdminRaw)} />
              <Row label="is_admin (hook)" value={String(isAdmin)} />
            </>
          )}
          <hr className="border-blue-200" />
          <Row
            label="Verdict"
            value={loading ? "…loading" : redirectReason}
            highlight={!loading && !isAdmin}
          />
          <hr className="border-blue-200" />
          <div className="flex gap-2 flex-wrap">
            <span className="font-semibold w-36 shrink-0">Raw profile JSON:</span>
            <span className="break-all whitespace-pre-wrap text-xs">
              {loading ? "…" : JSON.stringify(profile, null, 2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold w-44 shrink-0">{label}:</span>
      <span className={highlight ? "font-bold text-red-700" : ""}>{value}</span>
    </div>
  );
}
