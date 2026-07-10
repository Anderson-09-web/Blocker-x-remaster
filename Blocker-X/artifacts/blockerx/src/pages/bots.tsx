import { useState, useEffect } from "react";
import { useListBots, useCreateBot, useStartBot, useStopBot, useRestartBot, useDeleteBot, getListBotsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Plus, Play, Square, RotateCcw, Trash2, ExternalLink, TerminalSquare, CheckCircle, ChevronRight, Code2, Cpu, RefreshCw, Users } from "lucide-react";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    running: "bg-green-500/15 text-green-400 border-green-500/20",
    stopped: "bg-gray-500/15 text-gray-400 border-gray-500/20",
    errored: "bg-red-500/15 text-red-400 border-red-500/20",
    deploying: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    starting: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  };
  return map[status] || map.stopped;
}

const PYTHON_GUIDE = [
  "Tu bot usa discord.py con una plantilla lista para usar.",
  'El prefijo por defecto es "!" — prueba !ping o !hello.',
  "Edita main.py en el Administrador de Archivos para agregar tus comandos.",
  "Agrega dependencias a requirements.txt (se instalan automáticamente al iniciar).",
  "Haz clic en Deploy para lanzar tu bot.",
];

const JS_GUIDE = [
  "Tu bot usa discord.js v14 con una plantilla lista para usar.",
  'El prefijo por defecto es "!" — prueba !ping o !hello.',
  "Edita index.js en el Administrador de Archivos para agregar tus comandos.",
  "Agrega paquetes a package.json (se instalan automáticamente al iniciar).",
  "Haz clic en Deploy para lanzar tu bot.",
];

interface BotInfo {
  id: string;
  username: string;
  avatar: string | null;
}

type Step = 1 | 2 | 3;

function CreateBotWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<Step>(1);
  const [language, setLanguage] = useState<"python" | "javascript" | "">("");
  const [form, setForm] = useState({ name: "", token: "", clientId: "", clientSecret: "", description: "" });
  const [createdBotName, setCreatedBotName] = useState("");
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createBot = useCreateBot();
  const { toast } = useToast();

  const fetchBotInfo = async () => {
    if (!form.token.trim()) return;
    setFetchingInfo(true);
    setBotInfo(null);
    try {
      const res = await fetch("/api/bots/verify-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: form.token.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setBotInfo({ id: data.id, username: data.username, avatar: data.avatar });
        if (!form.name) setForm(f => ({ ...f, name: data.username }));
      } else {
        toast({ title: data.error || "Token inválido", description: "Verifica el token en Discord Developer Portal.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de conexión", description: "No se pudo verificar el token.", variant: "destructive" });
    } finally {
      setFetchingInfo(false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.token.trim()) e.token = "El Token es requerido";
    if (!form.clientId.trim()) e.clientId = "El Client ID es requerido";
    if (!form.clientSecret.trim()) e.clientSecret = "El Client Secret es requerido";
    if (!form.name.trim()) e.name = "El nombre es requerido";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = () => {
    if (!validate() || !language) return;
    createBot.mutate(
      {
        data: {
          name: form.name,
          description: form.description,
          language: language as any,
          token: form.token,
          clientId: form.clientId,
          clientSecret: form.clientSecret,
        } as any,
      },
      {
        onSuccess: (bot: any) => {
          setCreatedBotName(bot.name);
          setStep(3);
          onCreated();
        },
        onError: (err: any) => {
          const msg = err?.data?.error || err?.message || "Error al crear el bot";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const guide = language === "python" ? PYTHON_GUIDE : JS_GUIDE;

  return (
    <DialogContent className="bg-card border-border/60 max-w-lg">
      <DialogHeader>
        <div className="flex items-center gap-3 mb-1">
          {([1, 2, 3] as Step[]).map((s) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold border transition-colors ${step >= s ? "bg-primary border-primary text-primary-foreground" : "border-border/50 text-muted-foreground"}`}>
                {step > s ? <CheckCircle className="w-3.5 h-3.5" /> : s}
              </div>
              {s < 3 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
            </div>
          ))}
        </div>
        <DialogTitle className="text-lg">
          {step === 1 && "Elige el Lenguaje"}
          {step === 2 && "Configura Tu Bot"}
          {step === 3 && "¡Bot Creado!"}
        </DialogTitle>
      </DialogHeader>

      <>
        {step === 1 && (
          <div className="space-y-3 mt-2">
            <p className="text-sm text-muted-foreground">Selecciona el lenguaje de programación para tu bot.</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setLanguage("python"); setStep(2); }}
                className={`p-4 rounded-xl border text-left transition-all hover:border-primary/60 hover:bg-primary/5 ${language === "python" ? "border-primary bg-primary/10" : "border-border/50 bg-card/40"}`}
              >
                <Cpu className="w-6 h-6 text-blue-400 mb-2" />
                <div className="font-semibold text-sm">Python</div>
                <div className="text-xs text-muted-foreground mt-0.5">discord.py template</div>
                <div className="text-xs text-muted-foreground">requests, dotenv</div>
              </button>
              <button
                onClick={() => { setLanguage("javascript"); setStep(2); }}
                className={`p-4 rounded-xl border text-left transition-all hover:border-primary/60 hover:bg-primary/5 ${language === "javascript" ? "border-primary bg-primary/10" : "border-border/50 bg-card/40"}`}
              >
                <Code2 className="w-6 h-6 text-yellow-400 mb-2" />
                <div className="font-semibold text-sm">JavaScript</div>
                <div className="text-xs text-muted-foreground mt-0.5">discord.js v14 template</div>
                <div className="text-xs text-muted-foreground">dotenv included</div>
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg">
              {language === "python" ? <Cpu className="w-4 h-4 text-blue-400" /> : <Code2 className="w-4 h-4 text-yellow-400" />}
              {language === "python" ? "Python (discord.py)" : "JavaScript (discord.js)"}
              <button onClick={() => setStep(1)} className="ml-auto text-primary hover:underline">Cambiar</button>
            </div>

            {/* Bot info preview */}
            {botInfo && (
              <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                {botInfo.avatar ? (
                  <img src={botInfo.avatar} alt="Bot" className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg font-bold">{botInfo.username.charAt(0)}</div>
                )}
                <div>
                  <p className="text-sm font-semibold text-green-400">✓ Bot verificado</p>
                  <p className="text-xs text-muted-foreground">{botInfo.username} · ID: {botInfo.id}</p>
                </div>
              </div>
            )}

            {/* Token */}
            <div>
              <Label htmlFor="bot-token">
                Token del Bot <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="bot-token"
                  type="password"
                  value={form.token}
                  onChange={e => { setForm(f => ({ ...f, token: e.target.value })); setErrors(er => ({ ...er, token: "" })); setBotInfo(null); }}
                  placeholder="MTI3..."
                  className={`flex-1 font-mono text-xs ${errors.token ? "border-destructive" : ""}`}
                />
                <Button type="button" variant="outline" size="sm" onClick={fetchBotInfo} disabled={fetchingInfo || !form.token.trim()} className="shrink-0">
                  {fetchingInfo ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Verificar"}
                </Button>
              </div>
              {errors.token && <p className="text-xs text-destructive mt-1">{errors.token}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                Obtenlo en <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">discord.com/developers</a> → Tu App → Bot → Token
              </p>
            </div>

            {/* Client ID */}
            <div>
              <Label htmlFor="client-id">
                Client ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="client-id"
                value={form.clientId}
                onChange={e => { setForm(f => ({ ...f, clientId: e.target.value })); setErrors(er => ({ ...er, clientId: "" })); }}
                placeholder="1234567890123456789"
                className={`mt-1 font-mono text-xs ${errors.clientId ? "border-destructive" : ""}`}
              />
              {errors.clientId && <p className="text-xs text-destructive mt-1">{errors.clientId}</p>}
              <p className="text-xs text-muted-foreground mt-1">Tu App → OAuth2 → Client ID</p>
            </div>

            {/* Client Secret */}
            <div>
              <Label htmlFor="client-secret">
                Client Secret <span className="text-destructive">*</span>
              </Label>
              <Input
                id="client-secret"
                type="password"
                value={form.clientSecret}
                onChange={e => { setForm(f => ({ ...f, clientSecret: e.target.value })); setErrors(er => ({ ...er, clientSecret: "" })); }}
                placeholder="abc123..."
                className={`mt-1 font-mono text-xs ${errors.clientSecret ? "border-destructive" : ""}`}
              />
              {errors.clientSecret && <p className="text-xs text-destructive mt-1">{errors.clientSecret}</p>}
              <p className="text-xs text-muted-foreground mt-1">Tu App → OAuth2 → Client Secret</p>
            </div>

            {/* Name */}
            <div>
              <Label htmlFor="bot-name">Nombre del Bot <span className="text-destructive">*</span></Label>
              <Input
                id="bot-name"
                value={form.name}
                onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErrors(er => ({ ...er, name: "" })); }}
                placeholder="Mi Bot Genial"
                className={`mt-1 ${errors.name ? "border-destructive" : ""}`}
              />
              {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="bot-desc">Descripción <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input id="bot-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="¿Qué hace este bot?" className="mt-1" />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Atrás</Button>
              <Button onClick={handleCreate} disabled={createBot.isPending} className="flex-1">
                {createBot.isPending ? "Creando..." : "Crear Bot"}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 mt-2">
            <div className="flex flex-col items-center gap-2 py-3">
              {botInfo?.avatar ? (
                <img src={botInfo.avatar} alt="Bot" className="w-16 h-16 rounded-full border-2 border-primary/30" />
              ) : (
                <CheckCircle className="w-12 h-12 text-green-400" />
              )}
              <p className="text-base font-semibold">¡{createdBotName} está listo!</p>
              <p className="text-sm text-muted-foreground text-center">Tu bot fue creado con una plantilla base. Así puedes empezar:</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4 space-y-2">
              {guide.map((tip, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-primary font-semibold shrink-0">{i + 1}.</span>
                  <span className="text-muted-foreground">{tip}</span>
                </div>
              ))}
            </div>
            <Button onClick={onClose} className="w-full">Ir a Mis Bots</Button>
          </div>
        )}
      </>
    </DialogContent>
  );
}

export default function BotsPage() {
  const { data: bots, isLoading } = useListBots({ query: { queryKey: getListBotsQueryKey(), refetchInterval: 5000 } });
  const startBot = useStartBot();
  const stopBot = useStopBot();
  const restartBot = useRestartBot();
  const deleteBot = useDeleteBot();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListBotsQueryKey() });

  const handleAction = (action: "start" | "stop" | "restart" | "delete", botId: string, name: string) => {
    const fns = { start: startBot, stop: stopBot, restart: restartBot, delete: deleteBot };
    (fns[action] as any).mutate({ botId }, {
      onSuccess: () => { refresh(); toast({ title: `Bot ${action === "start" ? "iniciado" : action === "stop" ? "detenido" : action === "restart" ? "reiniciado" : "eliminado"} correctamente` }); },
      onError: (e: any) => toast({ title: `Error al ${action}`, description: e?.message, variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mis Bots</h1>
          <p className="text-muted-foreground mt-1">Administra y despliega tus bots de Discord</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo Bot
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : bots?.length === 0 ? (
        <Card className="border-dashed border-border/60 bg-card/30">
          <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
            <TerminalSquare className="w-12 h-12 text-muted-foreground/40" />
            <p className="text-muted-foreground text-center">Aún no tienes bots. Crea tu primer bot para empezar.</p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" /> Crear Bot
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {bots?.map((bot: any) => (
            <Card key={bot.id} className="bg-card/60 border-border/50 hover:border-primary/30 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base font-semibold truncate">{bot.name}</CardTitle>
                      {bot.isShared && (
                        <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-purple-500/15 text-purple-400 border-purple-500/20 flex items-center gap-1 shrink-0">
                          <Users className="w-2.5 h-2.5" /> Compartido
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {bot.language === "python"
                        ? <Cpu className="w-3 h-3 text-blue-400" />
                        : <Code2 className="w-3 h-3 text-yellow-400" />}
                      <p className="text-xs text-muted-foreground">{bot.language === "python" ? "Python" : "JavaScript"}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${statusBadge(bot.status)}`}>
                    {bot.status}
                  </span>
                </div>
                {bot.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{bot.description}</p>}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {bot.status !== "running" && bot.status !== "starting" && bot.status !== "deploying" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAction("start", bot.id, bot.name)}>
                      <Play className="w-3 h-3 mr-1" /> Start
                    </Button>
                  )}
                  {(bot.status === "running" || bot.status === "starting" || bot.status === "deploying") && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAction("stop", bot.id, bot.name)}>
                      <Square className="w-3 h-3 mr-1" /> Stop
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAction("restart", bot.id, bot.name)}>
                    <RotateCcw className="w-3 h-3 mr-1" /> Restart
                  </Button>
                  <Link href={`/bots/${bot.id}`}>
                    <Button size="sm" variant="ghost" className="h-7 text-xs">
                      <ExternalLink className="w-3 h-3 mr-1" /> Manage
                    </Button>
                  </Link>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:bg-destructive/10" onClick={() => handleAction("delete", bot.id, bot.name)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Creado el {new Date(bot.createdAt).toLocaleDateString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <CreateBotWizard onClose={() => setShowCreate(false)} onCreated={refresh} />
      </Dialog>
    </div>
  );
}
