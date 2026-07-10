import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useAuth } from "@/lib/auth-context";
import {
  useGetBot, useListFiles, useGetBotLogs, useListEnvVars, useSetEnvVar, useDeleteEnvVar,
  useReadFile, useWriteFile, useListDeployments, useStartBot, useStopBot,
  useRestartBot, useUpdateBot, useUploadFile, useCreateFolder, useDeleteFile, useRenameFile,
  getGetBotQueryKey, getListFilesQueryKey, getGetBotLogsQueryKey, getListEnvVarsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Play, Square, RotateCcw, Rocket, Plus, Trash2, Save, Folder, FileText, ChevronLeft, Settings, BookOpen, FilePlus, FolderPlus, X, Loader2, RefreshCw, ChevronRight, FolderInput, AlertTriangle, Share2, Users, Crown, Bot, Download, Edit2, Eye, EyeOff, ShieldCheck, ShieldAlert, ExternalLink, Upload, MoreHorizontal, Zap } from "lucide-react";
import { Link } from "wouter";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "bg-green-500/15 text-green-400 border-green-500/20",
    stopped: "bg-gray-500/15 text-gray-400 border-gray-500/20",
    errored: "bg-red-500/15 text-red-400 border-red-500/20",
    deploying: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    starting: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${map[status] || map.stopped}`}>{status}</span>;
}

function LogLevelBadge({ level }: { level: string }) {
  const map: Record<string, string> = { error: "text-red-400", warn: "text-yellow-400", info: "text-blue-400", debug: "text-gray-400" };
  return <span className={`font-mono text-xs ${map[level] || "text-gray-400"}`}>[{level}]</span>;
}

const BOT_STATUSES = [
  { value: "online", label: "🟢 Online" },
  { value: "idle", label: "🌙 Idle" },
  { value: "dnd", label: "🔴 Do Not Disturb" },
  { value: "invisible", label: "⚫ Invisible" },
];

const PYTHON_COMMANDS_GUIDE = `import discord
from discord.ext import commands
import os

bot = commands.Bot(command_prefix="!", intents=discord.Intents.all())

@bot.event
async def on_ready():
    print(f"Bot online: {bot.user}")

# ✅ Comando simple
@bot.command(name="ping")
async def ping(ctx):
    await ctx.send("🏓 Pong!")

# ✅ Comando con argumento
@bot.command(name="saludo")
async def saludo(ctx, nombre: str = "usuario"):
    await ctx.send(f"¡Hola, {nombre}! 👋")

# ✅ Comando con embed
@bot.command(name="info")
async def info(ctx):
    embed = discord.Embed(
        title="Mi Bot",
        description="Bot creado en Blocker X",
        color=discord.Color.blue()
    )
    embed.add_field(name="Prefijo", value="!")
    await ctx.send(embed=embed)

# ✅ Sistema de moderación (kick)
@bot.command(name="kick")
@commands.has_permissions(kick_members=True)
async def kick(ctx, member: discord.Member, *, reason="Sin razón"):
    await member.kick(reason=reason)
    await ctx.send(f"✅ {member.name} fue expulsado.")

