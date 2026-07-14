---
name: Render onrender.com split-service session cookies
description: Why a session cookie set by one onrender.com service isn't sent back on API calls from a separate onrender.com service, and the fix.
---

`onrender.com` is on the public suffix list, so `foo.onrender.com` and
`bar.onrender.com` count as two different "sites" to the browser — not two
subdomains of one site. A `SameSite=None; Secure` session cookie set by the
API service is treated as a **third-party cookie** by the frontend site, and
many browsers (Safari always, Chrome/Firefox with tracking protection) drop
it silently. Symptom: OAuth login redirect succeeds and briefly reaches the
app, then every subsequent API call is unauthenticated and the user gets
bounced back to the landing/login page instantly.

**Why:** CORS (`Access-Control-Allow-Origin`/`credentials:true`) and correct
`SameSite=None; Secure` cookie attributes are necessary but not sufficient —
they make the *browser API* allow the cross-site cookie, but the browser's
own third-party-cookie policy can still block storage/sending regardless.

**How to apply:** If an app was designed to be served as one origin
(frontend + API on the same domain, e.g. via Express `express.static` +
SPA fallback for non-`/api` routes, which is a common pattern for apps built
first on Replit's single-domain proxy), deploy it to Render as **one** web
service, not a separate static site + API service. Only reach for a custom
domain or token-based (header) auth if the two must stay on separate
Render-assigned domains.
