---
name: Render deploy structure
description: Why the repo root (not a nested subfolder) must be the Render deploy source, and what the build must run.
---

The repo previously had a full duplicate copy of the whole pnpm workspace nested inside a `Blocker-X/` subfolder, with `render.yaml` pointing `rootDir: Blocker-X` at it. This happened during a prior attempt to fix Render deploys and was left half-finished (last commit on `replit-agent` was literally "Error no arreglado"). It was consolidated so the repo root is the only copy and `rootDir: .`.

**Why:** a nested duplicate workspace is fragile and confusing — two `artifacts/`, two `lib/`, two package.jsons drifting apart. Any future "fix the deploy" request should first check for this pattern (`find . -maxdepth 1 -iname "*blocker*"` or similar) before editing config, since editing `render.yaml` alone won't help if it points at a stale duplicate.

**How to apply:** if asked to fix this project's deploy again, verify there is exactly one workspace at the repo root before touching `render.yaml`/env vars. Also verify `render.yaml`'s `buildCommand` includes `pnpm --filter @workspace/db run push` — without it a fresh Render Postgres has no tables and the server crashes on first boot (only a handful of legacy tables/columns are patched in-process at startup, not the full schema).
