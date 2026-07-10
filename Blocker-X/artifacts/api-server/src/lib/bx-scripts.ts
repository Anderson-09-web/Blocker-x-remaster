/**
 * bx-scripts.ts — Scripts Python que BlockerX inyecta en cada bot al iniciarlo.
 *
 * _bx_inject.py : Parcha discord.Client.__init__ para agregar un listener on_ready
 *                 que aplica BOT_STATUS. Funciona con Client, commands.Bot y cualquier subclase,
 *                 incluso si el usuario sobreescribe setup_hook.
 *
 * _bx_run.py    : Lanzador que importa el parche y luego corre el archivo principal del
 *                 usuario con runpy para que __name__ == "__main__" funcione normalmente.
 */
export function getBxInjectPy(): string {
  return `\
# _bx_inject.py — generado por BlockerX, no editar
# Aplica presencia al inicio y la actualiza en tiempo real (polling cada 10s).
# No es necesario reiniciar el bot para cambiar estado o actividad desde el panel.
import os as _os
import sys as _sys
import asyncio as _asyncio
import json as _json
import urllib.request as _ureq
import time as _time_mod
import math as _math_mod
import signal as _signal_mod

_BX_API_URL = _os.getenv("BX_API_URL", "http://127.0.0.1:3001")
_BX_BOT_ID  = _os.getenv("BX_BOT_ID", "")
_BX_TOKEN   = _os.getenv("BX_INTERNAL_TOKEN", "")

def _bx_headers():
    return {"X-Bot-Id": _BX_BOT_ID, "X-Bot-Token": _BX_TOKEN}

try:
    import discord as _d

    _BX_STATUS_MAP = {
        "online":    _d.Status.online,
        "idle":      _d.Status.idle,
        "dnd":       _d.Status.dnd,
        "invisible": _d.Status.invisible,
    }
    _BX_ACTIVITY_MAP = {
        "playing":   _d.ActivityType.playing,
        "watching":  _d.ActivityType.watching,
        "listening": _d.ActivityType.listening,
        "streaming": _d.ActivityType.streaming,
        "competing": _d.ActivityType.competing,
    }

    _bx_startup_time = None

    def _bx_resolve_vars(client, text):
        """Replace dynamic variables like {users}, {guilds}, {latency}, {uptime}, {channels}, {commands}.
        Each variable is resolved independently so a failure in one doesn't block the others."""
        if "{" not in text:
            return text

        # {guilds}
        if "{guilds}" in text:
            try:
                text = text.replace("{guilds}", str(len(list(client.guilds))))
            except Exception:
                text = text.replace("{guilds}", "?")

        # {users}
        if "{users}" in text:
            try:
                text = text.replace("{users}", str(sum(getattr(g, "member_count", 0) or 0 for g in client.guilds)))
            except Exception:
                text = text.replace("{users}", "?")

        # {channels}
        if "{channels}" in text:
            try:
                total = 0
                for g in client.guilds:
                    try:
                        total += len(g.channels)
                    except Exception:
                        pass
                text = text.replace("{channels}", str(total))
            except Exception:
                text = text.replace("{channels}", "?")

        # {latency} — guard against inf/nan/absurd values before heartbeat is stable
        if "{latency}" in text:
            try:
                lat = client.latency
                # discord.py reports heartbeat latency in seconds; anything above 5s
                # means the value isn't a real network ping yet (startup / event loop stall)
                if lat is None or _math_mod.isinf(lat) or _math_mod.isnan(lat) or lat > 5:
                    text = text.replace("{latency}", "...")
                else:
                    text = text.replace("{latency}", str(round(lat * 1000)))
            except Exception:
                text = text.replace("{latency}", "?")

        # {commands} — works for commands.Bot
        if "{commands}" in text:
            try:
                if hasattr(client, "all_commands"):
                    text = text.replace("{commands}", str(len(client.all_commands)))
                elif hasattr(client, "commands"):
                    cmds = client.commands
                    text = text.replace("{commands}", str(len(cmds)))
                else:
                    text = text.replace("{commands}", "0")
            except Exception:
                text = text.replace("{commands}", "0")

        # {uptime} — use time.monotonic() instead of asyncio event loop time
        if "{uptime}" in text:
            try:
                if _bx_startup_time is not None:
                    elapsed = _time_mod.monotonic() - _bx_startup_time
                    h = int(elapsed // 3600)
                    m = int((elapsed % 3600) // 60)
                    text = text.replace("{uptime}", f"{h}h {m}m" if h > 0 else f"{m}m")
                else:
                    text = text.replace("{uptime}", "0m")
            except Exception:
                text = text.replace("{uptime}", "?")

        return text

    def _bx_build_presence(status_str, act_type_str, act_text):
        status = _BX_STATUS_MAP.get(status_str, _d.Status.online)
        act_type = act_type_str.lower()
        if act_type == "none" or not act_text.strip():
            return status, None
        act_enum = _BX_ACTIVITY_MAP.get(act_type)
        if act_enum is None:
            return status, None
        if act_type == "streaming":
            return status, _d.Streaming(name=act_text, url="https://twitch.tv/placeholder")
        return status, _d.Activity(type=act_enum, name=act_text)

    def _bx_fetch_presence():
        """Fetch desired presence from BlockerX panel (sync, runs in executor)."""
        try:
            url = f"{_BX_API_URL}/api/bot-internal/presence"
            rq = _ureq.Request(url, headers=_bx_headers(), method="GET")
            with _ureq.urlopen(rq, timeout=4) as resp:
                data = _json.loads(resp.read().decode())
            return data.get("presence")
        except Exception:
            return None

    _bx_orig_dispatch = _d.Client.dispatch
    _bx_applied_update_at = None
    _bx_poll_task = None          # guard: only one polling task per client
    _bx_startup_time = None  # module-level alias used by _bx_resolve_vars

    # Anti-duplicate guard: Discord can occasionally re-deliver "message" and
    # "interaction" events to the client after a gateway RESUME (brief reconnect),
    # which makes bots answer the same command/interaction twice. We remember the
    # ids we already dispatched for a short window and drop exact repeats.
    _bx_seen_events = {}
    _BX_DEDUPE_EVENTS = {"message", "interaction"}
    _BX_DEDUPE_TTL = 10.0

    def _bx_is_duplicate_event(event, args):
        if event not in _BX_DEDUPE_EVENTS or not args:
            return False
        obj_id = getattr(args[0], "id", None)
        if obj_id is None:
            return False
        now = _time_mod.monotonic()
        key = (event, obj_id)
        last = _bx_seen_events.get(key)
        if last is not None and (now - last) < _BX_DEDUPE_TTL:
            return True
        _bx_seen_events[key] = now
        if len(_bx_seen_events) > 1000:
            cutoff = now - _BX_DEDUPE_TTL
            for k in [k for k, t in _bx_seen_events.items() if t < cutoff]:
                _bx_seen_events.pop(k, None)
        return False

    _bx_last_var_push = 0.0   # monotonic time of last dynamic-var presence push
    _BX_VAR_COOLDOWN = 15.0   # seconds between dynamic-var presence updates
    _bx_signal_registered = False

    async def _bx_check_and_apply_presence(client, force=False):
        """Fetch presence from the panel and apply it if it's new (or unconditionally
        when force=True, used by the "Aplicar ahora" button so it's guaranteed visible)."""
        global _bx_applied_update_at, _bx_last_var_push
        try:
            loop = _asyncio.get_event_loop()
            presence = await loop.run_in_executor(None, _bx_fetch_presence)
            if presence is None:
                return False
            updated_at = presence.get("updatedAt")
            raw_text = presence.get("activityText", "")
            has_vars = "{" in raw_text
            now = _time_mod.monotonic()
            is_new_save = updated_at != _bx_applied_update_at
            var_cooldown_ok = (now - _bx_last_var_push) >= _BX_VAR_COOLDOWN

            if not force and not is_new_save and not (has_vars and var_cooldown_ok):
                return False

            resolved_text = _bx_resolve_vars(client, raw_text)
            st, act = _bx_build_presence(
                presence.get("status", "online"),
                presence.get("activityType", "none"),
                resolved_text,
            )
            # Only mark as applied AFTER change_presence succeeds so failures retry.
            await client.change_presence(status=st, activity=act)
            _bx_applied_update_at = updated_at
            if has_vars or force:
                _bx_last_var_push = now
            return True
        except _asyncio.CancelledError:
            raise  # Let cancellation propagate
        except Exception:
            return False  # Never crash the bot on a poll error

    def _bx_patched_dispatch(self, event, *args, **kwargs):
        global _bx_applied_update_at, _bx_poll_task, _bx_startup_time, _bx_signal_registered
        if _bx_is_duplicate_event(event, args):
            return  # swallow duplicate re-dispatch, avoids answering twice
        _bx_orig_dispatch(self, event, *args, **kwargs)
        if event == "ready":
            async def _on_ready_presence():
                global _bx_applied_update_at, _bx_poll_task, _bx_startup_time, _bx_signal_registered
                await _asyncio.sleep(1)
                _bx_startup_time = _time_mod.monotonic()
                # Apply env-var presence on startup (resolve dynamic variables)
                status_str = _os.getenv("BOT_STATUS", "online")
                act_type   = _os.getenv("BOT_ACTIVITY_TYPE", "none")
                act_text   = _bx_resolve_vars(self, _os.getenv("BOT_ACTIVITY_TEXT", "").strip())
                st, act = _bx_build_presence(status_str, act_type, act_text)
                try:
                    await self.change_presence(status=st, activity=act)
                    print(f"[BlockerX] Presencia inicial: {status_str} / {act_type} / {act_text}", file=_sys.stderr, flush=True)
                except Exception as _e:
                    print(f"[BlockerX] Error presencia inicial: {_e}", file=_sys.stderr, flush=True)

                # Cancel previous poll task on reconnect to avoid duplicates
                if _bx_poll_task and not _bx_poll_task.done():
                    _bx_poll_task.cancel()

                async def _bx_poll_presence(client):
                    """Poll panel every 3s for config freshness.
                    - New panel saves (updatedAt changed) apply immediately.
                    - Dynamic vars ({users} etc.) re-resolve at most every 15s to avoid Discord rate limits."""
                    while True:
                        await _asyncio.sleep(3)
                        await _bx_check_and_apply_presence(client, force=False)

                _bx_poll_task = _asyncio.get_event_loop().create_task(_bx_poll_presence(self))

                # Register a signal handler once so the panel's "Aplicar ahora" button can
                # force an immediate re-check without waiting for the next poll tick.
                if not _bx_signal_registered:
                    try:
                        loop = _asyncio.get_event_loop()
                        client_ref = self
                        loop.add_signal_handler(
                            _signal_mod.SIGUSR2,
                            lambda: loop.create_task(_bx_check_and_apply_presence(client_ref, force=True)),
                        )
                        _bx_signal_registered = True
                    except Exception:
                        pass  # Signal handlers unsupported on this platform (e.g. Windows) — poll still works

            try:
                loop = _asyncio.get_event_loop()
                loop.create_task(_on_ready_presence())
            except Exception as _e:
                print(f"[BlockerX] No se pudo programar presencia: {_e}", file=_sys.stderr, flush=True)

    _d.Client.dispatch = _bx_patched_dispatch
    print("[BlockerX] Parche de presencia cargado (tiempo real activado).", file=_sys.stderr, flush=True)

except Exception as _bx_err:
    print(f"[BlockerX] Patch omitido: {_bx_err}", file=_sys.stderr, flush=True)
`;
}


