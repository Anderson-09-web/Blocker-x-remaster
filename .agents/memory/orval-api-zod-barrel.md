---
name: Orval codegen mutates hand-written api-zod barrel
description: orval codegen run appends duplicate wildcard exports to a hand-written barrel file, reintroducing type-name collisions.
---

When a project's `lib/api-zod/src/index.ts` is hand-written to re-export named types explicitly (`export type { A, B, ... } from "./generated/types"`) instead of using `export *` — done specifically to avoid `TS2308` "already exported a member" collisions between `./generated/api` and `./generated/types` for names that exist as both a runtime schema and a type (e.g. `*Params` types used by query-param schemas) — running `orval` (e.g. via `pnpm --filter @workspace/api-spec run codegen`) appends two extra lines to the end of that file on every run:

```
export * from './generated/api';
export * from './generated/types';
```

These are exact/wildcard duplicates that reintroduce the same collisions the named exports were written to avoid, breaking `tsc --build` / `typecheck:libs` with `TS2308` errors on the colliding names.

**Why:** Orval's zod client generator writes/touches the workspace barrel file as part of its output step even when `clean: true` is scoped to the `generated/` subfolder — this appears to be current behavior of orval v8.20.0, not a one-off fluke (reproduced twice, and isolated to the `orval` step by running it without the chained typecheck).

**How to apply:** After every `orval` codegen run in a project with this hand-written barrel pattern, immediately re-open `lib/api-zod/src/index.ts` and delete the two trailing `export * from './generated/...'` lines before running typecheck. Consider scripting this as a post-codegen step if it recurs often.
