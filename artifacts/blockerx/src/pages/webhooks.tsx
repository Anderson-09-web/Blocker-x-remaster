import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Webhook, Plus, Trash2, TestTube, Copy, Eye, EyeOff, Pencil, Globe, Bot } from "lucide-react";

const ALL_EVENTS = [
  { key: "bot_started", label: "Bot Started", color: "bg-green-500/15 text-green-400 border-green-500/30" },
  { key: "bot_stopped", label: "Bot Stopped", color: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  { key: "bot_crashed", label: "Bot Crashed", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  { key: "bot_deployed", label: "Bot Deployed", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { key: "bot_restarted", label: "Bot Restarted", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
];

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Error en la petición");
  }
  return res.json();
}

interface WebhookData {
  id: string;
  botId: string | null;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
}

interface WebhookFormData {
  url: string;
  events: string[];
  enabled: boolean;
  botId: string;
}

const defaultForm: WebhookFormData = {
  url: "",
  events: ["bot_started", "bot_stopped", "bot_crashed"],
  enabled: true,
  botId: "",
};

export default function WebhooksPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editHook, setEditHook] = useState<WebhookData | null>(null);
  const [form, setForm] = useState<WebhookFormData>(defaultForm);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ webhooks: WebhookData[] }>({
    queryKey: ["webhooks"],
    queryFn: () => apiFetch("/webhooks"),
  });

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch("/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: "Webhook creado" });
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      setDialogOpen(false);
      setForm(defaultForm);
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      apiFetch(`/webhooks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: "Webhook actualizado" });
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      setDialogOpen(false);
      setEditHook(null);
      setForm(defaultForm);
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Webhook eliminado" });
      qc.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/webhooks/${id}/test`, { method: "POST" }),
    onSuccess: (data) => {
      if (data.ok) {
        toast({ title: "Ping enviado exitosamente", description: `Status: ${data.statusCode}` });
      } else {
        toast({
          title: "Ping fallido",
          description: data.error || `Status: ${data.statusCode}`,
          variant: "destructive",
        });
      }
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch(`/webhooks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditHook(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(hook: WebhookData) {
    setEditHook(hook);
    setForm({
      url: hook.url,
      events: hook.events,
      enabled: hook.enabled,
      botId: hook.botId ?? "",
    });
    setDialogOpen(true);
  }

  function toggleEvent(key: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(key) ? f.events.filter((e) => e !== key) : [...f.events, key],
    }));
  }

  function handleSubmit() {
    const body = {
      url: form.url,
      events: form.events,
      enabled: form.enabled,
      botId: form.botId || undefined,
    };
    if (editHook) {
      updateMutation.mutate({ id: editHook.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  function copySecret(secret: string) {
    navigator.clipboard.writeText(secret);
    toast({ title: "Secret copiado" });
  }

  function toggleReveal(id: string) {
    setRevealedSecrets((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const hooks = data?.webhooks ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="w-6 h-6 text-primary" />
            Webhooks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recibe notificaciones HTTP cuando ocurran eventos en tus bots.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Nuevo Webhook
        </Button>
      </div>

      {/* Info card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="font-semibold text-foreground mb-1">Firma HMAC-SHA256</p>
              <p className="text-muted-foreground">Cada request incluye el header <code className="bg-muted px-1 rounded text-xs">X-BX-Signature</code> para verificar autenticidad.</p>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">Timeout 10s</p>
              <p className="text-muted-foreground">Tu endpoint debe responder en menos de 10 segundos o el delivery falla.</p>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">Scope de bots</p>
              <p className="text-muted-foreground">Puedes crear webhooks globales (todos tus bots) o específicos por bot ID.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : hooks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Webhook className="w-10 h-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No tienes webhooks configurados</p>
            <p className="text-sm text-muted-foreground/60">Crea uno para empezar a recibir eventos de tus bots.</p>
            <Button onClick={openCreate} variant="outline" className="mt-2 gap-2">
              <Plus className="w-4 h-4" />
              Crear primer webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {hooks.map((hook) => {
            const revealed = revealedSecrets.has(hook.id);
            return (
              <div key={hook.id}>
                <Card className={`transition-colors duration-100 ${hook.enabled ? "" : "opacity-60"}`}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* URL row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded truncate max-w-sm">
                              {hook.url}
                            </code>
                            {hook.botId ? (
                              <Badge variant="outline" className="gap-1 text-xs shrink-0">
                                <Bot className="w-3 h-3" />
                                {hook.botId.slice(0, 8)}…
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 text-xs shrink-0">
                                <Globe className="w-3 h-3" />
                                Todos los bots
                              </Badge>
                            )}
                            <Badge variant={hook.enabled ? "default" : "secondary"} className="text-xs shrink-0">
                              {hook.enabled ? "Activo" : "Inactivo"}
                            </Badge>
                          </div>

                          {/* Events */}
                          <div className="flex flex-wrap gap-1.5">
                            {hook.events.map((ev) => {
                              const meta = ALL_EVENTS.find((e) => e.key === ev);
                              return (
                                <span
                                  key={ev}
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium ${meta?.color ?? "bg-muted text-muted-foreground"}`}
                                >
                                  {meta?.label ?? ev}
                                </span>
                              );
                            })}
                          </div>

                          {/* Secret row */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Secret:</span>
                            <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                              {revealed ? hook.secret : "•".repeat(20)}
                            </code>
                            <button
                              onClick={() => toggleReveal(hook.id)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => copySecret(hook.secret)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={hook.enabled}
                            onCheckedChange={(enabled) => toggleMutation.mutate({ id: hook.id, enabled })}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => testMutation.mutate(hook.id)}
                            disabled={testMutation.isPending || !hook.enabled}
                          >
                            <TestTube className="w-3.5 h-3.5" />
                            Test
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8"
                            onClick={() => openEdit(hook)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteMutation.mutate(hook.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editHook ? "Editar Webhook" : "Nuevo Webhook"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>URL del endpoint</Label>
              <Input
                placeholder="https://tu-servidor.com/webhook"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Debe ser accesible públicamente vía HTTP POST.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Bot ID (opcional)</Label>
              <Input
                placeholder="Dejar vacío para todos tus bots"
                value={form.botId}
                onChange={(e) => setForm((f) => ({ ...f, botId: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Eventos a escuchar</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_EVENTS.map((ev) => {
                  const active = form.events.includes(ev.key);
                  return (
                    <button
                      key={ev.key}
                      onClick={() => toggleEvent(ev.key)}
                      className={`px-3 py-1 rounded-full text-xs border font-medium transition-all duration-150 ${
                        active ? ev.color : "bg-muted/40 text-muted-foreground border-border hover:border-muted-foreground"
                      }`}
                    >
                      {ev.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Habilitado</Label>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>

            {!editHook && (
              <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">🔑 Se generará un secret automáticamente</p>
                <p>Úsalo para verificar que los requests vienen de BX. El header será:</p>
                <code className="block bg-background px-2 py-1 rounded mt-1">X-BX-Signature: sha256=&#60;hmac&#62;</code>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending || !form.url || form.events.length === 0}
            >
              {editHook ? "Guardar cambios" : "Crear webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
