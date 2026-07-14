import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { createSessionMiddleware } from "./lib/session";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// Required behind Render's/Replit's proxy so secure cookies and the
// `secure`/`proxy` session settings work correctly.
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

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(createSessionMiddleware());

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  // Frontend and API are deployed as a single service; serve the built
  // frontend statically from here so both live on the same origin (avoids
  // third-party cookie issues on multi-subdomain hosts like onrender.com).
  const frontendDist = path.resolve(__dirname, "../../blockerx/dist/public");
  app.use(express.static(frontendDist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
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
