# Blocker X

A Discord bot hosting platform where developers can manage, deploy, and monitor Python/JS bots via a web dashboard. Features real-time logging, environment management, Cloudflare R2-backed file storage, and an AI assistant.

## Architecture

**Monorepo** managed with `pnpm` workspaces.

| Package | Path | Purpose |
|---|---|---|
| `@workspace/blockerx` | `artifacts/blockerx` | React 19 + Vite 7 frontend (port 5000) |
| `@workspace/api-server` | `artifacts/api-server` | Node/Express 5 API (port 8080) |
| `@workspace/db` | `lib/db` | Drizzle ORM schema + migrations (Neon PostgreSQL) |
| `@workspace/api-spec` | `lib/api-spec` | OpenAPI spec driving codegen |
| `@workspace/api-zod` | `lib/api-zod` | Generated Zod schemas from OpenAPI |
| `@workspace/mockup-sandbox` | `artifacts/mockup-sandbox` | Vite preview server for canvas mockups |

## Running the Project

### Workflows
- **Start application** — Frontend dev server: `BASE_PATH=/ PORT=5000 pnpm --filter @workspace/blockerx run dev`
- **API Server** — Express API: `cd artifacts/api-server && PORT=8080 NODE_ENV=development pnpm run dev`

### One-off commands
```bash
# Install dependencies
pnpm install

# Push DB schema to Neon
cd lib/db && pnpm run push

# Regenerate API codegen (after editing lib/api-spec/openapi.yaml)
pnpm --filter @workspace/api-zod run generate
```

## Required Secrets

| Secret | Purpose |
|---|---|
| `SESSION_SECRET` | Express session signing |
| `NEON_DATABASE_URL` | Neon PostgreSQL connection string |
| `DISCORD_CLIENT_ID` | Discord OAuth2 app ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth2 app secret |
| `CF_R2_ACCOUNT_ID` | Cloudflare R2 account |
| `CF_R2_ACCESS_KEY_ID` | R2 access key |
| `CF_R2_SECRET_ACCESS_KEY` | R2 secret key |
| `CF_R2_BUCKET_NAME` | R2 bucket name |
| `GROQ_API_KEY` | Groq LLM API key (optional — AI features) |

## Key Implementation Notes

- **Discord OAuth redirect URI** is built dynamically from `REPLIT_DOMAINS`/`REPLIT_DEV_DOMAIN` env vars in `artifacts/api-server/src/lib/auth.ts`
- **Bot files** are stored in R2 under `users/{discordId}/bots/{botId}/`; file paths are not tracked in the DB
- **Dark mode** is forced via `document.documentElement.classList.add("dark")` in `artifacts/blockerx/src/main.tsx`
- **Owner Discord ID** `1237892993013387307` is hardcoded to bypass invite gates in `artifacts/api-server/src/lib/auth-middleware.ts`
- **API codegen**: `lib/api-zod/src/index.ts` uses explicit named exports to avoid Params type collisions

## User Preferences
