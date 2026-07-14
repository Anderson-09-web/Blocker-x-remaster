import { useState, type ElementType } from "react";
import { useGetProfile } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Crown, Key, Zap, Bot, Brain, Share2, Clock, Shield, Webhook, Code2, Globe, Star, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type Plan = "free" | "plus" | "blockerx";

const PLANS: {
  id: Plan;
  name: string;
  price: string;
  period: string;
  badge?: string;
  features: { icon: ElementType; text: string }[];
  accent: string;
  cardClass: string;
  badgeClass: string;
  activeClass: string;
}[] = [
  {
    id: "free",
    name: "Free",
    price: "0€",
    period: "siempre",
    features: [
      { icon: Bot, text: "Hasta 2 bots" },
      { icon: Zap, text: "512 MB de almacenamiento" },
      { icon: Brain, text: "10 consultas IA / mes" },
      { icon: Clock, text: "Auto-pausa tras 48 h" },
      { icon: Share2, text: "Compartir proyectos" },
      { icon: Globe, text: "Python & JavaScript" },
    ],
    accent: "text-muted-foreground",
    cardClass: "bg-card/60 border-border/40",
    badgeClass: "bg-muted text-muted-foreground",
    activeClass: "ring-1 ring-border/60",
  },
  {
    id: "plus",
    name: "Plus",
    price: "0.70€",
    period: "mes",
    features: [
      { icon: Bot, text: "Hasta 5 bots" },
      { icon: Zap, text: "2 GB de almacenamiento" },
      { icon: Brain, text: "50 consultas IA / mes" },
      { icon: Clock, text: "Sin auto-pausa" },
      { icon: Share2, text: "Compartir proyectos" },
      { icon: Webhook, text: "Webhooks avanzados" },
      { icon: RefreshCw, text: "Reinicios automáticos" },
      { icon: Globe, text: "Python & JavaScript" },
    ],
    accent: "text-blue-400",
    cardClass: "bg-blue-500/5 border-blue-500/30",
    badgeClass: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
    activeClass: "ring-1 ring-blue-400/30",
  },
  {
    id: "blockerx",
    name: "Blocker X",
    price: "1.99€",
    period: "mes",
    badge: "Recomendado",
    features: [
      { icon: Bot, text: "Bots ilimitados" },
      { icon: Zap, text: "5 GB de almacenamiento" },
      { icon: Brain, text: "IA sin límites" },
      { icon: Clock, text: "Sin auto-pausa nunca" },
      { icon: Share2, text: "Compartir proyectos" },
      { icon: Webhook, text: "Webhooks ilimitados" },
      { icon: RefreshCw, text: "Reinicios automáticos" },
      { icon: Code2, text: "Python & JavaScript" },
      { icon: Star, text: "Acceso anticipado a novedades" },
      { icon: Shield, text: "Soporte prioritario" },
      { icon: Crown, text: "Badge exclusivo de Blocker X" },
    ],
    accent: "text-yellow-400",
    cardClass: "bg-primary/5 border-primary/40",
    badgeClass: "bg-yellow-400/10 text-yellow-400 border border-yellow-400/20",
    activeClass: "ring-1 ring-yellow-400/30",
  },
];

function planLabel(plan: Plan) {
  return { free: "Free", plus: "Plus", blockerx: "Blocker X" }[plan] ?? plan;
}

export default function BillingPage() {
  const { data: profile, refetch } = useGetProfile();
  const user = (profile as any)?.user;
  const { toast } = useToast();
  const qc = useQueryClient();
  const currentPlan: Plan = (user?.plan as Plan) || "free";

  const [keyInput, setKeyInput] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);

  const handleRedeemKey = async () => {
    if (!keyInput.trim()) return;
    setIsRedeeming(true);
    try {
      const res = await fetch("/api/invite/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: keyInput.trim() }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Clave inválida", description: data.error, variant: "destructive" });
      } else {
        toast({
          title: data.grantsPremium ? "🎉 ¡Plan activado!" : "Clave canjeada",
          description: data.message,
        });
        setKeyInput("");
        refetch();
        qc.invalidateQueries();
      }
    } catch {
      toast({ title: "Error", description: "No se pudo canjear la clave", variant: "destructive" });
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Plan y facturación</h1>
        <p className="text-muted-foreground mt-1">Administra tu suscripción y acceso a funciones</p>
      </div>

      {/* Current plan banner */}
      {(() => {
        const cp = PLANS.find(p => p.id === currentPlan) ?? PLANS[0];
        return (
          <div className={`flex items-center gap-3 px-5 py-4 rounded-xl border ${cp.cardClass}`}>
            <Crown className={`w-5 h-5 shrink-0 ${cp.accent}`} />
            <div>
              <p className="font-semibold text-sm">Plan {planLabel(currentPlan)} activo</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentPlan === "free"
                  ? "Canjea una clave para desbloquear más funciones."
                  : "Tienes acceso completo a las funciones de tu plan."}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl">
        {PLANS.map(plan => {
          const isActive = currentPlan === plan.id;
          return (
            <Card
              key={plan.id}
              className={`relative ${plan.cardClass} ${isActive ? plan.activeClass : ""}`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    {plan.badge}
                  </span>
                </div>
              )}
              <CardHeader className="pb-3 pt-6">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className={`flex items-center gap-2 ${plan.accent}`}>
                    {plan.name}
                    {plan.id === "blockerx" && <Crown className="w-4 h-4 text-yellow-400" />}
                  </span>
                  {isActive && (
                    <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${plan.badgeClass}`}>
                      Activo
                    </span>
                  )}
                </CardTitle>
                <p className="text-3xl font-bold">
                  {plan.price}{" "}
                  <span className="text-sm font-normal text-muted-foreground">/ {plan.period}</span>
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2">
                  {plan.features.map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className={`w-4 h-4 shrink-0 ${plan.accent}`} />
                      <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
                      {text}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Redeem Key */}
      <Card className="bg-card/60 border-border/40 max-w-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            Canjear clave de acceso
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {currentPlan === "blockerx" ? (
            <div className="flex items-center gap-2 text-sm text-yellow-400 bg-yellow-400/5 border border-yellow-400/20 rounded-lg px-4 py-3">
              <Crown className="w-4 h-4 shrink-0" />
              Ya tienes el plan Blocker X activo. ¡Disfruta todas las funciones!
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                ¿Tienes una clave? Ingrésala aquí para actualizar tu plan al instante.
              </p>
              <div className="flex gap-2">
                <Input
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX"
                  className="font-mono uppercase tracking-widest"
                  onKeyDown={e => e.key === "Enter" && handleRedeemKey()}
                />
                <Button onClick={handleRedeemKey} disabled={!keyInput.trim() || isRedeeming}>
                  {isRedeeming ? "Canjeando..." : "Canjear"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