export function getBxRunPy(mainFile: string): string {
  const quotedMain = JSON.stringify(mainFile);
  return `\
# _bx_run.py — generado por BlockerX, no editar
# Importa el patch de presencia y luego ejecuta el bot del usuario.
import _bx_inject  # noqa: F401  — debe importarse antes que discord
import runpy as _runpy

_runpy.run_path(${quotedMain}, run_name="__main__")
`;
}

/**
 * _bx_preload.js — inyectado con `node -r ./_bx_preload.js index.js` para bots de JS.
 * Equivalente al guard anti-duplicados de _bx_inject.py: Discord puede reenviar
 * "messageCreate"/"interactionCreate" tras un RESUME del gateway (reconexion breve),
 * lo que hace que el bot responda dos veces al mismo mensaje o interaccion.
 * No modifica el codigo del usuario, solo envuelve la emision de eventos.
 */
export function getBxPreloadJs(): string {
  return `\
// _bx_preload.js — generado por BlockerX, no editar
try {
  const { Client, ActivityType } = require("discord.js");
  const _bxSeen = new Map(); // "event:id" -> timestamp
  const _BX_DEDUPE_EVENTS = new Set(["messageCreate", "interactionCreate"]);
  const _BX_DEDUPE_TTL_MS = 10000;

  const _bxOrigEmit = Client.prototype.emit;
  Client.prototype.emit = function (event, ...args) {
    if (_BX_DEDUPE_EVENTS.has(event) && args[0] && args[0].id) {
      const key = event + ":" + args[0].id;
      const now = Date.now();
      const last = _bxSeen.get(key);
      if (last !== undefined && now - last < _BX_DEDUPE_TTL_MS) {
        return false; // duplicate re-dispatch — swallow it, avoids answering twice
      }
      _bxSeen.set(key, now);
      if (_bxSeen.size > 1000) {
        for (const [k, t] of _bxSeen) {
          if (now - t > _BX_DEDUPE_TTL_MS) _bxSeen.delete(k);
        }
      }
    }
    if (event === "ready" && !_bxClient) {
      _bxClient = this;
      _bxStartPresence(this);
    }
    return _bxOrigEmit.call(this, event, ...args);
  };

  // --- Presencia en tiempo real (equivalente a _bx_inject.py para bots de Python) ---
  const _BX_API_URL = process.env.BX_API_URL || "http://127.0.0.1:3001";
  const _BX_BOT_ID  = process.env.BX_BOT_ID || "";
  const _BX_TOKEN   = process.env.BX_INTERNAL_TOKEN || "";
  const _BX_ACTIVITY_MAP = {
    playing: ActivityType.Playing,
    watching: ActivityType.Watching,
    listening: ActivityType.Listening,
    streaming: ActivityType.Streaming,
    competing: ActivityType.Competing,
  };

  let _bxClient = null;
  let _bxStartupTime = null;
  let _bxAppliedUpdateAt = null;
  let _bxLastVarPush = 0;
  const _BX_VAR_COOLDOWN_MS = 15000;

  function _bxResolveVars(client, text) {
    if (!text || text.indexOf("{") === -1) return text;
    try {
      if (text.includes("{guilds}")) text = text.replaceAll("{guilds}", String(client.guilds.cache.size));
    } catch (e) { text = text.replaceAll("{guilds}", "?"); }
    try {
      if (text.includes("{users}")) {
        const total = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0);
        text = text.replaceAll("{users}", String(total));
      }
    } catch (e) { text = text.replaceAll("{users}", "?"); }
    try {
      if (text.includes("{channels}")) {
        const total = client.guilds.cache.reduce((sum, g) => sum + (g.channels?.cache?.size || 0), 0);
        text = text.replaceAll("{channels}", String(total));
      }
    } catch (e) { text = text.replaceAll("{channels}", "?"); }
    try {
      if (text.includes("{latency}")) {
        const lat = client.ws.ping;
        if (lat == null || !isFinite(lat) || lat < 0 || lat > 5000) {
          text = text.replaceAll("{latency}", "...");
        } else {
          text = text.replaceAll("{latency}", String(Math.round(lat)));
        }
      }
    } catch (e) { text = text.replaceAll("{latency}", "?"); }
    try {
      if (text.includes("{commands}")) {
        const count = client.commands && typeof client.commands.size === "number" ? client.commands.size : 0;
        text = text.replaceAll("{commands}", String(count));
      }
    } catch (e) { text = text.replaceAll("{commands}", "0"); }
    try {
      if (text.includes("{uptime}")) {
        if (_bxStartupTime != null) {
          const elapsed = (Date.now() - _bxStartupTime) / 1000;
          const h = Math.floor(elapsed / 3600);
          const m = Math.floor((elapsed % 3600) / 60);
          text = text.replaceAll("{uptime}", h > 0 ? h + "h " + m + "m" : m + "m");
        } else {
          text = text.replaceAll("{uptime}", "0m");
        }
      }
    } catch (e) { text = text.replaceAll("{uptime}", "?"); }
    return text;
  }

  function _bxBuildPresence(status, activityType, activityText) {
    const activities = [];
    const type = (activityType || "none").toLowerCase();
    if (type !== "none" && activityText && activityText.trim()) {
      const mapped = _BX_ACTIVITY_MAP[type];
      if (mapped !== undefined) {
        const activity = { name: activityText, type: mapped };
        if (type === "streaming") activity.url = "https://twitch.tv/placeholder";
        activities.push(activity);
      }
    }
    return { status: status || "online", activities };
  }

  async function _bxFetchPresence() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(_BX_API_URL + "/api/bot-internal/presence", {
        headers: { "X-Bot-Id": _BX_BOT_ID, "X-Bot-Token": _BX_TOKEN },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.presence || null;
    } catch (e) {
      return null;
    }
  }

  async function _bxCheckAndApplyPresence(client, force) {
    try {
      const presence = await _bxFetchPresence();
      if (!presence) return false;
      const updatedAt = presence.updatedAt;
      const rawText = presence.activityText || "";
      const hasVars = rawText.indexOf("{") !== -1;
      const now = Date.now();
      const isNewSave = updatedAt !== _bxAppliedUpdateAt;
      const varCooldownOk = (now - _bxLastVarPush) >= _BX_VAR_COOLDOWN_MS;

      if (!force && !isNewSave && !(hasVars && varCooldownOk)) return false;

      const resolvedText = _bxResolveVars(client, rawText);
      const presenceData = _bxBuildPresence(presence.status, presence.activityType, resolvedText);
      client.user.setPresence(presenceData);
      _bxAppliedUpdateAt = updatedAt;
      if (hasVars || force) _bxLastVarPush = now;
      return true;
    } catch (e) {
      return false; // never crash the bot on a poll error
    }
  }

  function _bxStartPresence(client) {
    setTimeout(async () => {
      _bxStartupTime = Date.now();
      try {
        const statusStr = process.env.BOT_STATUS || "online";
        const actType = process.env.BOT_ACTIVITY_TYPE || "none";
        const actText = _bxResolveVars(client, (process.env.BOT_ACTIVITY_TEXT || "").trim());
        client.user.setPresence(_bxBuildPresence(statusStr, actType, actText));
        console.error("[BlockerX] Presencia inicial: " + statusStr + " / " + actType + " / " + actText);
      } catch (e) {
        console.error("[BlockerX] Error presencia inicial:", e && e.message);
      }

      setInterval(() => { _bxCheckAndApplyPresence(client, false); }, 3000);

      // "Aplicar ahora" desde el panel: fuerza un chequeo inmediato sin esperar el poll.
      try {
        process.on("SIGUSR2", () => { _bxCheckAndApplyPresence(client, true); });
      } catch (e) {
        // Signal handling unsupported on this platform — polling still applies changes.
      }
    }, 1000);
  }

  console.error("[BlockerX] Proteccion anti-duplicados y presencia en tiempo real cargadas.");
} catch (e) {
  console.error("[BlockerX] No se pudo cargar el parche de BlockerX:", e && e.message);
}
`;
}

