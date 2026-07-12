import { Router } from "express";
import { requireAuth, requireAdmin } from "../lib/auth-middleware";
import { getGlobalBanner, setGlobalBanner, clearGlobalBanner, type BannerType } from "../lib/global-banner";

const router = Router();

/** Public — any authenticated user can read the active banner */
router.get("/banner", requireAuth, (_req, res) => {
  const banner = getGlobalBanner();
  res.json({ banner });
});

/** Admin — set a new global banner */
router.post("/admin/banner", requireAuth, requireAdmin, (req, res) => {
  const { type, title, message } = req.body as { type: BannerType; title: string; message: string };
  if (!type || !title || !message) {
    res.status(400).json({ error: "type, title and message are required" });
    return;
  }
  const allowed: BannerType[] = ["maintenance", "error", "info", "warning"];
  if (!allowed.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${allowed.join(", ")}` });
    return;
  }
  const banner = setGlobalBanner({ type, title, message });
  res.json({ banner });
});

/** Admin — clear the active banner */
router.delete("/admin/banner", requireAuth, requireAdmin, (_req, res) => {
  clearGlobalBanner();
  res.json({ ok: true });
});

export default router;
