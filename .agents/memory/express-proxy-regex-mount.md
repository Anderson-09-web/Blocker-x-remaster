---
name: Express regex-path mount breaks proxied req.url
description: Why `app.use(/regex/, middleware)` in front of an http-proxy can silently collapse every request path to "/", causing bogus redirects — check this before debugging mysterious redirect loops behind an Express reverse proxy.
---

## The problem

`app.use(pathArg, middleware)` treats `pathArg` as a **mount path**, not just a filter. When `pathArg` is a RegExp that matches the whole incoming path (e.g. `/^(?!\/api).*/`), Express strips the matched portion and rewrites `req.url` relative to the mount for every downstream middleware — collapsing it down to `/` regardless of what was actually requested.

If that downstream middleware is a reverse proxy (e.g. `http-proxy-middleware`), it forwards `req.url` (not `req.originalUrl`) to the upstream target, so the upstream always sees `GET /` no matter what path the client asked for. If the upstream itself does path-based redirects (e.g. a Vite dev server configured with a non-root `base`, which redirects bare `/` to the base path), this produces a redirect loop or a redirect to the wrong location that looks like a routing/proxy bug but is actually this Express mount-path gotcha.

**Why:** discovered while debugging a `net::ERR_TOO_MANY_REDIRECTS` in a dev setup where an Express server proxied all non-`/api` traffic to a Vite dev server serving under a `base` path prefix. Confirmed via a minimal repro: swapping the regex-path mount for a path-less middleware that filters manually fixed it immediately.

## How to apply

When you need to proxy "everything except some prefix" through Express, do NOT pass a RegExp/string path to `app.use()` in front of the proxy. Instead, mount without a path and filter manually inside the middleware body:

```js
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  return proxyMiddleware(req, res, next);
});
```

This preserves `req.url` untouched for the proxy. Applies generally to any Express app combining path-based routing with a catch-all reverse proxy, not just this one project.
