import { Router } from "express";
import { db, aiUsageTable, botsTable } from "@workspace/db";
import { eq, count, and, gte } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, requireInvite } from "../lib/auth-middleware";
import { r2ReadFile, r2WriteFile, r2ListAllFiles, r2DeleteFile } from "../lib/r2";

const router = Router();

const FREE_DAILY_LIMIT = 5;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = "llama-3.3-70b-versatile";

function getStartOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getUsageCount(userId: string): Promise<number> {
  const startOfToday = getStartOfToday();
  const [r] = await db.select({ count: count() }).from(aiUsageTable)
    .where(and(eq(aiUsageTable.userId, userId), gte(aiUsageTable.createdAt, startOfToday)));
  return Number(r?.count || 0);
}

async function getBotContext(botId: string, userId: string, filePath?: string): Promise<{ botContext: string; fileContext: string; bot: any }> {
  let botContext = "";
  let fileContext = "";
  let bot: any = null;
  if (botId) {
    try {
      const [b] = await db.select().from(botsTable).where(and(eq(botsTable.id, botId), eq(botsTable.userId, userId)));
      if (b) {
        bot = b;
        botContext = `\nEl usuario está trabajando en el bot "${b.name}" (${b.language === "python" ? "Python/discord.py" : "JavaScript/discord.js"}).`;
        if (filePath) {
          try {
            const content = await r2ReadFile(filePath);
            if (content && content.length < 8000) {
              fileContext = `\n\nContenido actual del archivo "${filePath.split("/").pop()}":\n\`\`\`${b.language === "python" ? "python" : "javascript"}\n${content}\n\`\`\``;
            }
          } catch { /* file might not exist */ }
        }
      }
    } catch { /* ignore db errors */ }
  }
  return { botContext, fileContext, bot };
}

async function callGroq(messages: { role: string; content: string }[], maxTokens = 3000): Promise<{ content: string; tokens: number }> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: maxTokens, temperature: 0.6 }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq error ${response.status}: ${err.slice(0, 400)}`);
  }
  const data = await response.json() as {
    choices: Array<{ message: { content: string; reasoning_content?: string } }>;
    usage: { total_tokens: number };
  };

  let content = data.choices[0]?.message?.content || "";

  // DeepSeek R1 and other reasoning models on Groq embed <think>...</think> blocks
  // inside the content field. Strip them so only the actual response is parsed.
  content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // If content is empty but reasoning_content exists, the model put everything in thinking.
  // Fall back to reasoning_content (less common on Groq but can happen).
  if (!content && data.choices[0]?.message?.reasoning_content) {
    content = (data.choices[0].message.reasoning_content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  }

  return { content, tokens: data.usage?.total_tokens || 0 };
}

/** Validate and sanitise a filename from AI output. Returns null if rejected. */
function sanitiseFilename(raw: string): string | null {
  const name = raw.replace(/\\/g, "/").trim();
  if (
    name.startsWith("/") ||
    name.includes("..") ||
    name.includes("//") ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._\-/]*$/.test(name) ||
    name.split("/").some(seg => seg === "" || seg === "." || seg === "..")
  ) return null;
  return name;
}

/** Shared agent system prompt builder */
function buildAgentSystemPrompt(
  lang: string,
  ext: string,
  language: string,
  mainFile: string,
  botContext: string,
  existingFilesContext: string,
): string {
  return `Eres un agente autónomo desarrollador de bots de Discord especializado en ${lang}.
Tu trabajo es analizar la tarea del usuario con profundidad, diseñar una solución completa, y generar el código necesario.
${botContext}${existingFilesContext}

PROCESO DE ANÁLISIS (sigue estos pasos mentalmente antes de responder):
1. Comprende exactamente qué sistema pide el usuario y qué componentes necesita.
2. Revisa los archivos existentes para evitar duplicados y mantener integración coherente.
3. Determina qué archivos crear, cuáles modificar y cómo conectarlos entre sí.
4. Genera el código completo, funcional y bien integrado.

INSTRUCCIONES DE RESPUESTA:
1. Explica con claridad (2-4 párrafos) qué vas a implementar, por qué y cómo quedará estructurado.
2. Menciona qué archivos crearás/modificarás y su propósito.
3. Al final, incluye el bloque JSON con todas las acciones de archivos en este formato EXACTO:

[AGENT_ACTIONS]
{
  "actions": [
    {"type": "write", "filename": "nombre_archivo.${ext}", "content": "CÓDIGO COMPLETO AQUÍ"},
    {"type": "write", "filename": "otro_archivo.${ext}", "content": "CÓDIGO COMPLETO AQUÍ"}
  ]
}
[/AGENT_ACTIONS]

REGLAS FUNDAMENTALES:
- El código debe ser COMPLETO y funcional, sin fragmentos ni placeholders.
- Si modificas un archivo existente, incluye el archivo COMPLETO con los cambios integrados.
- Para Python usa discord.py / py-cord. Para JS usa discord.js v14.
- El token del bot viene de la env var DISCORD_TOKEN.
- Responde SIEMPRE en español.
- SIEMPRE incluye el bloque [AGENT_ACTIONS] con al menos un archivo.
- Para configuraciones persistentes que no deben perderse al reiniciar el bot, usa bx_config.py (ya está disponible en el bot) o guarda en una base de datos externa.
- PUEDES crear archivos en subcarpetas usando rutas relativas como "cogs/economia.py" o "sistemas/tickets.py".

REGLA DE RUTAS DE ARCHIVOS:
Los filenames en [AGENT_ACTIONS] pueden incluir subcarpetas. Ejemplos válidos:
  - "main.py" (raíz)
  - "cogs/economia.py" (subcarpeta cogs)
  - "sistemas/moderacion.py" (subcarpeta sistemas)
  - "utils/helpers.py" (subcarpeta utils)
Usa subcarpetas cuando tengas múltiples cogs/módulos para mantener el código organizado.

REGLA DE INTEGRACIÓN:
Cuando crees nuevos archivos de módulos/cogs/sistemas, SIEMPRE incluye también "${mainFile}" actualizado:

${language === "python" ? `- Si creas cogs (archivos con "class MiCog(commands.Cog)"), en main.py usa "await bot.load_extension('nombre_archivo')" dentro de setup_hook. El main.py debe importar y cargar TODOS los cogs existentes.
- Si creas archivos con funciones auxiliares, impórtalos en main.py.
- El main.py siempre debe ser el punto de entrada completo y funcional.` : `- Si creas comandos en archivos separados, en index.js impórtalos y regístralos en el cliente.
- Usa "client.commands = new Collection()" y carga los archivos de comandos.
- El index.js siempre debe ser el punto de entrada completo.`}

Ejemplo de main.py correcto con cogs:
\`\`\`python
import discord
from discord.ext import commands
import os

intents = discord.Intents.all()
bot = commands.Bot(command_prefix="!", intents=intents)

async def setup_hook():
    await bot.load_extension("economia")
    await bot.load_extension("moderacion")

bot.setup_hook = setup_hook

@bot.event
async def on_ready():
    print(f"Bot listo como {bot.user}")

bot.run(os.getenv("DISCORD_TOKEN"))
\`\`\``;
}

/** Read existing bot files from R2 for context — reads ALL files recursively */
async function getExistingFilesContext(r2Prefix: string, ext: string): Promise<string> {
  try {
    const allFiles = await r2ListAllFiles(r2Prefix, 60);
    // Skip platform-injected and gitkeep files
    const userFiles = allFiles.filter(f =>
      !["_bx_inject.py", "_bx_run.py", "bx_config.py"].includes(f.name.split("/").pop() || "") &&
      !f.name.endsWith(".gitkeep") &&
      !f.name.startsWith("_config/")
    );

    // Build file tree summary (all files, even if we don't read content)
    const fileTree = userFiles.map(f => `  - ${f.name}`).join("\n");

    // Read content for source files (not JSON data), limit 12 files, 3000 chars each
    const SOURCE_EXTS = [".py", ".js", ".ts", ".json", ".txt", ".md", ".yaml", ".yml", ".toml", ".cfg", ".ini", ".env"];
    const readableFiles = userFiles
      .filter(f => SOURCE_EXTS.some(e => f.name.endsWith(e)) && (f.size || 0) < 60000)
      .slice(0, 12);

    const fileContents: string[] = [];
    for (const f of readableFiles) {
      try {
        const content = await r2ReadFile(f.path);
        if (content.length < 3000) {
          const lang = f.name.endsWith(".py") ? "python" : f.name.endsWith(".js") ? "javascript" : ext;
          fileContents.push(`### ${f.name}\n\`\`\`${lang}\n${content}\n\`\`\``);
        }
      } catch { /* skip */ }
    }

    if (userFiles.length === 0) return "";

    let ctx = `\n\nEstructura de archivos del bot:\n${fileTree}`;
    if (fileContents.length > 0) {
      ctx += `\n\nContenido de los archivos:\n${fileContents.join("\n\n")}`;
    }
    return ctx;
  } catch {
    return "";
  }
}

