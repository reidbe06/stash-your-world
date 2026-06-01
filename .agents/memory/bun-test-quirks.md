---
name: Bun test quirks
description: Known bun test limitations and configuration behavior for this project
---

## Reporter formats
Only `junit` and `dots` are supported. `--reporter=verbose` fails with an error.
Use plain `bun test src/tests/` for the default (grouped) output.

## Path aliases
Bun reads `tsconfig.json` `paths` automatically — `@/*` → `./src/*` works in test files.
However, test files use relative imports (`../lib/...`) as a safer fallback.

## Module resolution
Bun runs TypeScript natively. Files with Node/browser-specific globals (e.g. `document`) fail if imported at module level. Server files that use `process.env` in function bodies are fine — they're only evaluated when called.

## package.json script
```json
"test": "bun test src/tests/"
```
