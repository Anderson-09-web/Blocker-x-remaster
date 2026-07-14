import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { createSessionMiddleware } from "./lib/session";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

const allowedOrigins = [
  ...(process.env.REPLIT_DOMAINS?.split(",").map((d) => `https://${d.trim()}`) || []),
  ...(process.env.REPLIT_DEV_DOMAIN ? [`https://${process.env.REPLIT_DEV_DOMAIN}`] : []),
  // On Render, the frontend is a separate static-site domain (e.g.
  // blocker-x-web.onrender.com), so it must be explicitly allowed here for
  // credentialed cross-origin requests (cookies) to be accepted.
  ...(process.env.RENDER_APP_URL ? [process.env.RENDER_APP_URL.replace(/\/$/, "")] : []),
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:80",
  "http://localhost:25673",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) { callback(null, true); return; }
      const allowed = allowedOrigins.some((o) => origin === o);
      callback(null, allowed || process.env.NODE_ENV === "development");
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(createSessionMiddleware());

app.use("/api", router);

// Serve the built frontend statically if the dist directory exists.
// This is checked at runtime so it works regardless of NODE_ENV — on Render
// the env var may not always be set, but the build output is always present.
const frontendDist = path.resolve(__dirname, "../../blockerx/dist/public");
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  // Dev mode: proxy non-API requests to the vite dev server.
  const { createProxyMiddleware } = await import("http-proxy-middleware");
  const devPort = process.env.FRONTEND_PORT || "5000";
  const frontendProxy = createProxyMiddleware({
    target: `http://localhost:${devPort}`,
    changeOrigin: true,
    ws: true,
  });
  // NOTE: intentionally not using `app.use(/regex/, proxy)` here — Express
  // treats a RegExp as a mount path and rewrites req.url relative to the
  // match, which (since the pattern matches the whole path) collapses every
  // URL down to "/" before it reaches the proxy. Filtering manually inside
  // a path-less middleware preserves the original req.url.
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    return frontendProxy(req, res, next);
  });
}

export default app;
