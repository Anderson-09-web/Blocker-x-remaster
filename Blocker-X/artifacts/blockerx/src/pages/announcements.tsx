import { useListNotifications } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone, CheckCircle2, AlertTriangle, Info, XCircle, Bell } from "lucide-react";

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; border: string; label: string }> = {
  announcement: { icon: Megaphone, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20", label: "Anuncio" },
  success:      { icon: CheckCircle2, color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/20",  label: "Éxito" },
  warning:      { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20", label: "Aviso" },
  error:        { icon: XCircle,       color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/20",    label: "Error" },
  info:         { icon: Info,          color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20",   label: "Info" },
};

function typeConfig(type: string) {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG.info;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "Ahora mismo";
  if (m < 60) return `Hace ${m} min`;
  if (h < 24) return `Hace ${h}h`;
  if (d < 7) return `Hace ${d}d`;
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function AnnouncementsPage() {
  const { data: rawNotifs, isLoading } = useListNotifications();
  const all = (rawNotifs as any[]) ?? [];

  // Show all notifications, with "announcement" type first
  const sorted = [...all].sort((a, b) => {
    const aScore = a.type === "announcement" ? 1 : 0;
    const bScore = b.type === "announcement" ? 1 : 0;
    if (bScore !== aScore) return bScore - aScore;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Megaphone className="w-7 h-7 text-primary" />
          Anuncios
        </h1>
        <p className="text-muted-foreground mt-1">
          Novedades, avisos de mantenimiento y notificaciones de la plataforma
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : sorted.length === 0 ? (
        <Card className="bg-card/60 border-border/40">
          <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-14 h-14 rounded-full bg-muted/30 flex items-center justify-center">
              <Bell className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm">Sin anuncios por ahora</p>
              <p className="text-xs text-muted-foreground mt-1">Cuando el equipo publique algo, aparecerá aquí y también recibirás un DM en Discord.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map(n => {
            const cfg = typeConfig(n.type);
            const Icon = cfg.icon;
            return (
              <div
                key={n.id}
                className={`flex gap-4 p-4 rounded-xl border ${cfg.bg} ${cfg.border} ${!n.isRead ? "ring-1 ring-white/5" : "opacity-80"}`}
              >
                <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cfg.bg} border ${cfg.border}`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${cfg.color} mr-2`}>{cfg.label}</span>
                      <span className="text-sm font-semibold">{n.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{n.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center pb-4">
        Los anuncios importantes también se envían por DM a tu cuenta de Discord.
      </p>
    </div>
  );
}