/** Parse the [AGENT_ACTIONS] block from AI response */
function parseAgentActions(aiResponse: string): {
  explanation: string;
  rawActions: Array<{ type: string; filename: string; content?: string }>;
} {
  const actionsMatch = aiResponse.match(/\[AGENT_ACTIONS\]([\s\S]*?)\[\/AGENT_ACTIONS\]/);
  const explanation = aiResponse.replace(/\[AGENT_ACTIONS\][\s\S]*?\[\/AGENT_ACTIONS\]/g, "").trim();
  const rawActions: Array<{ type: string; filename: string; content?: string }> = [];

  if (actionsMatch) {
    try {
      const parsed = JSON.parse(actionsMatch[1].trim()) as { actions: Array<{ type: string; filename: string; content?: string }> };
      for (const action of parsed.actions || []) {
        if (action.filename) rawActions.push(action);
      }
    } catch { /* malformed JSON — return empty actions */ }
  }

  return { explanation, rawActions };
}

// ─── Simple chat ─────────────────────────────────────────────────────────────
router.post("/ai/chat", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { message, botId, filePath, language = "python", context } = req.body;

  if (!message) { res.status(400).json({ error: "Message is required" }); return; }
  if (!GROQ_API_KEY) { res.status(503).json({ error: "AI service is not configured. Ask the admin to set the GROQ_API_KEY." }); return; }

  const usageCount = await getUsageCount(user.id);
  const planLimit = user.plan === "blockerx" ? null : user.plan === "plus" ? 50 : FREE_DAILY_LIMIT;
  if (planLimit !== null && usageCount >= planLimit) {
    res.status(403).json({ error: `Límite alcanzado (${planLimit} requests/mes). Actualiza tu plan para más IA.` });
    return;
  }

  const { botContext, fileContext } = await getBotContext(botId, user.id, filePath);
  const langLabel = language === "python" ? "Discord.py (Python)" : "Discord.js (JavaScript)";
  const systemPrompt = `Eres un experto desarrollador de bots de Discord especializado en ${langLabel}.
Tu trabajo es ayudar a los usuarios a construir, depurar y mejorar sus bots de Discord.
Sé conciso y práctico. Siempre proporciona ejemplos de código funcionales cuando sea relevante.
Para bots Python: usa sintaxis de discord.py (o py-cord).
Para bots JavaScript: usa sintaxis de discord.js v14.
Responde SIEMPRE en español a menos que el usuario escriba en otro idioma.
Cuando des código, pon el bloque de código completo para que pueda copiarse directamente al archivo.
${botContext}${fileContext}
${context ? `Contexto adicional: ${context}` : ""}`;

  try {
    const { content: aiResponse, tokens } = await callGroq([
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ]);

    await db.insert(aiUsageTable).values({ id: randomUUID(), userId: user.id, prompt: message, response: aiResponse, tokensUsed: tokens, language });

    const planLimit2 = user.plan === "blockerx" ? null : user.plan === "plus" ? 50 : FREE_DAILY_LIMIT;
    res.json({ response: aiResponse, tokensUsed: tokens, usageCount: usageCount + 1, usageLimit: planLimit2 });
  } catch (err: any) {
    req.log.error({ err }, "AI chat error");
    res.status(500).json({ error: "No se pudo obtener respuesta de la IA. Intenta de nuevo." });
  }
});