export function getBxConfigPy(): string {
  return `\
# bx_config.py — generado por BlockerX, no editar
# Helper para persistir configuración en R2 (sobrevive reinicios y re-deploys).
import os as _os
import json as _json
import urllib.request as _req
import urllib.error as _uerr

_BX_API_URL      = _os.getenv("BX_API_URL", "http://127.0.0.1:3001")
_BX_BOT_ID       = _os.getenv("BX_BOT_ID", "")
_BX_INTERNAL_TOKEN = _os.getenv("BX_INTERNAL_TOKEN", "")


def _headers() -> dict:
    return {
        "Content-Type": "application/json",
        "X-Bot-Id": _BX_BOT_ID,
        "X-Bot-Token": _BX_INTERNAL_TOKEN,
    }


def load_config(key: str) -> dict:
    """Carga la configuración guardada en R2 para la clave dada.
    Retorna un dict vacío si no existe todavía."""
    url = f"{_BX_API_URL}/api/bot-internal/config/{key}"
    try:
        request = _req.Request(url, headers=_headers(), method="GET")
        with _req.urlopen(request, timeout=5) as resp:
            data = _json.loads(resp.read().decode())
            return data.get("data", {})
    except Exception as e:
        print(f"[bx_config] load_config('{key}') error: {e}")
        return {}


def save_config(key: str, data: dict) -> bool:
    """Guarda el dict en R2 bajo la clave dada.
    Retorna True si tuvo éxito, False en caso de error."""
    url = f"{_BX_API_URL}/api/bot-internal/config/{key}"
    payload = _json.dumps(data, ensure_ascii=False).encode()
    try:
        request = _req.Request(url, data=payload, headers=_headers(), method="PUT")
        with _req.urlopen(request, timeout=5) as resp:
            result = _json.loads(resp.read().decode())
            return result.get("ok", False)
    except Exception as e:
        print(f"[bx_config] save_config('{key}') error: {e}")
        return False
`;
}


