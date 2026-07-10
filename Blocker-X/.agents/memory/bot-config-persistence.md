---
name: Bot config persistence
description: Why bot config written to local files is lost on restart, and how the platform auto-syncs them to R2
---

**Rule:** Bot working directories are wiped on every restart (`rmSync` before `downloadBotFiles`). Config files the bot writes locally are preserved by syncing them to R2 before the wipe, then re-downloading them — no code changes needed in the bot.

**Why:** `/tmp/blockerx-bots/{botId}/` is wiped on each `spawnBotProcess` call. On Render, the ephemeral disk also resets on redeploy. Any data the bot writes locally (e.g. `data/bienvenida_config.json`) is permanently lost unless synced to R2 first.

**Solution implemented: automatic sync-before-wipe**
- `syncWorkdirToR2(botId, r2Prefix, workDir)` in `process-manager.ts` — called before `rmSync`, walks the workdir and uploads all bot-owned files to R2
- Uses `lstat` (not `stat`) to detect and skip symlinks, preventing traversal outside workDir
- Enforces `realpath` containment on every file before reading
- Policy skips (not counted as failures): symlinks, `BX_PLATFORM_FILES` (`_bx_inject.py`, `_bx_run.py`, `bx_config.py`), `SKIP_DIRS` (`__pycache__`, `node_modules`, etc.), `.pyc`, files > 50 MB
- Real I/O errors (readdir, lstat, realpath, upload) are counted in `failed` and logged
- Returns `{ uploaded, failed }` — `downloadBotFiles` logs a warning on failures but continues (restart priority > perfect sync)

**R2 deletion fix:**
- `r2DeletePrefix` loops with `ContinuationToken` so it handles >1000 objects; bot deletion now fully cleans up all synced data files

**bx_config.py still available for explicit use:**
- Bots that want explicit programmatic config can still `from bx_config import load_config, save_config`
- Config stored at `{r2Prefix}/_config/{key}.json`
- Auth: `X-Bot-Id` + `X-Bot-Token` (HMAC-SHA256 of botId with SESSION_SECRET)

**How files survive restarts:**
1. Bot writes `data/bienvenida_config.json` locally
2. On restart: `syncWorkdirToR2` uploads it to R2 at `{r2Prefix}/data/bienvenida_config.json`
3. `rmSync` wipes workDir
4. `downloadBotFiles` re-downloads from R2 — file is back
5. Bot reads it normally — no code changes needed
