# Blocker X

A Discord bot hosting platform: web dashboard for uploading, deploying, and monitoring Python/JS Discord bots, with live logs, environment variable management, file storage, webhooks, and an AI coding assistant.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/blockerx run dev` — run the web dashboard
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec (see Gotchas below)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env/secrets: `NEON_DATABASE_URL` (Postgres), `SESSION_SECRET`, `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` (OAuth), `CF_R2_ACCOUNT_ID`/`CF_R2_ACCESS_KEY_ID`/`CF_R2_SECRET_ACCESS_KEY`/`CF_R2_BUCKET_NAME` (bot file storage), `GROQ_API_KEY` (AI assistant)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite 7, wouter, TanStack Query, Radix UI/shadcn, Tailwind, Framer Motion
- API: Express 5, `express-session` + `connect-pg-simple` (Postgres-backed sessions)
- DB: Neon Postgres + Drizzle ORM (kept as the original Neon DB rather than migrating to a Replit-native DB)
- Object storage: Cloudflare R2 (kept as-is, via `@aws-sdk/client-s3`) — not Replit App Storage
- AI assistant: Groq (`llama-3.3-70b-versatile`) via `GROQ_API_KEY` — kept instead of switching to Replit AI Integrations, which required an account upgrade the user declined
- Auth: Discord OAuth (own Discord app, not Replit Auth)
- API codegen: Orval (from OpenAPI spec) → `@workspace/api-client-react` (frontend hooks) + `@workspace/api-zod` (schemas)

## Where things live

- `artifacts/blockerx` — web dashboard (frontend)
- `artifacts/api-server` — Express API (`src/routes/*`, `src/lib/*`)
- `lib/db` — Drizzle schema (`src/schema/*`) and DB connection
- `lib/api-spec/openapi.yaml` — source of truth for the API contract; edit this then run codegen
- `attached_assets/` — static assets referenced via the `@assets` Vite alias

## Architecture decisions

- This project was imported from an external GitHub repo (`Anderson-09-web/Blocker-x-remaster`, `replit-agent` branch) and adapted to run in this Replit monorepo, while preserving its original Neon/R2/Groq/Discord-OAuth architecture for eventual deployment to Northflank.
- `app.ts` was adapted to drop the original's manual dev-mode proxy to the frontend dev server (`http-proxy-middleware`) and static-file serving for production — Replit's artifact routing already handles both, so only CORS + session + `/api` mounting remain.
- Plan tiers are `"free" | "plus" | "blockerx"` throughout the app (routes, frontend). The OpenAPI spec originally had a stale `UserPlan` enum (`free, premium`) that didn't match — fixed to `[free, plus, blockerx]`.

## Product

- Discord OAuth login, invite-gated access (admin bypass for the owner's Discord ID)
- Upload/manage Python or JS Discord bots, start/stop/monitor process status, live logs
- Per-bot file manager backed by Cloudflare R2, environment variable manager, webhooks
- AI coding assistant (Groq) that can read/edit bot files, with daily usage limits by plan
- Admin panel: user list, invite code management, plan grants, system stats

## User preferences

- Keep Neon Postgres, Cloudflare R2, and Groq as the AI provider — do not migrate these to Replit-native equivalents.

## Gotchas

- Running `orval` (via `pnpm --filter @workspace/api-spec run codegen`) appends two extra lines (`export * from './generated/api'` and `export * from './generated/types'`) to the end of the hand-written `lib/api-zod/src/index.ts` every time it runs. These duplicate/wildcard-reintroduce type names that the file deliberately re-exports individually to dodge `TS2308` collisions (e.g. `GetBotLogsParams`, `ListFilesParams`). After every codegen run, remove those two appended lines from `lib/api-zod/src/index.ts` before typechecking.
- Drizzle `eq()`/`and()` comparisons against `text()` columns fail to typecheck when compared directly to `req.params.id` in Express 5 (typed as `string | string[]`) — cast with `String(req.params.id)` first.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
