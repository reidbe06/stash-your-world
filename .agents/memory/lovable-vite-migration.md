---
name: Lovable vite config migration
description: How @lovable.dev/vite-tanstack-config was replaced with a standard Vite config for STASHd
---

## What the Lovable config bundled
- `@tailwindcss/vite`, `vite-tsconfig-paths`, `@vitejs/plugin-react` — standard, replicated directly
- `tanstackStart` from `@tanstack/react-start/plugin/vite` — the key TanStack Start plugin
- `lovable-tagger` (componentTagger) — Lovable visual editor only, dropped
- `@lovable.dev/vite-plugin-dev-server-bridge` — Lovable sandbox only, dropped
- `@lovable.dev/vite-plugin-hmr-gate` — Lovable sandbox only, dropped
- nitro plugin — only ran inside Lovable sandbox (`LOVABLE_SANDBOX=1`); **skipped on Replit**

## Why nitro plugin is NOT needed on Replit
The Lovable config skips nitro when `isSandbox = false` (i.e. outside Lovable). On Replit, `LOVABLE_SANDBOX` is never set, so nitro was already being skipped. The CF Workers format output (`dist/server/server.js`) comes from `tanstackStart`'s own build, not the nitro plugin.

## Standard replacement config
```ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import path from "node:path";
```

**Why:** tanstackStart needs importProtection + server entry config to match the old behavior. resolve.dedupe prevents duplicate React/TanStack instances in SSR.
**How to apply:** Use this pattern for any future rebuild from scratch.
