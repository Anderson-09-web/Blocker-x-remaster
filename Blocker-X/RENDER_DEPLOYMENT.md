# Blocker X — Render Deployment Guide

This guide covers deploying Blocker X to [Render](https://render.com).

---

## Prerequisites

- A Render account (free tier works)
- Neon PostgreSQL database created at [neon.tech](https://neon.tech)
- Cloudflare R2 bucket created at [Cloudflare dashboard](https://dash.cloudflare.com)
- Discord application with OAuth2 and a bot token at [Discord Developer Portal](https://discord.com/developers/applications)
- Groq API key at [console.groq.com](https://console.groq.com)

---

## Step 1 — Fork / Clone

```bash
git clone <your-repo-url>
cd blockerx
```

---

## Step 2 — Create Render Services

### Option A: Using render.yaml (recommended)

1. Connect your GitHub repo to Render
2. Render will auto-detect `render.yaml` and create both services
3. Fill in the environment variables (see Step 3)

### Option B: Manual setup

**API Server:**
- Type: Web Service
- Runtime: Node
- Build Command: `pnpm install && pnpm --filter @workspace/api-server run build`
- Start Command: `node artifacts/api-server/dist/index.mjs`
- Health Check: `/api/healthz`

**Frontend:**
- Type: Static Site
- Build Command: `pnpm install && pnpm --filter @workspace/blockerx run build`
- Publish Directory: `artifacts/blockerx/dist`
- Add rewrite rule: `/* -> /index.html`

---

## Step 3 — Environment Variables

Set these on the **API Server** service:

| Variable | Description |
|---|---|
| `NODE_ENV` | Set to `production` |
| `PORT` | Set to `10000` (Render default) |
| `NEON_DATABASE_URL` | Full Neon PostgreSQL connection string |
| `DISCORD_CLIENT_ID` | Discord OAuth2 application client ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth2 application client secret |
| `DISCORD_BOT_TOKEN` | Discord bot token for notifications |
| `CF_R2_ACCOUNT_ID` | Cloudflare account ID |
| `CF_R2_ACCESS_KEY_ID` | R2 API token access key |
| `CF_R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `CF_R2_BUCKET_NAME` | R2 bucket name |
| `CF_R2_ENDPOINT` | R2 endpoint URL (`https://<account-id>.r2.cloudflarestorage.com`) |
| `GROQ_API_KEY` | Groq API key |
| `SESSION_SECRET` | Random 32+ character secret for sessions |
| `RENDER_APP_URL` | Full URL of your frontend (e.g. `https://blockerx.onrender.com`) |

---

## Step 4 — Discord OAuth2 Redirect URI

In the Discord Developer Portal, add your Render API URL as an OAuth2 redirect:

```
https://blockerx-api.onrender.com/api/auth/callback
```

Replace `blockerx-api` with your actual Render service name.

---

## Step 5 — Database Migration

The build command includes `pnpm --filter @workspace/db run push` which runs Drizzle migrations automatically on each deploy.

If you need to run it manually:

```bash
NEON_DATABASE_URL=<your-url> pnpm --filter @workspace/db run push
```

---

## Step 6 — Deploy

Push to your main branch. Render will automatically build and deploy.

---

## Bot Runtime Requirements

Blocker X runs Discord bots as real child processes on the API server. For this to work on Render:

- **Python bots**: Render's Node runtime has `python3` available. The platform runs `pip3 install -r requirements.txt` then `python3 main.py`.
- **JavaScript bots**: Runs `npm install` then `node index.js`.
- **Files**: All bot files are downloaded from Cloudflare R2 into `/tmp/blockerx-bots/<botId>/` before each start.

For production scale, consider upgrading to Render's Standard plan to avoid cold starts affecting bot uptime.

---

## Plan Behavior

| Feature | Free Plan | Premium Plan |
|---|---|---|
| Bot uptime | Forced restart 2x/day | True 24/7 |
| Auto-restart on crash | Yes | Yes |
| Groq AI requests | 10 lifetime | Unlimited |
| Priority execution | No | Yes |

---

## Troubleshooting

**Bot won't start:**
- Check that `DISCORD_TOKEN` is set as an env var on the bot (via the Env Vars tab in the dashboard)
- Verify the bot token is valid in the Discord Developer Portal
- Check bot logs in the dashboard Console tab

**OAuth login fails:**
- Verify the redirect URI in Discord Developer Portal matches exactly
- Check `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are set correctly

**Files not persisting:**
- All files are in Cloudflare R2, never on disk — verify R2 credentials are correct
- Test R2 access by uploading a file through the File Manager
