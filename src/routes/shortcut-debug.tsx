import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/shortcut-debug")({
  head: () => ({ meta: [{ title: "Shortcut Debug — STASHd" }] }),
  component: ShortcutDebug,
});

function ShortcutDebug() {
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setLog([]);
    const add = (line: string) => setLog(prev => [...prev, line]);

    try {
      add("── Step 1: get Supabase session ──");
      const { data: sess } = await supabase.auth.getSession();
      const bearer = sess.session?.access_token;
      if (!bearer) { add("ERROR: no session"); return; }
      add("session: ok");

      add("");
      add("── Step 2: POST /api/me/shortcut-upload ──");
      const res = await fetch("/api/me/shortcut-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
      });
      add(`HTTP status: ${res.status}`);
      add(`Content-Type: ${res.headers.get("content-type")}`);

      if (!res.ok) {
        add(`ERROR body: ${await res.text()}`);
        return;
      }

      const json = await res.json() as { url: string; shortcutsDeepLink: string };
      add("");
      add("── Step 3: returned values ──");
      add(`raw .shortcut URL:\n  ${json.url}`);
      add(`encoded url= param:\n  ${encodeURIComponent(json.url)}`);
      add(`full shortcuts:// deep link:\n  ${json.shortcutsDeepLink}`);
      add(`format check: ${json.shortcutsDeepLink.split("?")[0]}`);

      add("");
      add("── Step 4: probe .shortcut URL ──");
      const probe = await fetch(json.url);
      add(`HTTP status: ${probe.status}`);
      add(`Content-Type: ${probe.headers.get("content-type")}`);
      const buf = await probe.arrayBuffer();
      add(`bytes: ${buf.byteLength}`);
      const arr = new Uint8Array(buf.slice(0, 40));
      const hex = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join(" ");
      const txt = new TextDecoder().decode(arr);
      add(`first 40 bytes (hex): ${hex}`);
      add(`first 40 bytes (text): ${txt.replace(/\n/g, "↵")}`);
      const isPlist = txt.includes("<?xml") || txt.includes("plist");
      add(`is valid plist: ${isPlist ? "YES ✓" : "NO ✗ — not a plist!"}`);

      add("");
      add("── Step 5: final deep link to open ──");
      add(json.shortcutsDeepLink);

    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-4">
      <h1 className="text-xl font-bold">Shortcut Debug</h1>
      <p className="text-sm text-muted-foreground">
        Shows the exact URLs being generated for your account. No redaction except Supabase project ID is already public.
      </p>

      <button
        onClick={run}
        disabled={running}
        className="rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {running ? "Running…" : "Run debug check"}
      </button>

      {log.length > 0 && (
        <pre className="whitespace-pre-wrap break-all rounded-xl border bg-black p-4 text-xs text-green-400 font-mono leading-relaxed">
          {log.join("\n")}
        </pre>
      )}
    </div>
  );
}
