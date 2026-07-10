import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRedeemInviteCode } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import bxLogo from "@/assets/bx-logo.png";
import { ArrowRight, Lock } from "lucide-react";

export default function InvitePage() {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const redeemMutation = useRedeemInviteCode();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleRedeem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    redeemMutation.mutate({ data: { code } }, {
      onSuccess: () => {
        toast({ title: "Access Granted", description: "Welcome to BX." });
        window.location.href = "/dashboard";
      },
      onError: (err: any) => {
        toast({
          title: "Invalid Code",
          description: err.error || "The invite code is invalid or expired.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Animated grid */}
      <div className="absolute inset-0 bx-grid-bg opacity-60" />

      {/* Big ambient glow center */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,213,255,0.06) 0%, transparent 70%)",
          animation: "bx-glow-pulse 6s ease-in-out infinite",
        }}
      />

      {/* Corner glows */}
      <div className="absolute top-0 left-0 w-80 h-80 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(0,213,255,0.04) 0%, transparent 70%)" }} />
      <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(0,213,255,0.03) 0%, transparent 70%)" }} />

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-sm"
      >
        {/* Card border glow */}
        <div className="absolute -inset-px rounded-xl pointer-events-none"
          style={{ background: "linear-gradient(135deg, rgba(0,213,255,0.15) 0%, transparent 50%, rgba(0,213,255,0.05) 100%)" }} />

        <div className="relative rounded-xl border border-border/60 bg-card/70 backdrop-blur-xl overflow-hidden">
          {/* Scanline at top */}
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(0,213,255,0.5), transparent)" }} />

          <div className="p-8">
            {/* Logo */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.05, duration: 0.25 }}
              className="flex justify-center mb-6"
            >
              <div className="relative">
                <img
                  src={bxLogo}
                  alt="BX"
                  className="w-20 h-20 object-contain bx-logo-glow"
                  style={{ imageRendering: "crisp-edges" }}
                />
                {/* Cyan ring */}
                <motion.div
                  animate={{ opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -inset-2 rounded-xl border border-primary/20 pointer-events-none"
                />
              </div>
            </motion.div>

            {/* Text */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.2 }}
              className="text-center mb-8"
            >
              <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
                Private Beta
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                BX is currently invite-only.
                <br />Enter your code to access the platform.
              </p>
            </motion.div>

            {/* Form */}
            <motion.form
              onSubmit={handleRedeem}
              className="space-y-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.2 }}
            >
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <Input
                  placeholder="ENTER INVITE CODE"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="pl-9 h-12 text-center text-sm tracking-[0.2em] uppercase font-mono bg-background/40 border-border/60 focus:border-primary/50 focus:ring-primary/20"
                  maxLength={12}
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 font-semibold tracking-wide gap-2 text-sm"
                disabled={!code || redeemMutation.isPending}
              >
                {redeemMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Verifying...
                  </span>
                ) : (
                  <>
                    Enter Platform
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </motion.form>
          </div>

          {/* Footer bar */}
          <div className="px-8 py-3 border-t border-border/40 bg-background/20">
            <p className="text-center text-[10px] text-muted-foreground/40 tracking-widest uppercase">
              BX Platform · Invite Only
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