bot.run(os.getenv("DISCORD_TOKEN"))`;

const JS_COMMANDS_GUIDE = `const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(\`Bot online: \${client.user.tag}\`);
});

// ✅ Detector de mensajes
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // ✅ Comando !ping
  if (message.content === "!ping") {
    return message.reply("🏓 Pong!");
  }

  // ✅ Comando !saludo
  if (message.content.startsWith("!saludo")) {
    const nombre = message.content.split(" ")[1] || "usuario";
    return message.reply(\`¡Hola, \${nombre}! 👋\`);
  }

  // ✅ Comando !info con embed
  if (message.content === "!info") {
    const embed = new EmbedBuilder()
      .setTitle("Mi Bot")
      .setDescription("Bot creado en Blocker X")
      .setColor(0x5865F2)
      .addFields({ name: "Prefijo", value: "!" });
    return message.reply({ embeds: [embed] });
  }
});

client.login(process.env.DISCORD_TOKEN);`;

export default function BotDetailPage() {
  const { botId } = useParams<{ botId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const editorGutterRef = useRef<HTMLDivElement>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [fileContent, setFileContent] = useState("");
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvVal, setNewEnvVal] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<string | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<{ path: string; name: string } | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingFile, setMovingFile] = useState<{ path: string; name: string } | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [settingsName, setSettingsName] = useState("");
  const [settingsDesc, setSettingsDesc] = useState("");
  const [settingsAvatar, setSettingsAvatar] = useState("");
  const [settingsStatus, setSettingsStatus] = useState("online");
  const [settingsActivityType, setSettingsActivityType] = useState("none");
  const [settingsActivityText, setSettingsActivityText] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [applyingPresence, setApplyingPresence] = useState(false);
  const [applyingNow, setApplyingNow] = useState(false);
  const [rebuildLoading, setRebuildLoading] = useState(false);
  const [fetchingAvatar, setFetchingAvatar] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareDiscordId, setShareDiscordId] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shares, setShares] = useState<any[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("files");
  const [exportingZip, setExportingZip] = useState(false);
  const [editingEnvVar, setEditingEnvVar] = useState<{ id: string; key: string } | null>(null);
  const [editingEnvVal, setEditingEnvVal] = useState("");
  const [visibleEnvIds, setVisibleEnvIds] = useState<Set<string>>(new Set());
  const [openFileMenu, setOpenFileMenu] = useState<string | null>(null);
  const [checkingIntents, setCheckingIntents] = useState(false);
  const [intentsResult, setIntentsResult] = useState<{ valid: boolean; botName?: string; error?: string; intents?: { presence: boolean; serverMembers: boolean; messageContent: boolean } } | null>(null);

  const { user: currentUser } = useAuth();

  const { data: bot, isLoading } = useGetBot(botId, { query: { queryKey: getGetBotQueryKey(botId), refetchInterval: 4000 } });
  const { data: files, refetch: refetchFiles } = useListFiles(
    botId,
    currentFolder ? { dirPath: currentFolder } : {},
    { query: { queryKey: [...getListFilesQueryKey(botId), currentFolder || "root"] } }
  );
  const { data: logs } = useGetBotLogs(botId, {}, { query: { queryKey: getGetBotLogsQueryKey(botId), refetchInterval: 3000 } });
  const { data: envVars } = useListEnvVars(botId, { query: { queryKey: getListEnvVarsQueryKey(botId) } });
  const { data: deployments } = useListDeployments();

  const startBot = useStartBot();
  const stopBot = useStopBot();
  const restartBot = useRestartBot();
  const updateBot = useUpdateBot();
  const setEnvVar = useSetEnvVar();
  const deleteEnvVar = useDeleteEnvVar();
  const writeFile = useWriteFile();
  const uploadFile = useUploadFile();
  const createFolder = useCreateFolder();
  const deleteFile = useDeleteFile();
  const renameFile = useRenameFile();

  const { data: fileData } = useReadFile(botId, { filePath: selectedFile! }, {
    query: { enabled: !!selectedFile, queryKey: ["readFile", botId, selectedFile] }
  });

  useEffect(() => {
    if (fileData?.content !== undefined) setFileContent(fileData.content);
  }, [fileData]);

  useEffect(() => {
    if (bot) {
      setSettingsName((bot as any).name || "");
      setSettingsDesc((bot as any).description || "");
    }
  }, [bot]);

  // Load presence env vars
  useEffect(() => {
    if (envVars && Array.isArray(envVars)) {
      const find = (k: string) => (envVars as any[]).find((v: any) => v.key === k)?.value;
      const st = find("BOT_STATUS"); if (st) setSettingsStatus(st);
      const av = find("BOT_AVATAR_URL"); if (av) setSettingsAvatar(av);
      const at = find("BOT_ACTIVITY_TYPE"); if (at) setSettingsActivityType(at);
      const atx = find("BOT_ACTIVITY_TEXT"); if (atx !== undefined) setSettingsActivityText(atx || "");
    }
  }, [envVars]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetBotQueryKey(botId) });
    qc.invalidateQueries({ queryKey: getGetBotLogsQueryKey(botId) });
  };

  const botDeployments = (deployments as any[])?.filter((d: any) => d.botId === botId) || [];

  const canShare = true;

  const fetchShares = async () => {
    setSharesLoading(true);
    try {
      const res = await fetch(`/api/bots/${botId}/shares`, { credentials: "include" });
      if (res.ok) setShares(await res.json());
    } finally {
      setSharesLoading(false);
    }
  };

  useEffect(() => {
    if (showShareDialog) fetchShares();
  }, [showShareDialog]);

  useEffect(() => {
    if (activeTab === "users") fetchShares();
  }, [activeTab]);

  const handleShare = async () => {
    if (!shareDiscordId.trim()) return;
    setShareLoading(true);
    try {
      const res = await fetch(`/api/bots/${botId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ discordId: shareDiscordId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error || "Error al compartir", variant: "destructive" }); return; }
      setShareDiscordId("");
      fetchShares();
      toast({ title: "Proyecto compartido" });
    } catch {
      toast({ title: "Error al compartir", variant: "destructive" });
    } finally {
      setShareLoading(false);
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    try {
      await fetch(`/api/bots/${botId}/shares/${shareId}`, { method: "DELETE", credentials: "include" });
      fetchShares();
      toast({ title: "Acceso removido" });
    } catch {
      toast({ title: "Error al remover acceso", variant: "destructive" });
    }
  };

  const handleAction = (action: "start" | "stop" | "restart") => {
    const fns = { start: startBot, stop: stopBot, restart: restartBot };
    (fns[action] as any).mutate({ botId }, {
      onSuccess: () => { refresh(); toast({ title: `Bot ${action === "start" ? "iniciado" : action === "stop" ? "detenido" : "reiniciado"}` }); },
      onError: () => toast({ title: `Error al ${action}`, variant: "destructive" }),
    });
  };

  const handleSaveFile = () => {
    if (!selectedFile) return;
    writeFile.mutate({ botId, data: { path: selectedFile, content: fileContent } }, {
      onSuccess: () => toast({ title: "Archivo guardado" }),
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  const handleDeleteFile = (filePath: string) => {
    deleteFile.mutate({ botId, data: { path: filePath } }, {
      onSuccess: () => {
        refetchFiles();
        if (selectedFile === filePath) { setSelectedFile(null); setFileContent(""); }
        setConfirmDeleteFile(null);
        toast({ title: "Archivo eliminado" });
      },
      onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
    });
  };

  const handleDeleteFolder = async () => {
    if (!confirmDeleteFolder) return;
    setDeletingFolder(true);
    try {
      const res = await fetch(`/api/files/${botId}/rmdir`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ path: confirmDeleteFolder.path }),
      });
      if (!res.ok) throw new Error("Failed");
      refetchFiles();
      setConfirmDeleteFolder(null);
      toast({ title: `Carpeta "${confirmDeleteFolder.name}" eliminada` });
    } catch {
      toast({ title: "Error al eliminar carpeta", variant: "destructive" });
    } finally {
      setDeletingFolder(false);
    }
  };

  const handleMoveFile = () => {
    if (!movingFile || !moveTargetFolder.trim()) return;
    const r2Prefix = (bot as any)?.r2Prefix || "";
    const cleanTarget = moveTargetFolder.trim().replace(/^\/+|\/+$/g, "");
    const newPath = `${r2Prefix}/${cleanTarget}/${movingFile.name}`;
    renameFile.mutate({ botId, data: { oldPath: movingFile.path, newPath } }, {
      onSuccess: () => {
        refetchFiles();
        if (selectedFile === movingFile.path) { setSelectedFile(null); setFileContent(""); }
        setShowMoveModal(false);
        setMovingFile(null);
        setMoveTargetFolder("");
        toast({ title: `Archivo movido a /${cleanTarget}/` });
      },
      onError: () => toast({ title: "Error al mover archivo", variant: "destructive" }),
    });
  };

  const handleFolderClick = (folder: any) => {
    const r2Prefix = (bot as any)?.r2Prefix || "";
    const base = r2Prefix.endsWith("/") ? r2Prefix : r2Prefix + "/";
    const relativePath = folder.path.replace(base, "").replace(/\/$/, "");
    setCurrentFolder(relativePath);
    setSelectedFile(null);
  };

  const handleGoToFolder = (parts: string[], index: number) => {
    if (index < 0) {
      setCurrentFolder(null);
    } else {
      setCurrentFolder(parts.slice(0, index + 1).join("/"));
    }
    setSelectedFile(null);
  };

  const handleCreateFile = () => {
    if (!newFileName.trim()) return;
    const name = newFileName.trim();
    const filePath = currentFolder ? `/${currentFolder}` : "/";
    uploadFile.mutate({ botId, data: { path: filePath, name, content: newFileContent, encoding: "utf-8" } }, {
      onSuccess: (f: any) => {
        refetchFiles();
        toast({ title: `Archivo "${name}" creado` });
        setSelectedFile(f.path);
        setFileContent(newFileContent);
        setShowNewFile(false);
        setNewFileName("");
        setNewFileContent("");
      },
      onError: () => toast({ title: "Error al crear el archivo", variant: "destructive" }),
    });
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    // Support nested folder creation — prefix with current folder path
    const folderPath = currentFolder ? `${currentFolder}/${newFolderName.trim()}` : newFolderName.trim();
    createFolder.mutate({ botId, data: { path: folderPath } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListFilesQueryKey(botId) });
        toast({ title: `Carpeta "${newFolderName}" creada` });
        setShowNewFolder(false);
        setNewFolderName("");
      },
      onError: () => toast({ title: "Error al crear la carpeta", variant: "destructive" }),
    });
  };

  const handleExportProject = async () => {
    setExportingZip(true);
    try {
      const res = await fetch(`/api/files/${botId}/export`, { credentials: "include" });
      if (!res.ok) { const d = await res.json(); toast({ title: d.error || "Error al exportar", variant: "destructive" }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      a.download = match ? match[1] : `${(bot as any)?.name || botId}-project.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Proyecto exportado" });
    } catch {
      toast({ title: "Error al exportar el proyecto", variant: "destructive" });
    } finally {
      setExportingZip(false);
    }
  };

  const handleUploadZipFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      const filePath = currentFolder ? `/${currentFolder}` : "/";
      uploadFile.mutate({ botId, data: { path: filePath, name: file.name, content: base64, encoding: "base64" } }, {
        onSuccess: () => { refetchFiles(); toast({ title: `${file.name} subido correctamente` }); },
        onError: () => toast({ title: "Error al subir el archivo", variant: "destructive" }),
      });
    };
    reader.readAsDataURL(file);
  };

  const handleCheckIntents = async () => {
    setCheckingIntents(true);
    setIntentsResult(null);
    try {
      // Backend reads the stored token — token never leaves the server
      const res = await fetch(`/api/bots/${botId}/check-intents`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setIntentsResult({ valid: false, error: data.error || "Error al verificar" });
      } else {
        setIntentsResult({ valid: true, botName: data.botName, intents: data.intents });
      }
    } catch {
      setIntentsResult({ valid: false, error: "No se pudo conectar con Discord" });
    } finally {
      setCheckingIntents(false);
    }
  };

  const handleAddEnv = () => {
    if (!newEnvKey) return;
    setEnvVar.mutate({ botId, data: { key: newEnvKey, value: newEnvVal } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEnvVarsQueryKey(botId) });
        setNewEnvKey(""); setNewEnvVal("");
        toast({ title: "Variable guardada" });
      },
      onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
    });
  };

  const handleFetchAvatar = async () => {
    const tokenVar = (envVars as any[])?.find(
      (v: any) => v.key === "DISCORD_TOKEN" || v.key === "BOT_TOKEN" || v.key === "TOKEN"
    );
    const tokenToUse = manualToken.trim() || tokenVar?.value;
    if (!tokenToUse) {
      toast({ title: "Pega el token del bot en el campo de abajo o guarda DISCORD_TOKEN en Environment", variant: "destructive" });
      return;
    }
    setFetchingAvatar(true);
    try {
      const res = await fetch("/api/bots/verify-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: tokenToUse }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Token inválido", variant: "destructive" });
        return;
      }
      if (data.avatar) {
        setSettingsAvatar(data.avatar);
        toast({ title: "Avatar obtenido", description: `Bot: ${data.username}` });
      } else {
        toast({ title: "El bot no tiene avatar configurado en Discord" });
      }
    } catch (e) {
      toast({ title: "No se pudo conectar con Discord", variant: "destructive" });
    } finally {
      setFetchingAvatar(false);
    }
  };

  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const handleSaveSettings = async () => {
    if (isSavingSettings) return;
    setIsSavingSettings(true);
    const isRunning = (bot as any)?.status === "running";
    try {
      // 1. Save name/description only if actually different
      const updates: any = {};
      if (settingsName.trim() && settingsName.trim() !== (bot as any)?.name) updates.name = settingsName.trim();
      if (settingsDesc !== (bot as any)?.description) updates.description = settingsDesc;
      if (Object.keys(updates).length > 0) {
        await new Promise<void>((resolve, reject) =>
          updateBot.mutate({ botId, data: updates }, { onSuccess: () => resolve(), onError: () => reject(new Error("update failed")) })
        );
      }

      // 2. Save presence env vars — reject if any fail
      const envUpdates = [
        { key: "BOT_STATUS", value: settingsStatus },
        { key: "BOT_ACTIVITY_TYPE", value: settingsActivityType },
        { key: "BOT_ACTIVITY_TEXT", value: settingsActivityText.trim() },
        ...(settingsAvatar.trim() ? [{ key: "BOT_AVATAR_URL", value: settingsAvatar.trim() }] : []),
      ];
      await Promise.all(
        envUpdates.map(entry =>
          new Promise<void>((resolve, reject) =>
            setEnvVar.mutate({ botId, data: entry }, { onSuccess: () => resolve(), onError: () => reject(new Error(`No se pudo guardar ${entry.key}`)) })
          )
        )
      );
      qc.invalidateQueries({ queryKey: getListEnvVarsQueryKey(botId) });

      // 3. Push the live presence update regardless of the cached "running" status —
      // it's a no-op if the bot is stopped, and avoids missing the push when the
      // cached bot status is briefly stale. The bot itself applies it on its next poll (~3s).
      const presRes = await fetch(`/api/bots/${botId}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: settingsStatus, activityType: settingsActivityType, activityText: settingsActivityText.trim() }),
      });
      if (!presRes.ok) throw new Error("No se pudo enviar la presencia al bot");

      setSettingsSaved(true);
      refresh();
      toast({
        title: "✅ Guardado",
        description: isRunning
          ? "La presencia se aplicará en Discord en unos segundos."
          : "Se guardó y se aplicará en cuanto inicies el bot.",
      });

      if (isRunning) {
        // The bot process polls for presence changes every ~3s, so reflect
        // that visually instead of looking stuck/bugged right after saving.
        setApplyingPresence(true);
        setTimeout(() => {
          setApplyingPresence(false);
          refresh();
        }, 4000);
      }
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch {
      toast({ title: "Error al guardar la configuración", variant: "destructive" });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleApplyNow = async () => {
    if (applyingNow || (bot as any)?.status !== "running") return;
    setApplyingNow(true);
    // Hard cap so the button visually resolves even if the network call stalls —
    // it never looks permanently stuck loading.
    const safetyTimeout = setTimeout(() => setApplyingNow(false), 6000);
    try {
      const res = await fetch(`/api/bots/${botId}/presence/apply-now`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast({
          title: "No se pudo aplicar ahora",
          description: data?.message || "El bot no respondió a tiempo, intenta de nuevo.",
          variant: "destructive",
        });
      } else {
        toast({ title: "✅ Aplicado", description: "La presencia se actualizó en Discord." });
      }
    } catch {
      toast({ title: "No se pudo aplicar ahora", description: "Revisa tu conexión e intenta de nuevo.", variant: "destructive" });
    } finally {
      clearTimeout(safetyTimeout);
      setApplyingNow(false);
      refresh();
    }
  };

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-12 w-64" /><Skeleton className="h-64 w-full" /></div>;
  if (!bot) return <div className="text-muted-foreground">Bot no encontrado.</div>;

  const lang = (bot as any).language as "python" | "javascript";
  const isOwner = (bot as any).isOwner === true;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Link href="/bots">
          <Button variant="ghost" size="sm" className="gap-2 self-start">
            <ChevronLeft className="w-4 h-4" /> Bots
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold truncate">{(bot as any).name}</h1>
            <StatusBadge status={(bot as any).status} />
            <span className="text-sm text-muted-foreground">{lang === "python" ? "Python" : "JavaScript"}</span>
          </div>
          {(bot as any).description && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{(bot as any).description}</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {(bot as any).status !== "running" && <Button size="sm" onClick={() => handleAction("start")}><Play className="w-3 h-3 mr-1" />Start</Button>}
          {(bot as any).status === "running" && <Button size="sm" variant="outline" onClick={() => handleAction("stop")}><Square className="w-3 h-3 mr-1" />Stop</Button>}
          <Button size="sm" variant="outline" onClick={() => handleAction("restart")}><RotateCcw className="w-3 h-3 mr-1" />Restart</Button>
          <Button size="sm" variant="outline" disabled={rebuildLoading} title="Reinstala los paquetes (pip/npm) sin tocar tus archivos" onClick={async () => {
            setRebuildLoading(true);
            try {
              const res = await fetch(`/api/bots/${botId}/reinstall`, { method: "POST", credentials: "include" });
              if (res.ok) { refresh(); toast({ title: "📦 Reinstalando paquetes", description: "Tus archivos no fueron modificados." }); }
              else { const d = await res.json(); toast({ title: "Error al reinstalar", description: d.error, variant: "destructive" }); }
            } catch { toast({ title: "Error de red", variant: "destructive" }); }
            finally { setRebuildLoading(false); }
          }}>
            {rebuildLoading ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Reinstalando...</> : <><Rocket className="w-3 h-3 mr-1" />Reinstalar</>}
          </Button>
          {isOwner && (canShare ? (
            <Button size="sm" variant="outline" onClick={() => setShowShareDialog(v => !v)}>
              <Share2 className="w-3 h-3 mr-1" />Share
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="text-muted-foreground cursor-default" disabled title="Blocker Plus X feature">
              <Crown className="w-3 h-3 mr-1 text-yellow-400/60" />Share
            </Button>
          ))}
        </div>
      </div>

      {/* Share Panel */}
      {showShareDialog && (
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" /> Compartir Proyecto
              </CardTitle>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setShowShareDialog(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-md border border-border/30 bg-card/40 space-y-1 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">El colaborador podrá:</p>
              <p>• Ver y editar archivos del bot</p>
              <p>• Ver los logs en tiempo real</p>
              <p>• Ver las variables de entorno</p>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label htmlFor="share-discord-id" className="text-xs">Discord ID del usuario</Label>
                <Input
                  id="share-discord-id"
                  value={shareDiscordId}
                  onChange={e => setShareDiscordId(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleShare(); }}
                  placeholder="Ej: 123456789012345678"
                  className="mt-1 font-mono text-sm"
                />
              </div>
              <Button onClick={handleShare} disabled={shareLoading || !shareDiscordId.trim()} size="sm">
                {shareLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                Invitar
              </Button>
            </div>
            {sharesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : shares.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Colaboradores actuales</p>
                {shares.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border/30 bg-card/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{s.collaboratorUsername}</span>
                      <span className="text-xs text-muted-foreground font-mono hidden sm:block">{s.collaboratorDiscordId}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => handleRemoveShare(s.id)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">Sin colaboradores aun</p>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card/60 border border-border/40 w-full md:w-auto flex overflow-x-auto">
          <TabsTrigger value="files" className="flex-1 md:flex-none">Files</TabsTrigger>
          <TabsTrigger value="env" className="flex-1 md:flex-none">Environment</TabsTrigger>
          <TabsTrigger value="logs" className="flex-1 md:flex-none">Logs</TabsTrigger>
          <TabsTrigger value="deployments" className="flex-1 md:flex-none">Deployments</TabsTrigger>
          {isOwner && <TabsTrigger value="users" className="flex-1 md:flex-none"><Users className="w-3.5 h-3.5 mr-1" />Users</TabsTrigger>}
          {isOwner && <TabsTrigger value="settings" className="flex-1 md:flex-none"><Settings className="w-3.5 h-3.5 mr-1" />Settings</TabsTrigger>}
          <TabsTrigger value="guide" className="flex-1 md:flex-none"><BookOpen className="w-3.5 h-3.5 mr-1" />Guía</TabsTrigger>
        </TabsList>

        {/* Files */}
        <TabsContent value="files" className="mt-4 space-y-3">
          {/* Confirm Delete Dialog */}
          {confirmDeleteFile && (
            <Card className="bg-card/60 border-destructive/40 border">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Eliminar <span className="font-mono text-destructive">{confirmDeleteFile.split("/").pop()}</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">Esta acción no se puede deshacer.</p>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="destructive" onClick={() => handleDeleteFile(confirmDeleteFile)} disabled={deleteFile.isPending}>
                        {deleteFile.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}Eliminar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteFile(null)}>Cancelar</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Confirm Delete Folder Dialog */}
          {confirmDeleteFolder && (
            <Card className="bg-card/60 border-destructive/40 border">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Eliminar carpeta <span className="font-mono text-destructive">{confirmDeleteFolder.name}</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">Se eliminarán todos los archivos dentro. Esta acción no se puede deshacer.</p>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="destructive" onClick={handleDeleteFolder} disabled={deletingFolder}>
                        {deletingFolder ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}Eliminar carpeta
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteFolder(null)}>Cancelar</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Move File Modal */}
          {showMoveModal && movingFile && (
            <Card className="bg-card/60 border-primary/30 border">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><FolderInput className="w-4 h-4 text-primary" />Mover archivo</CardTitle>
                <button onClick={() => { setShowMoveModal(false); setMovingFile(null); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Moviendo: <span className="font-mono text-foreground">{movingFile.name}</span></p>
                <div>
                  <Label className="text-xs text-muted-foreground">Carpeta destino (ej: cogs, sistemas, utils)</Label>
                  <Input value={moveTargetFolder} onChange={e => setMoveTargetFolder(e.target.value)}
                    placeholder="cogs" className="font-mono text-sm mt-1"
                    onKeyDown={e => e.key === "Enter" && handleMoveFile()} autoFocus />
                </div>
                <p className="text-xs text-muted-foreground">Dejar vacío para mover a la raíz</p>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setShowMoveModal(false); setMovingFile(null); }}>Cancelar</Button>
                  <Button size="sm" onClick={handleMoveFile} disabled={renameFile.isPending}>
                    <FolderInput className="w-3.5 h-3.5 mr-1.5" />Mover
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* New File Dialog */}
          {showNewFile && (
            <Card className="bg-card/60 border-primary/30 border">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><FilePlus className="w-4 h-4 text-primary" />Nuevo Archivo</CardTitle>
                <button onClick={() => { setShowNewFile(false); setNewFileName(""); setNewFileContent(""); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Nombre del archivo</Label>
                  <Input
                    value={newFileName}
                    onChange={e => setNewFileName(e.target.value)}
                    placeholder="main.py o cogs/economia.py"
                    className="font-mono text-sm mt-1"
                    onKeyDown={e => e.key === "Enter" && handleCreateFile()}
                    autoFocus
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Contenido inicial (opcional)</Label>
                  <textarea
                    value={newFileContent}
                    onChange={e => setNewFileContent(e.target.value)}
                    placeholder="# Tu código aquí..."
                    className="w-full h-32 font-mono text-sm bg-background/50 border border-border/40 rounded-md p-3 resize-none focus:outline-none focus:border-primary/40 mt-1"
                    spellCheck={false}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setShowNewFile(false); setNewFileName(""); setNewFileContent(""); }}>Cancelar</Button>
                  <Button size="sm" onClick={handleCreateFile} disabled={!newFileName.trim() || uploadFile.isPending}>
                    <FilePlus className="w-3.5 h-3.5 mr-1.5" />Crear Archivo
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* New Folder Dialog */}
          {showNewFolder && (
            <Card className="bg-card/60 border-primary/30 border">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><FolderPlus className="w-4 h-4 text-primary" />Nueva Carpeta</CardTitle>
                <button onClick={() => { setShowNewFolder(false); setNewFolderName(""); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Nombre de la carpeta</Label>
                  <Input
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    placeholder="cogs"
                    className="font-mono text-sm mt-1"
                    onKeyDown={e => e.key === "Enter" && handleCreateFolder()}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}>Cancelar</Button>
                  <Button size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim() || createFolder.isPending}>
                    <FolderPlus className="w-3.5 h-3.5 mr-1.5" />Crear Carpeta
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 min-w-0">
                    <CardTitle className="text-sm">Archivos</CardTitle>
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs gap-1 text-muted-foreground hover:bg-accent/30 ml-1" title="Exportar proyecto como .zip"
                      onClick={handleExportProject} disabled={exportingZip}>
                      {exportingZip ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                      <span className="hidden sm:inline">Exportar</span>
                    </Button>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-primary hover:bg-primary/10"
                      onClick={() => { setShowNewFile(true); setShowNewFolder(false); }}>
                      <FilePlus className="w-3.5 h-3.5" />Nuevo
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:bg-accent/30"
                      onClick={() => { setShowNewFolder(true); setShowNewFile(false); }}>
                      <FolderPlus className="w-3.5 h-3.5" />Carpeta
                    </Button>
                    <label title="Subir archivo (incluye .zip)" className="h-7 px-2 text-xs gap-1 flex items-center cursor-pointer rounded text-muted-foreground hover:bg-accent/30 transition-colors">
                      <Upload className="w-3.5 h-3.5" />Subir
                      <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadZipFile(f); e.target.value = ""; }} />
                    </label>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* Breadcrumb navigation */}
                <div className="px-3 py-1.5 flex items-center gap-1 text-xs border-b border-border/30 bg-muted/10 min-h-[30px]">
                  <button onClick={() => handleGoToFolder([], -1)} className={`hover:text-foreground transition-colors ${!currentFolder ? "text-foreground font-medium" : "text-primary hover:underline"}`}>
                    📁 Raíz
                  </button>
                  {currentFolder && currentFolder.split("/").map((part, i, arr) => (
                    <span key={i} className="flex items-center gap-1">
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      <button
                        onClick={() => handleGoToFolder(arr, i)}
                        className={i === arr.length - 1 ? "text-foreground font-medium" : "text-primary hover:underline"}>
                        {part}
                      </button>
                    </span>
                  ))}
                </div>
                <div className="min-h-48 divide-y divide-border/30">
                  {(!files || (files as any[]).filter((f: any) => f.name !== ".gitkeep").length === 0) && (
                    <div className="p-4 text-center space-y-2">
                      <p className="text-xs text-muted-foreground">{currentFolder ? "Carpeta vacía." : "Sin archivos aún."}</p>
                      <Button size="sm" variant="outline" className="text-xs h-7 gap-1.5" onClick={() => setShowNewFile(true)}>
                        <FilePlus className="w-3 h-3" />{currentFolder ? "Crear archivo aquí" : "Crear primer archivo"}
                      </Button>
                    </div>
                  )}
                  {(files as any[])?.filter((f: any) => f.name !== ".gitkeep").map((f: any) => (
                    <div key={f.path} className={`group flex items-center gap-0 text-sm transition-colors ${selectedFile === f.path ? "bg-primary/10" : "hover:bg-accent/30"}`}>
                      <button onClick={() => {
                        if (f.type === "directory") handleFolderClick(f);
                        else { setSelectedFile(f.path); setFileContent(""); }
                      }} className={`flex-1 flex items-center gap-2 px-4 py-2 text-left min-w-0 ${selectedFile === f.path ? "text-primary" : "text-muted-foreground"}`}>
                        {f.type === "directory"
                          ? <Folder className="w-3.5 h-3.5 shrink-0 text-yellow-400" />
                          : <FileText className="w-3.5 h-3.5 shrink-0" />}
                        <span className="truncate">{f.name}</span>
                        {f.type === "directory" && <ChevronRight className="w-3 h-3 shrink-0 opacity-40 ml-auto" />}
                      </button>
                      <div className="flex items-center gap-0 pr-1 shrink-0">
                        {f.type !== "directory" && f.name.toLowerCase().endsWith(".zip") ? (
                          /* ZIP files — botón de exportar visible + menú ··· para el resto de opciones */
                          <>
                            <a
                              title="Exportar .zip"
                              href={`/api/files/${botId}/download?path=${encodeURIComponent(f.path)}`}
                              download={f.name}
                              onClick={(e) => e.stopPropagation()}
                              className={`p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-opacity ${selectedFile === f.path ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                              <Download className="w-3.5 h-3.5" />
                            </a>
                            <div className="relative">
                              <button
                                title="Opciones"
                                onClick={(e) => { e.stopPropagation(); setOpenFileMenu(openFileMenu === f.path ? null : f.path); }}
                                className={`p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-opacity ${selectedFile === f.path ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </button>
                              {openFileMenu === f.path && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setOpenFileMenu(null)} />
                                  <div className="absolute right-0 top-7 z-20 w-36 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
                                    <a
                                      href={`/api/files/${botId}/download?path=${encodeURIComponent(f.path)}`}
                                      download={f.name}
                                      onClick={() => setOpenFileMenu(null)}
                                      className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors text-foreground/80 cursor-pointer">
                                      <Download className="w-3.5 h-3.5" />
                                      Exportar
                                    </a>
                                    <button
                                      onClick={() => { setMovingFile({ path: f.path, name: f.name }); setMoveTargetFolder(currentFolder || ""); setShowMoveModal(true); setOpenFileMenu(null); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors text-foreground/80">
                                      <FolderInput className="w-3.5 h-3.5" />
                                      Mover
                                    </button>
                                    <button
                                      onClick={() => { setConfirmDeleteFile(f.path); setOpenFileMenu(null); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-destructive/20 hover:text-destructive transition-colors text-muted-foreground">
                                      <Trash2 className="w-3.5 h-3.5" />
                                      Eliminar
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </>
                        ) : f.type !== "directory" ? (
                          /* Otros archivos — botones inline al hover */
                          <>
                            <a
                              title="Descargar archivo"
                              href={`/api/files/${botId}/download?path=${encodeURIComponent(f.path)}`}
                              download={f.name}
                              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-accent text-muted-foreground hover:text-foreground transition-opacity">
                              <Download className="w-3.5 h-3.5" />
                            </a>
                            <button
                              title="Mover a carpeta"
                              onClick={() => { setMovingFile({ path: f.path, name: f.name }); setMoveTargetFolder(currentFolder || ""); setShowMoveModal(true); }}
                              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-accent text-muted-foreground hover:text-foreground transition-opacity">
                              <FolderInput className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Eliminar archivo"
                              onClick={() => setConfirmDeleteFile(f.path)}
                              className="p-1 rounded hover:bg-destructive/20 hover:text-destructive transition-colors text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          /* Carpetas — solo eliminar */
                          <button
                            title="Eliminar carpeta"
                            onClick={() => setConfirmDeleteFolder({ path: f.path, name: f.name })}
                            className="p-1 rounded hover:bg-destructive/20 hover:text-destructive transition-colors text-muted-foreground/60 opacity-100">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="md:col-span-2 bg-card/60 border-border/40">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <CardTitle className="text-sm truncate">{selectedFile ? selectedFile.split("/").pop() : "Selecciona un archivo"}</CardTitle>
                  {selectedFile && (
                    <button title="Eliminar archivo" onClick={() => setConfirmDeleteFile(selectedFile)}
                      className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {selectedFile && <Button size="sm" onClick={handleSaveFile} disabled={writeFile.isPending}><Save className="w-3 h-3 mr-1" />Guardar</Button>}
              </CardHeader>
              <CardContent className="p-0">
                {selectedFile ? (
                  <div className="flex rounded-b-lg overflow-hidden border border-border/40 font-mono text-sm" style={{ height: "22rem" }}>
                    <div ref={editorGutterRef} className="select-none bg-black/20 text-muted-foreground/50 text-right px-2 py-3 overflow-hidden border-r border-border/30 min-w-[3rem]"
                      style={{ lineHeight: "1.5rem", fontSize: "0.75rem" }}>
                      {fileContent.split("\n").map((_, i) => (
                        <div key={i} style={{ height: "1.5rem" }}>{i + 1}</div>
                      ))}
                    </div>
                    <textarea
                      ref={editorTextareaRef}
                      value={fileContent}
                      onChange={e => setFileContent(e.target.value)}
                      onScroll={e => {
                        if (editorGutterRef.current) editorGutterRef.current.scrollTop = e.currentTarget.scrollTop;
                      }}
                      className="flex-1 bg-background/50 p-3 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 text-sm font-mono"
                      style={{ lineHeight: "1.5rem", tabSize: 4 }}
                      spellCheck={false}
                    />
                  </div>
                ) : (
                  <div className="h-72 md:h-80 flex flex-col items-center justify-center text-muted-foreground text-sm gap-3 p-4">
                    <FileText className="w-8 h-8 opacity-20" />
                    <p>Selecciona un archivo para editar</p>
                    <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setShowNewFile(true)}>
                      <FilePlus className="w-3 h-3" />Nuevo archivo
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Environment */}
        <TabsContent value="env" className="mt-4">
          <Card className="bg-card/60 border-border/40">
            <CardHeader><CardTitle className="text-sm">Variables de Entorno</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-col sm:flex-row">
                <Input value={newEnvKey} onChange={e => setNewEnvKey(e.target.value)} placeholder="NOMBRE_VARIABLE" className="font-mono text-sm" />
                <Input value={newEnvVal} onChange={e => setNewEnvVal(e.target.value)} placeholder="valor" type="password" className="font-mono text-sm" />
                <Button onClick={handleAddEnv} disabled={!newEnvKey}><Plus className="w-4 h-4" /></Button>
              </div>
              <div className="divide-y divide-border/30 rounded-md border border-border/40 overflow-hidden">
                {(!envVars || (envVars as any[]).length === 0) && (
                  <p className="text-sm text-muted-foreground p-4 text-center">No hay variables configuradas.</p>
                )}
                {(envVars as any[])?.map((v: any) => (
                  <div key={v.id} className="flex flex-col gap-1 px-4 py-2.5">
                    {editingEnvVar?.id === v.id ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium min-w-0 flex-shrink-0">{v.key}</span>
                        <Input
                          value={editingEnvVal}
                          onChange={e => setEditingEnvVal(e.target.value)}
                          placeholder="nuevo valor"
                          className="font-mono text-sm flex-1 min-w-0 h-7"
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              setEnvVar.mutate({ botId, data: { key: v.key, value: editingEnvVal } }, {
                                onSuccess: () => { qc.invalidateQueries({ queryKey: getListEnvVarsQueryKey(botId) }); setEditingEnvVar(null); toast({ title: `${v.key} actualizada` }); },
                                onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
                              });
                            } else if (e.key === "Escape") { setEditingEnvVar(null); }
                          }}
                          autoFocus
                        />
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => {
                          setEnvVar.mutate({ botId, data: { key: v.key, value: editingEnvVal } }, {
                            onSuccess: () => { qc.invalidateQueries({ queryKey: getListEnvVarsQueryKey(botId) }); setEditingEnvVar(null); toast({ title: `${v.key} actualizada` }); },
                            onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
                          });
                        }}>Guardar</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingEnvVar(null)}>Cancelar</Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 min-w-0">
                          <span className="font-mono text-sm font-medium truncate">{v.key}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {visibleEnvIds.has(v.id) ? v.value : "•".repeat(8)}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            title={visibleEnvIds.has(v.id) ? "Ocultar valor" : "Mostrar valor"}
                            onClick={() => setVisibleEnvIds(prev => { const s = new Set(prev); s.has(v.id) ? s.delete(v.id) : s.add(v.id); return s; })}>
                            {visibleEnvIds.has(v.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                            title="Editar valor"
                            onClick={() => { setEditingEnvVar({ id: v.id, key: v.key }); setEditingEnvVal(""); }}>
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                            title="Eliminar variable"
                            onClick={() => deleteEnvVar.mutate({ botId, varId: v.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListEnvVarsQueryKey(botId) }) })}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs */}
        <TabsContent value="logs" className="mt-4">
          <Card className="bg-card/60 border-border/40">
            <CardHeader><CardTitle className="text-sm font-medium">Salida de Consola</CardTitle></CardHeader>
            <CardContent>
              <div className="h-96 overflow-y-auto font-mono text-xs space-y-1 bg-background/40 rounded-md p-4 border border-border/30">
                {(!logs || (logs as any[]).length === 0) && (
                  <p className="text-muted-foreground text-center py-8">Sin logs aún. Inicia tu bot para ver la salida.</p>
                )}
                {(logs as any[])?.map((l: any) => (
                  <div key={l.id} className="flex items-start gap-3">
                    <span className="text-muted-foreground shrink-0 text-[10px] pt-0.5">{new Date(l.timestamp).toLocaleTimeString()}</span>
                    <LogLevelBadge level={l.level} />
                    <span className="text-foreground/80 break-all">{l.message}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deployments */}
        <TabsContent value="deployments" className="mt-4">
          <Card className="bg-card/60 border-border/40">
            <CardHeader><CardTitle className="text-sm">Historial de Despliegues</CardTitle></CardHeader>
            <CardContent>
              <div className="divide-y divide-border/30">
                {botDeployments.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Sin despliegues aún.</p>}
                {botDeployments.map((d: any) => (
                  <div key={d.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{new Date(d.startedAt).toLocaleString()}</p>
                      {d.errorMessage && <p className="text-xs text-destructive mt-0.5">{d.errorMessage}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      d.status === "success" ? "bg-green-500/15 text-green-400 border-green-500/20" :
                      d.status === "failed" ? "bg-red-500/15 text-red-400 border-red-500/20" :
                      "bg-blue-500/15 text-blue-400 border-blue-500/20"
                    }`}>{d.status}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users — owner only */}
        <TabsContent value="users" className="mt-4">
          <Card className="bg-card/60 border-border/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" /> Usuarios con acceso
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sharesLoading ? (
                <Skeleton className="h-14 w-full" />
              ) : shares.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Sin colaboradores aún</p>
                  <p className="text-xs mt-1">Usa el botón <span className="font-semibold text-foreground">Share</span> del encabezado para invitar usuarios.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {shares.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-md border border-border/30 bg-card/30">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.collaboratorUsername}</p>
                          <p className="text-xs text-muted-foreground font-mono">{s.collaboratorDiscordId}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="shrink-0 gap-1.5"
                        onClick={() => handleRemoveShare(s.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />Eliminar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card/60 border-border/40">
              <CardHeader><CardTitle className="text-sm">Perfil del Bot</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-muted border border-border/40 overflow-hidden shrink-0">
                    {settingsAvatar ? (
                      <img src={settingsAvatar} alt="Bot avatar" className="w-full h-full object-cover"
                        onError={() => setSettingsAvatar("")} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                        {settingsName.charAt(0) || (bot as any).name?.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{settingsName || (bot as any).name}</p>
                    <p className="text-xs text-muted-foreground">{lang === "python" ? "Python" : "JavaScript"} bot</p>
                  </div>
                </div>

                <div>
                  <Label htmlFor="bot-name">Nombre del Bot</Label>
                  <Input id="bot-name" value={settingsName} onChange={e => setSettingsName(e.target.value)}
                    placeholder={(bot as any).name} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="bot-desc">Descripción</Label>
                  <Textarea id="bot-desc" value={settingsDesc} onChange={e => setSettingsDesc(e.target.value)}
                    placeholder="¿Qué hace tu bot?" className="mt-1 resize-none h-20" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bot-avatar">URL del Avatar</Label>
                  <div className="flex gap-2">
                    <Input id="bot-avatar" value={settingsAvatar} onChange={e => setSettingsAvatar(e.target.value)}
                      placeholder="https://cdn.discordapp.com/avatars/..." className="flex-1" />
                    {settingsAvatar && (
                      <img src={settingsAvatar} alt="avatar" className="w-9 h-9 rounded-full object-cover border border-border/40 shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Para obtener el avatar automáticamente, pega el token del bot abajo:</p>
                  <div className="flex gap-2">
                    <Input
                      value={manualToken}
                      onChange={e => setManualToken(e.target.value)}
                      placeholder="Token del bot (no se guarda)"
                      type="password"
                      className="flex-1 font-mono text-sm"
                    />
                    <Button size="sm" variant="outline" onClick={handleFetchAvatar} disabled={fetchingAvatar} className="shrink-0 gap-1.5">
                      {fetchingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Obtener
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground/60">El token solo se usa para consultar Discord y no se almacena</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/60 border-border/40">
              <CardHeader><CardTitle className="text-sm">Presencia y Estado</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <p className="text-xs text-muted-foreground">
                  Configura el estado y la actividad que verán los usuarios en Discord. Los cambios se aplican inmediatamente sin reiniciar el bot.
                </p>

                {/* Status selector */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {BOT_STATUSES.map(s => (
                      <button key={s.value} onClick={() => setSettingsStatus(s.value)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                          settingsStatus === s.value
                            ? "border-primary/50 bg-primary/10 text-foreground"
                            : "border-border/40 text-muted-foreground hover:bg-accent/30"
                        }`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Activity type */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo de Actividad</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "none", label: "Ninguna" },
                      { value: "playing", label: "🎮 Jugando" },
                      { value: "watching", label: "📺 Viendo" },
                      { value: "listening", label: "🎵 Escuchando" },
                      { value: "streaming", label: "🔴 Streaming" },
                      { value: "competing", label: "🏆 Compitiendo" },
                    ].map(a => (
                      <button key={a.value} onClick={() => setSettingsActivityType(a.value)}
                        className={`flex items-center justify-center gap-1 px-2 py-2 rounded-md border text-xs font-medium transition-colors ${
                          settingsActivityType === a.value
                            ? "border-primary/50 bg-primary/10 text-foreground"
                            : "border-border/40 text-muted-foreground hover:bg-accent/30"
                        }`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Activity text */}
                {settingsActivityType !== "none" && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Texto de actividad
                    </Label>
                    <Input
                      value={settingsActivityText}
                      onChange={e => setSettingsActivityText(e.target.value)}
                      placeholder={
                        settingsActivityType === "playing" ? "ej. {guilds} servidores" :
                        settingsActivityType === "watching" ? "ej. {users} usuarios" :
                        settingsActivityType === "listening" ? "ej. lo-fi beats" :
                        settingsActivityType === "streaming" ? "ej. Blocker X" :
                        "ej. {guilds} torneos"
                      }
                      className="text-sm font-mono"
                      maxLength={128}
                    />
                    {/* Dynamic variable chips */}
                    <div className="flex flex-wrap gap-1.5">
                      <p className="text-xs text-muted-foreground/60 w-full">Variables dinámicas (se actualizan cada 15s):</p>
                      {["{users}", "{guilds}", "{channels}", "{commands}", "{latency}", "{uptime}"].map(v => (
                        <button key={v} type="button"
                          onClick={() => setSettingsActivityText(t => t + v)}
                          className="text-xs font-mono px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors">
                          {v}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground/60">
                      Vista previa: <span className="text-foreground/70 font-medium">
                        {settingsActivityType === "playing" ? "Jugando a" :
                         settingsActivityType === "watching" ? "Viendo" :
                         settingsActivityType === "listening" ? "Escuchando" :
                         settingsActivityType === "streaming" ? "En streaming" :
                         "Compitiendo en"} {settingsActivityText || "..."}
                      </span>
                    </p>
                  </div>
                )}

                {/* Discord-style live preview */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vista previa en Discord</Label>
                  <div className="bg-[#1e1f22] rounded-xl px-4 py-3 border border-white/5 flex items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-primary/60" />
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#1e1f22] ${
                        settingsStatus === "online" ? "bg-green-500" :
                        settingsStatus === "idle" ? "bg-yellow-400" :
                        settingsStatus === "dnd" ? "bg-red-500" :
                        "bg-gray-500"
                      }`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white/90 truncate">{(bot as any)?.name || "Mi Bot"}</p>
                      {settingsActivityType !== "none" && settingsActivityText.trim() ? (
                        <p className="text-xs text-[#b5bac1] truncate">
                          {settingsActivityType === "playing" ? "Jugando a" :
                           settingsActivityType === "watching" ? "Viendo" :
                           settingsActivityType === "listening" ? "Escuchando" :
                           settingsActivityType === "streaming" ? "En directo:" :
                           "Compitiendo en"}{" "}
                          <span className="text-white/70 font-medium">{settingsActivityText.trim()}</span>
                        </p>
                      ) : settingsActivityType !== "none" ? (
                        <p className="text-xs text-[#b5bac1]/40 italic">escribe el texto de actividad...</p>
                      ) : (
                        <p className="text-xs text-[#b5bac1]/40 italic">sin actividad</p>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground/40 flex items-center gap-1.5" role="status" aria-live="polite">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${(applyingPresence || applyingNow) ? "bg-yellow-400 animate-pulse" : (bot as any)?.status === "running" ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                    {applyingNow
                      ? "Aplicando ahora en Discord..."
                      : applyingPresence
                      ? "Aplicando cambios en Discord..."
                      : (bot as any)?.status === "running"
                      ? "Cambios aplicados en Discord en unos segundos · sin reiniciar"
                      : "Inicia el bot para que la presencia aparezca en Discord"}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={handleSaveSettings}
                    disabled={isSavingSettings}
                    aria-busy={isSavingSettings}
                    className={`flex-1 transition-colors ${settingsSaved ? "bg-green-600 hover:bg-green-600 text-white" : ""}`}
                  >
                    {isSavingSettings ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />Guardando...</>
                    ) : applyingPresence ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />Aplicando en Discord...</>
                    ) : settingsSaved ? (
                      <><Save className="w-4 h-4 mr-2" aria-hidden="true" />¡Guardado!</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" aria-hidden="true" />Guardar Configuración</>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleApplyNow}
                    disabled={applyingNow || (bot as any)?.status !== "running"}
                    aria-busy={applyingNow}
                    aria-label={
                      (bot as any)?.status !== "running"
                        ? "Aplicar ahora — inicia el bot primero"
                        : applyingNow
                        ? "Aplicando presencia ahora, espera un momento"
                        : "Aplicar los cambios de presencia ahora mismo, sin esperar el ciclo automático"
                    }
                    title={(bot as any)?.status !== "running" ? "Inicia el bot para poder aplicar ahora" : "Fuerza la actualización inmediata en Discord"}
                    className="flex-1 sm:flex-none sm:min-w-[160px] gap-2"
                  >
                    {applyingNow ? (
                      <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Aplicando...</>
                    ) : (
                      <><Zap className="w-4 h-4" aria-hidden="true" />Aplicar ahora</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Discord Intents checker */}
          <Card className="bg-card/60 border-border/40 mt-4">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" /> Discord Intents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Los Intents de Discord deben activarse en el Developer Portal para que tu bot pueda leer mensajes y ver miembros.
              </p>
              <Button size="sm" variant="outline" onClick={handleCheckIntents} disabled={checkingIntents} className="gap-2">
                {checkingIntents ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                {checkingIntents ? "Verificando con Discord..." : "Verificar Intents del bot"}
              </Button>

              {/* Resultado de la verificación */}
              {intentsResult && !intentsResult.valid && (
                <div className="rounded-lg px-4 py-3 border bg-red-500/10 border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />{intentsResult.error}
                </div>
              )}
              {intentsResult?.valid && intentsResult.intents && (
                <div className="rounded-lg border border-border/30 overflow-hidden">
                  <div className="px-3 py-2 bg-muted/20 border-b border-border/20 text-xs font-medium text-foreground/80 flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                    Bot: <strong>{intentsResult.botName}</strong> — Estado de intents privilegiados
                  </div>
                  {[
                    { key: "messageContent", label: "Message Content Intent", desc: "Leer contenido de mensajes", enabled: intentsResult.intents.messageContent },
                    { key: "serverMembers",  label: "Server Members Intent",  desc: "Ver lista completa de miembros", enabled: intentsResult.intents.serverMembers },
                    { key: "presence",       label: "Presence Intent",        desc: "Ver presencia de usuarios", enabled: intentsResult.intents.presence },
                  ].map(i => (
                    <div key={i.key} className={`flex items-center gap-3 px-3 py-2.5 border-b border-border/10 last:border-0 ${i.enabled ? "bg-green-500/5" : "bg-red-500/5"}`}>
                      {i.enabled
                        ? <ShieldCheck className="w-4 h-4 text-green-400 shrink-0" />
                        : <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${i.enabled ? "text-green-400" : "text-red-400"}`}>{i.label}</p>
                        <p className="text-xs text-muted-foreground">{i.desc}</p>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${i.enabled ? "bg-green-500/15 text-green-400 border-green-500/20" : "bg-red-500/15 text-red-400 border-red-500/20"}`}>
                        {i.enabled ? "Activado" : "Desactivado"}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1 text-xs text-muted-foreground pt-1">
                <p>Activa los intents que necesites en el portal de Discord:</p>
                <a
                  href="https://discord.com/developers/applications"
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors font-medium">
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir Discord Developer Portal
                </a>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Guide */}
        <TabsContent value="guide" className="mt-4">
          <div className="space-y-4">

            {/* Section 1: Create files */}
            <Card className="bg-card/60 border-border/40">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <FilePlus className="w-4 h-4 text-primary" />
                  Cómo crear y organizar archivos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Los archivos de tu bot viven en la pestaña <strong className="text-foreground">Files</strong>. Aquí puedes crear, editar y organizar todo tu código.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
                    <p className="text-sm font-semibold flex items-center gap-2"><FilePlus className="w-4 h-4 text-primary" />Crear un archivo nuevo</p>
                    <ol className="text-xs text-muted-foreground space-y-1.5 list-none">
                      <li className="flex gap-2"><span className="bg-primary/20 text-primary rounded-full w-4 h-4 flex items-center justify-center shrink-0 font-bold text-[10px]">1</span>Ve a la pestaña <strong className="text-foreground">Files</strong></li>
                      <li className="flex gap-2"><span className="bg-primary/20 text-primary rounded-full w-4 h-4 flex items-center justify-center shrink-0 font-bold text-[10px]">2</span>Haz clic en el botón <strong className="text-foreground">Nuevo</strong> (arriba en el explorador)</li>
                      <li className="flex gap-2"><span className="bg-primary/20 text-primary rounded-full w-4 h-4 flex items-center justify-center shrink-0 font-bold text-[10px]">3</span>Escribe el nombre: <code className="bg-black/20 px-1 rounded font-mono">{lang === "python" ? "economia.py" : "economia.js"}</code></li>
                      <li className="flex gap-2"><span className="bg-primary/20 text-primary rounded-full w-4 h-4 flex items-center justify-center shrink-0 font-bold text-[10px]">4</span>Escribe el contenido inicial y haz clic en <strong className="text-foreground">Crear Archivo</strong></li>
                      <li className="flex gap-2"><span className="bg-primary/20 text-primary rounded-full w-4 h-4 flex items-center justify-center shrink-0 font-bold text-[10px]">5</span>Haz <strong className="text-foreground">Deploy</strong> para que el archivo entre en producción</li>
                    </ol>
                  </div>
                  <div className="p-3 bg-muted/30 border border-border/30 rounded-lg space-y-2">
                    <p className="text-sm font-semibold flex items-center gap-2"><FolderPlus className="w-4 h-4" />Organizar en carpetas</p>
                    <p className="text-xs text-muted-foreground">Puedes crear carpetas para organizar mejor tu bot. Por ejemplo:</p>
                    <div className="font-mono text-xs bg-black/20 rounded p-2 space-y-0.5 text-green-300/80">
                      {lang === "python" ? (
                        <>
                          <p>📄 main.py <span className="text-muted-foreground">← archivo principal</span></p>
                          <p>📄 requirements.txt <span className="text-muted-foreground">← dependencias</span></p>
                          <p>📁 cogs/</p>
                          <p>  📄 economia.py</p>
                          <p>  📄 moderacion.py</p>
                          <p>  📄 musica.py</p>
                        </>
                      ) : (
                        <>
                          <p>📄 index.js <span className="text-muted-foreground">← archivo principal</span></p>
                          <p>📄 package.json <span className="text-muted-foreground">← dependencias</span></p>
                          <p>📁 commands/</p>
                          <p>  📄 economia.js</p>
                          <p>  📄 moderacion.js</p>
                          <p>  📄 musica.js</p>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Para crear una carpeta, haz clic en <strong className="text-foreground">Carpeta</strong> en la pestaña Files.</p>
                  </div>
                </div>

                <div className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                  <p className="text-xs text-yellow-400 font-medium mb-1">⚠️ Recuerda siempre</p>
                  <p className="text-xs text-muted-foreground">Editar un archivo en Files y guardarlo <strong className="text-foreground">no</strong> actualiza el bot que está corriendo. Necesitas hacer <strong className="text-foreground">Deploy</strong> (botón arriba) para que los cambios se apliquen.</p>
                </div>
              </CardContent>
            </Card>

            {/* Section 2: Add commands */}
            <Card className="bg-card/60 border-border/40">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  Cómo agregar comandos a tu bot
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { n: 1, title: lang === "python" ? "Abre main.py" : "Abre index.js", desc: "Ve a Files y selecciona tu archivo principal para editarlo" },
                    { n: 2, title: "Agrega el comando", desc: lang === "python" ? "Crea una función con @bot.command() y el nombre del comando" : "Usa client.on('messageCreate') o SlashCommandBuilder" },
                    { n: 3, title: "Deploy y prueba", desc: "Presiona Deploy arriba y espera que inicie. Prueba el comando en tu servidor de Discord" },
                  ].map(step => (
                    <div key={step.n} className="p-3 bg-muted/30 rounded-lg border border-border/30">
                      <div className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center mb-2">{step.n}</div>
                      <p className="text-sm font-medium">{step.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{step.desc}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">📋 Código de ejemplo — cópialo a tu {lang === "python" ? "main.py" : "index.js"}</p>
                  <pre className="bg-background/70 border border-border/40 rounded-lg p-4 text-xs font-mono overflow-x-auto text-green-300/80 leading-relaxed">
                    {lang === "python" ? PYTHON_COMMANDS_GUIDE : JS_COMMANDS_GUIDE}
                  </pre>
                </div>
              </CardContent>
            </Card>

            {/* Section 3: Tips */}
            <Card className="bg-card/60 border-border/40">
              <CardHeader><CardTitle className="text-sm">💡 Cosas importantes que debes saber</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(lang === "python" ? [
                  { icon: "🔑", title: "Tu token está seguro", text: "No necesitas escribir tu token en el código. Ya está guardado. Usa: os.getenv('DISCORD_TOKEN')" },
                  { icon: "📦", title: "Instalar librerías", text: "Crea un archivo requirements.txt y escribe las librerías (una por línea). Ej: aiohttp, pillow, wavelink. Luego haz Deploy." },
                  { icon: "📡", title: "Activa los Intents", text: "Si tu bot no ve mensajes, entra a Discord Developer Portal → Tu App → Bot → activa 'Message Content Intent' y 'Server Members Intent'." },
                  { icon: "🔐", title: "Claves de API", text: "Guarda tus claves (YouTube API, etc.) en la pestaña Environment. Así no las escribes directo en el código." },
                  { icon: "🧩", title: "Usa Cogs para organizar", text: "Si tu bot crece mucho, divide los comandos en archivos separados (Cogs). Crea una carpeta 'cogs/' y agrega los archivos ahí." },
                ] : [
                  { icon: "🔑", title: "Tu token está seguro", text: "No necesitas escribir tu token en el código. Ya está guardado. Usa: process.env.DISCORD_TOKEN" },
                  { icon: "📦", title: "Instalar paquetes", text: "Edita package.json y agrega los paquetes en 'dependencies'. Ej: \"axios\": \"*\". Luego haz Deploy." },
                  { icon: "📡", title: "Activa los Intents", text: "Si tu bot no ve mensajes, entra a Discord Developer Portal → Tu App → Bot → activa 'Message Content Intent'." },
                  { icon: "🔐", title: "Claves de API", text: "Guarda tus claves en la pestaña Environment. Úsalas con process.env.MI_CLAVE." },
                  { icon: "🧩", title: "Organiza en comandos", text: "Si tu bot crece, divide los comandos en archivos separados en una carpeta 'commands/'. Usa require() o import para cargarlos." },
                ]).map((tip, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-muted/20 rounded-lg border border-border/20">
                    <span className="shrink-0 text-lg">{tip.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{tip.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{tip.text}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Section 3.5: Loading extra files / cogs */}
            {lang === "python" && (
              <Card className="bg-card/60 border-border/40 border-primary/20">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FolderPlus className="w-4 h-4 text-primary" />
                    Cómo usar archivos en carpetas (Cogs/Sistemas)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Si creaste una carpeta <code className="bg-black/20 px-1 rounded font-mono text-xs">cogs/</code> o <code className="bg-black/20 px-1 rounded font-mono text-xs">sistemas/</code> y pusiste tu código ahí,
                    el <strong className="text-foreground">main.py ya los carga automáticamente</strong> al iniciar — pero solo si el archivo tiene la función <code className="bg-black/20 px-1 rounded font-mono text-xs">setup(bot)</code>.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
                      <p className="text-xs font-semibold text-primary">✅ Estructura correcta de un Cog</p>
                      <pre className="text-xs font-mono bg-black/20 rounded p-2 text-green-300/80 leading-relaxed overflow-x-auto">{`# cogs/economia.py o sistemas/panel.py
import discord
from discord.ext import commands

class Economia(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.command(name="panel")
    async def panel(self, ctx):
        await ctx.send("¡Panel activo!")

# ⬇️ OBLIGATORIO: esta función carga el Cog
async def setup(bot):
    await bot.add_cog(Economia(bot))`}</pre>
                    </div>
                    <div className="space-y-2">
                      <div className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                        <p className="text-xs text-yellow-400 font-medium mb-1">⚠️ ¿Por qué no funciona mi comando?</p>
                        <ul className="text-xs text-muted-foreground space-y-1.5">
                          <li>• El archivo está en <code className="bg-black/20 px-1 rounded font-mono">sistemas/</code> o <code className="bg-black/20 px-1 rounded font-mono">cogs/</code> ✓</li>
                          <li>• Pero le falta la función <code className="bg-black/20 px-1 rounded font-mono">async def setup(bot):</code> ❌</li>
                          <li>• Sin esa función, el bot no puede cargarlo</li>
                        </ul>
                      </div>
                      <div className="p-3 bg-muted/30 border border-border/30 rounded-lg">
                        <p className="text-xs font-semibold mb-1">📋 Pasos para que funcione:</p>
                        <ol className="text-xs text-muted-foreground space-y-1">
                          <li>1. Crea el archivo dentro de <code className="bg-black/20 px-1 rounded font-mono">cogs/</code> o <code className="bg-black/20 px-1 rounded font-mono">sistemas/</code></li>
                          <li>2. Agrega la función <code className="bg-black/20 px-1 rounded font-mono">async def setup(bot):</code> al final</li>
                          <li>3. Haz <strong className="text-foreground">Deploy</strong> → el bot cargará el archivo automáticamente</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Section 4: Systems reference */}
            <Card className="bg-card/60 border-border/40">
              <CardHeader><CardTitle className="text-sm">⚡ ¿Qué puedo agregar a mi bot?</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[
                    { name: "Comandos básicos", desc: "!ping, !info, !ayuda — el punto de partida de todo bot", color: "text-blue-400" },
                    { name: "Moderación", desc: "!ban, !kick, !mute, !warn, !clear — para mantener el orden", color: "text-red-400" },
                    { name: "Economía", desc: "Sistema de monedas, balance, tienda, inventario, recompensas", color: "text-yellow-400" },
                    { name: "Bienvenida", desc: "Mensaje automático cuando alguien entra al servidor", color: "text-green-400" },
                    { name: "Música", desc: lang === "python" ? "Reproducir música con wavelink o yt-dlp" : "Música con distube o discord-player", color: "text-purple-400" },
                    { name: "Slash Commands", desc: lang === "python" ? "Comandos modernos con @bot.tree.command()" : "Comandos modernos con SlashCommandBuilder", color: "text-primary" },
                    { name: "Niveles y XP", desc: "Sistema de experiencia y rangos por actividad en el servidor", color: "text-orange-400" },
                    { name: "Tickets de soporte", desc: "Sistema para abrir tickets privados de soporte", color: "text-cyan-400" },
                  ].map(sys => (
                    <div key={sys.name} className="flex items-start gap-3 p-2.5 bg-muted/20 rounded-lg border border-border/20">
                      <span className={`font-bold text-sm shrink-0 mt-0.5 ${sys.color}`}>→</span>
                      <div>
                        <p className="text-xs font-semibold">{sys.name}</p>
                        <p className="text-xs text-muted-foreground">{sys.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3 text-center">💬 Usa la <strong className="text-foreground">IA</strong> (menú lateral) para que te ayude a crear cualquiera de estos sistemas automáticamente.</p>
              </CardContent>
            </Card>

          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
