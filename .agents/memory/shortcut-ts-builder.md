---
name: iOS Shortcut TS builder
description: Why Python was replaced with a TS plist builder for shortcut generation, and how the endpoint works
---

# iOS Shortcut generation — TS builder

**Rule:** Never use `spawnSync("python3", ...)` for shortcut generation. Use `src/lib/shortcut-builder.server.ts` directly.

**Why:** Python startup in the Replit container takes 5-30s. The endpoint timeout was 10s, so ~half of requests timed out and returned JSON instead of a plist. iOS Shortcuts parsed JSON as invalid → "Import Failed — The shortcut URL provided was invalid."

**How to apply:**
- `buildShortcut({ saveEndpoint, tokenValue, personal, version })` returns a `Buffer` of XML plist.
- Personal shortcut: `tokenValue = saveToken`, `personal: true`, `WFWorkflowImportQuestions = []`.
- Generic shortcut: `tokenValue = ""`, `personal: false`, `WFWorkflowImportQuestions` has one entry for the token.
- WFURL must be a `WFTextTokenString` dict — plain string causes "The shortcut URL provided was invalid" on iOS 15+.
- TanStack Start server handlers respond to raw HTTP GET (Accept: */*) with the correct content — verified.
- Version marker in `WFWorkflowName` (e.g. "v2") lets users confirm they received the new file.
