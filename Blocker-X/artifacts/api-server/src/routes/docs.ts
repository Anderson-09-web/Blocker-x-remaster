import { Router } from "express";
import { db, adminDocsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, requireAdmin } from "../lib/auth-middleware";

const router = Router();

// GET /admin/docs — list all docs (admin only)
router.get("/admin/docs", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const docs = await db.select().from(adminDocsTable).orderBy(asc(adminDocsTable.order), asc(adminDocsTable.createdAt));
  res.json({ docs });
});

// GET /admin/docs/:id — single doc
router.get("/admin/docs/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params;
  const [doc] = await db.select().from(adminDocsTable).where(eq(adminDocsTable.id, id));
  if (!doc) {
    res.status(404).json({ error: "Documento no encontrado." });
    return;
  }
  res.json({ doc });
});

// POST /admin/docs — create doc
router.post("/admin/docs", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { title, content, category, order } = req.body as {
    title: string;
    content: string;
    category?: string;
    order?: number;
  };

  if (!title?.trim() || !content?.trim()) {
    res.status(400).json({ error: "Título y contenido son requeridos." });
    return;
  }

  const id = randomUUID();
  await db.insert(adminDocsTable).values({
    id,
    title: title.trim(),
    content: content.trim(),
    category: category?.trim() || "general",
    order: order ?? 0,
  });

  const [doc] = await db.select().from(adminDocsTable).where(eq(adminDocsTable.id, id));
  res.status(201).json({ doc });
});

// PUT /admin/docs/:id — update doc
router.put("/admin/docs/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params;
  const [existing] = await db.select().from(adminDocsTable).where(eq(adminDocsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Documento no encontrado." });
    return;
  }

  const { title, content, category, order } = req.body as {
    title?: string;
    content?: string;
    category?: string;
    order?: number;
  };

  const update: Partial<typeof existing> = {};
  if (title !== undefined) update.title = title.trim();
  if (content !== undefined) update.content = content.trim();
  if (category !== undefined) update.category = category.trim() || "general";
  if (order !== undefined) update.order = order;

  await db.update(adminDocsTable).set(update).where(eq(adminDocsTable.id, id));
  const [updated] = await db.select().from(adminDocsTable).where(eq(adminDocsTable.id, id));
  res.json({ doc: updated });
});

// DELETE /admin/docs/:id
router.delete("/admin/docs/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params;
  const [existing] = await db.select().from(adminDocsTable).where(eq(adminDocsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Documento no encontrado." });
    return;
  }
  await db.delete(adminDocsTable).where(eq(adminDocsTable.id, id));
  res.json({ ok: true });
});

export default router;
