---
name: TanStack Router search param → state sync
description: useState initial values from Route.useSearch() don't update on same-route navigation
---

## Rule

When a component initializes state from `Route.useSearch()` via `useState(initialParam)`,
that state will NOT update if the user navigates to the same route with different search
params (TanStack Router reuses the mounted component instead of remounting).

## Fix

Add a `useEffect` to sync the URL param to local state whenever the param changes:

```typescript
const { type, sub: initialSub } = Route.useSearch();
const [subcategory, setSubcategory] = useState(initialSub || "");

useEffect(() => {
  setSubcategory(initialSub || "");
}, [initialSub]);
```

**Why:** TanStack Router's file-based routing keeps components mounted across same-route
navigations (e.g., dashboard → /search?sub=A, then dashboard → /search?sub=B). Without
the effect, the second navigation appears to do nothing because state is stale.

**How to apply:** Any route that reads initial state from search params AND needs to
respond to subsequent navigations with new params must sync with useEffect.