export function getBxDataPy(): string {
  return `\
# bx_data.py — generado por BlockerX, no editar
# Almacenamiento clave-valor persistente para datos de guilds, usuarios, etc.
# Los datos sobreviven reinicios porque se guardan en R2.
#
# Uso:
#   from bx_data import db
#   db.set("guild", guild_id, "prefix", "!")
#   prefix = db.get("guild", guild_id, "prefix", "!")
#   db.delete("guild", guild_id, "prefix")
#   all_data = db.get_all("guild", guild_id)
#   db.set_many("user", user_id, {"xp": 100, "lvl": 2})
#   db.increment("user", user_id, "xp", 10)
#   db.delete_entity("guild", guild_id)
import os as _os
import json as _json
import threading as _threading
import urllib.request as _req

_BX_API_URL = _os.getenv("BX_API_URL", "http://127.0.0.1:3001")
_BX_BOT_ID  = _os.getenv("BX_BOT_ID", "")
_BX_TOKEN   = _os.getenv("BX_INTERNAL_TOKEN", "")


def _headers():
    return {
        "Content-Type": "application/json",
        "X-Bot-Id": _BX_BOT_ID,
        "X-Bot-Token": _BX_TOKEN,
    }


def _safe_key(s):
    clean = str(s)[:64]
    if not clean:
        raise ValueError("scope/entity_id no puede estar vacio")
    return clean


class _BxDatabase:
    def __init__(self):
        self._cache = {}
        self._loaded = set()
        self._lock = _threading.Lock()

    def _load(self, scope, eid):
        key = (scope, eid)
        if key in self._loaded:
            return self._cache.get(key, {})
        url = f"{_BX_API_URL}/api/bot-internal/data/{_safe_key(scope)}/{_safe_key(eid)}"
        try:
            rq = _req.Request(url, headers=_headers(), method="GET")
            with _req.urlopen(rq, timeout=5) as resp:
                result = _json.loads(resp.read().decode())
                data = result.get("data", {})
        except Exception as e:
            print(f"[bx_data] load({scope},{eid}) error: {e}")
            data = {}
        with self._lock:
            self._cache[key] = data
            self._loaded.add(key)
        return data

    def _flush(self, scope, eid):
        key = (scope, eid)
        data = self._cache.get(key, {})
        url = f"{_BX_API_URL}/api/bot-internal/data/{_safe_key(scope)}/{_safe_key(eid)}"
        payload = _json.dumps(data, ensure_ascii=False).encode()
        try:
            rq = _req.Request(url, data=payload, headers=_headers(), method="PUT")
            with _req.urlopen(rq, timeout=5):
                pass
        except Exception as e:
            print(f"[bx_data] flush({scope},{eid}) error: {e}")

    def get(self, scope, entity_id, key, default=None):
        return self._load(scope, str(entity_id)).get(key, default)

    def set(self, scope, entity_id, key, value):
        eid = str(entity_id)
        data = self._load(scope, eid)
        with self._lock:
            data[key] = value
            self._cache[(scope, eid)] = data
        self._flush(scope, eid)

    def set_many(self, scope, entity_id, fields):
        eid = str(entity_id)
        data = self._load(scope, eid)
        with self._lock:
            data.update(fields)
            self._cache[(scope, eid)] = data
        self._flush(scope, eid)

    def delete(self, scope, entity_id, key):
        eid = str(entity_id)
        data = self._load(scope, eid)
        if key in data:
            with self._lock:
                data.pop(key, None)
                self._cache[(scope, eid)] = data
            self._flush(scope, eid)

    def get_all(self, scope, entity_id):
        return dict(self._load(scope, str(entity_id)))

    def increment(self, scope, entity_id, key, amount=1):
        eid = str(entity_id)
        data = self._load(scope, eid)
        new_val = int(data.get(key, 0)) + amount
        with self._lock:
            data[key] = new_val
            self._cache[(scope, eid)] = data
        self._flush(scope, eid)
        return new_val

    def delete_entity(self, scope, entity_id):
        eid = str(entity_id)
        with self._lock:
            self._cache[(scope, eid)] = {}
            self._loaded.discard((scope, eid))
        self._flush(scope, eid)


db = _BxDatabase()
`;
}
