import { useState } from "react";
import { useListInviteCodes, useCreateInviteCode, useDeleteInviteCode, useToggleInviteCode, getListInviteCodesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Copy, Trash2, ToggleLeft, ToggleRight, KeyRound, Crown, Zap } from "lucide-react";

type GrantPlan = "none" | "plus" | "blockerx";

const PLAN_OPTIONS: { value: GrantPlan; label: string; description: string; color: string }[] = [
  {
    value: "none",
    label: "Invite solo (Free)",
    description: "Da acceso a la plataforma sin cambiar el plan",
    color: "border-border/60 bg-card/60",
  },
  {
    value: "plus",
    label: "Plus — 0.70€/mes",
    description: "Al canjear, sube al usuario a plan Plus",
    color: "border-blue-500/40 bg-blue-500/5",
  },
  {
    value: "blockerx",
    label: "Blocker X — 1.99€/mes",
    description: "Al canjear, sube al usuario a plan Blocker X",
    color: "border-yellow-500/40 bg-yellow-500/5",
  },
];

function PlanBadge({ plan }: { plan?: string | null; grantsPremium?: boolean }) {
  if (plan === "blockerx")
    return <span className="text-xs px-1.5 py-0.5 rounded-full border bg-yellow-500/15 text-yellow-400 border-yellow-500/20 flex items-center gap-1"><Crown className="w-2.5 h-2.5" /> Blocker X</span>;
  if (plan === "plus")
    return <span className="text-xs px-1.5 py-0.5 rounded-full border bg-blue-500/15 text-blue-400 border-blue-500/20 flex items-center gap-1"><Zap className="w-2.5 h-2.5" /> Plus</span>;
  return null;
}

export default function AdminInvitesPage() {
  const { data: codes, isLoading } = useListInviteCodes();
  const createInvite = useCreateInviteCode();
  const deleteInvite = useDeleteInviteCode();
  const toggleInvite = useToggleInviteCode();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ maxUses: "", customCode: "", grantPlan: "none" as GrantPlan });

  const refresh = () => qc.invalidateQueries({ queryKey: getListInviteCodesQueryKey() });

  const openDialog = () => {
    setForm({ maxUses: "", customCode: "", grantPlan: "none" });
    setOpen(true);
  };

  const handleCreate = () => {
    const grantsPlan = form.grantPlan === "none" ? undefined : form.grantPlan;
    const grantsPremium = form.grantPlan !== "none";
    createInvite.mutate({
      data: {
        maxUses: form.maxUses ? parseInt(form.maxUses) : undefined,
        customCode: form.customCode || undefined,
        grantsPremium,
        grantsPlan,
      } as any
    }, {
      onSuccess: () => {
        refresh();
        setOpen(false);
        const label = form.grantPlan === "blockerx" ? "Blocker X" : form.grantPlan === "plus" ? "Plus" : "Invite";
        toast({ title: `Key de ${label} creada` });
      },
      onError: () => toast({ title: "Error al crear", variant: "destructive" }),
    });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copiado al portapapeles" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invite Codes</h1>
          <p className="text-muted-foreground mt-1">Gestiona accesos y keys de plan para la plataforma</p>
        </div>
        <Button onClick={openDialog}>
          <Plus className="w-4 h-4 mr-2" /> Crear key
        </Button>
      </div>

      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1,2,3].map(i=><Skeleton key={i} className="h-14 w-full"/>)}</div>
          ) : !(codes as any[])?.length ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <KeyRound className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No hay códigos aún.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {(codes as any[])?.map((c: any) => (
                <div key={c.id} className="flex items-center gap-4 px-4 md:px-6 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="font-mono font-bold text-primary text-sm">{c.code}</code>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => copyCode(c.code)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border ${c.isActive ? "bg-green-500/15 text-green-400 border-green-500/20" : "bg-gray-500/15 text-gray-400 border-gray-500/20"}`}>
                        {c.isActive ? "Activo" : "Desactivado"}
                      </span>
                      <PlanBadge plan={c.grantsPlan} grantsPremium={c.grantsPremium} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.usesCount}{c.maxUses ? `/${c.maxUses}` : ""} usos
                      {c.expiresAt ? ` · Expira ${new Date(c.expiresAt).toLocaleDateString()}` : ""}
                      · Creado {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title={c.isActive ? "Desactivar" : "Activar"}
                      onClick={() => toggleInvite.mutate({ inviteId: c.id }, { onSuccess: refresh })}>
                      {c.isActive ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                      onClick={() => deleteInvite.mutate({ inviteId: c.id }, { onSuccess: refresh })}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border/60">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> Crear key de acceso
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Plan selector */}
            <div>
              <Label className="mb-2 block">Plan que otorga la key</Label>
              <div className="space-y-2">
                {PLAN_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, grantPlan: opt.value }))}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${opt.color} ${form.grantPlan === opt.value ? "ring-2 ring-primary/60" : "opacity-70 hover:opacity-100"}`}
                  >
                    <p className="text-sm font-semibold">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="custom-code">Código personalizado (opcional)</Label>
              <Input id="custom-code" value={form.customCode}
                onChange={e => setForm(f => ({ ...f, customCode: e.target.value }))}
                placeholder="Dejar vacío para autogenerar"
                className="mt-1 font-mono uppercase" />
            </div>
            <div>
              <Label htmlFor="max-uses">Máximo de usos (opcional)</Label>
              <Input id="max-uses" type="number" value={form.maxUses}
                onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
                placeholder="Ilimitado" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createInvite.isPending}>
              {createInvite.isPending ? "Creando..." : "Crear key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
