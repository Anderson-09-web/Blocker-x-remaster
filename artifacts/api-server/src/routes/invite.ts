import { Router } from "express";
import { db, inviteCodesTable, redeemedCodesTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth } from "../lib/auth-middleware";
import { createNotification } from "../lib/notifications";

const router = Router();

router.post("/invite/redeem", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { code } = req.body;

  if (!code) {
    res.status(400).json({ error: "Invitation code is required" });
    return;
  }

  const normalizedCode = code.trim().toUpperCase();
  const [invite] = await db.select().from(inviteCodesTable).where(eq(inviteCodesTable.code, normalizedCode));

  if (!invite) {
    res.status(400).json({ error: "Código inválido. Verifica que esté escrito correctamente." });
    return;
  }

  if (!invite.isActive) {
    res.status(400).json({ error: "Este código ha sido desactivado." });
    return;
  }

  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    res.status(400).json({ error: "Este código ha expirado." });
    return;
  }

  if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
    res.status(400).json({ error: "Este código ya alcanzó su límite de usos." });
    return;
  }

  const isPremium = !!(invite as any).grantsPremium;
  const grantsPlan: string | null = (invite as any).grantsPlan ?? null;

  // If user already has access AND the key doesn't grant a better plan
  const planRank: Record<string, number> = { free: 0, plus: 1, blockerx: 2 };
  const currentRank = planRank[(user as any).plan ?? "free"] ?? 0;
  // Legacy premium invites (grantsPlan=null, grantsPremium=true) default to blockerx rank
  const effectivePlan = grantsPlan ?? (isPremium ? "blockerx" : "free");
  const grantedRank = planRank[effectivePlan] ?? 0;
  if (user.hasInvite && (!isPremium || currentRank >= grantedRank)) {
    res.json({ message: "Ya tienes acceso completo.", grantsPremium: false });
    return;
  }

  // Check if already redeemed this specific code
  const [alreadyRedeemed] = await db
    .select()
    .from(redeemedCodesTable)
    .where(and(eq(redeemedCodesTable.codeId, invite.id), eq(redeemedCodesTable.userId, user.id)));

  if (alreadyRedeemed) {
    res.status(400).json({ error: "Ya canjeaste este código anteriormente." });
    return;
  }

  await db.update(inviteCodesTable).set({ usesCount: invite.usesCount + 1 }).where(eq(inviteCodesTable.id, invite.id));
  await db.insert(redeemedCodesTable).values({ id: randomUUID(), codeId: invite.id, userId: user.id });

  const updates: Record<string, any> = { hasInvite: true };
  if (isPremium && grantsPlan) updates.plan = grantsPlan;
  else if (isPremium) updates.plan = "blockerx";
  await db.update(usersTable).set(updates).where(eq(usersTable.id, user.id));

  await createNotification({
    userId: user.id,
    title: isPremium ? "¡Premium activado! 🎉" : "Acceso concedido",
    message: isPremium
      ? `Tu clave fue aceptada. Ahora tienes el plan ${grantsPlan === "plus" ? "Plus" : "Blocker X"}.`
      : "Tu código de invitación fue aceptado. ¡Bienvenido a Blocker X!",
    type: "success",
  });

  req.log.info({ userId: user.id, code: normalizedCode, isPremium }, "Invite code redeemed");
  res.json({
    message: isPremium
      ? `¡Clave aceptada! Tu cuenta fue actualizada a ${grantsPlan === "plus" ? "Plus" : "Blocker X"}.`
      : "Código aceptado. ¡Bienvenido a Blocker X!",
    grantsPremium: isPremium,
  });
});

export default router;
