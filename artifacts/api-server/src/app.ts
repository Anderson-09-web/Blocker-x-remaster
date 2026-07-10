import express, { type Express } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { logger } from "./lib/logger";

const app: Express = express();

app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, "proxy request");
  next();
});

app.use(
  "/api",
  createProxyMiddleware({
    target: "http://localhost:8000",
    changeOrigin: true,
    logger: console,
  }),
);

app.use(
  "/",
  createProxyMiddleware({
    target: "http://localhost:5000",
    changeOrigin: true,
    ws: true,
    logger: console,
  }),
);

export default app;