// ─── Agent: Phase 1 — plan (analyse + generate, but DO NOT write files yet) ──
router.post("/ai/agent/plan", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { message, botId, language = "python" } = req.body;

  if (!message) { res.status(400).json({ error: "Message is required" }); return; }
  if (!botId) { res.status(400).json({ error: "botId is required for agent mode" }); return; }
  if (!GROQ_API_KEY) { res.status(503).json({ error: "AI service is not configured." }); return; }

  const usageCount = await getUsageCount(user.id);
  const agentPlanLimit = user.plan === "blockerx" ? null : user.plan === "plus" ? 50 : FREE_DAILY_LIMIT;
  if (agentPlanLimit !== null && usageCount >= agentPlanLimit) {
    res.status(403).json({ error: `Límite alcanzado (${agentPlanLimit} requests/mes). Actualiza tu plan para más IA.` });
    return;
  }

  const { botContext, bot } = await getBotContext(botId, user.id);
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

  const lang = language === "python" ? "Python/discord.py" : "JavaScript/discord.js";
  const ext = language === "python" ? "py" : "js";
  const mainFile = language === "python" ? "main.py" : "index.js";

  const existingFilesContext = await getExistingFilesContext(bot.r2Prefix, ext);
  const systemPrompt = buildAgentSystemPrompt(lang, ext, language, mainFile, botContext, existingFilesContext);

  try {
    const { content: aiResponse, tokens } = await callGroq([
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ], 8000); // reasoning models need extra tokens to think + respond

    if (!aiResponse) {
      req.log.error("AI agent/plan: empty response from model");
      res.status(500).json({ error: "La IA no devolvió respuesta. Intenta de nuevo." });
      return;
    }

    const { explanation, rawActions } = parseAgentActions(aiResponse);

    // Sanitise filenames — reject invalid paths but include them in the plan with a warning
    const actions = rawActions.map(a => {
      const safeName = sanitiseFilename(a.filename);
      if (!safeName) return { ...a, filename: a.filename, _rejected: true };
      return { type: a.type, filename: safeName, content: a.content };
    }).filter(a => !(a as any)._rejected);

    await db.insert(aiUsageTable).values({
      id: randomUUID(), userId: user.id, prompt: message, response: aiResponse, tokensUsed: tokens, language,
    });

    res.json({
      explanation,
      actions,
      usageCount: usageCount + 1,
      usageLimit: user.plan === "blockerx" ? null : user.plan === "plus" ? 50 : FREE_DAILY_LIMIT,
    });
  } catch (err: any) {
    req.log.error({ err, message: err?.message }, "AI agent/plan error");
    const userMsg = err?.message?.includes("Groq error")
      ? `Error del proveedor de IA: ${err.message.slice(0, 120)}`
      : "No se pudo generar el plan. Intenta de nuevo.";
    res.status(500).json({ error: userMsg });
  }
});

// ─── Agent: Phase 2 — apply (write the pre-computed actions to R2) ────────────
router.post("/ai/agent/apply", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { botId, actions } = req.body;

  if (!botId) { res.status(400).json({ error: "botId is required" }); return; }
  if (!Array.isArray(actions) || actions.length === 0) {
    res.status(400).json({ error: "actions array is required" }); return;
  }

  // Verify the bot belongs to this user
  const [bot] = await db.select().from(botsTable).where(and(eq(botsTable.id, botId), eq(botsTable.userId, user.id)));
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

  const appliedActions: { filename: string; type: string; success: boolean; error?: string }[] = [];

  for (const action of actions) {
    const safeName = sanitiseFilename(action.filename || "");
    if (!safeName) {
      appliedActions.push({ filename: action.filename, type: action.type, success: false, error: "Nombre de archivo no permitido" });
      continue;
    }
    const key = `${bot.r2Prefix}/${safeName}`;
    try {
      if (action.type === "write" && action.content !== undefined) {
        await r2WriteFile(key, action.content);
        appliedActions.push({ filename: safeName, type: "write", success: true });
      } else if (action.type === "delete") {
        await r2DeleteFile(key);
        appliedActions.push({ filename: safeName, type: "delete", success: true });
      } else {
        appliedActions.push({ filename: safeName, type: action.type, success: false, error: "Tipo de acción desconocido" });
      }
    } catch (e: any) {
      appliedActions.push({ filename: safeName, type: action.type, success: false, error: e.message });
    }
  }

  res.json({ actions: appliedActions });
});

// ─── Usage ─────────────────────────────────────────────────────────────────────
router.get("/ai/usage", requireAuth, requireInvite, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const count_ = await getUsageCount(user.id);
  const usageLimit = user.plan === "blockerx" ? null : user.plan === "plus" ? 50 : FREE_DAILY_LIMIT;
  res.json({ count: count_, limit: usageLimit, plan: user.plan });
});

export default router;
