import { useEffect } from "react";
import { SiDiscord } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    if (user.isBanned) return;
    if (!user.hasInvite && !user.isAdmin) {
      setLocation("/invite");
      return;
    }
    setLocation(user.isAdmin ? "/admin" : "/dashboard");
  }, [user, isLoading]);

  const handleDiscordLogin = () => {
    const apiBase = import.meta.env.VITE_API_URL || "";
    window.location.href = `${apiBase}/api/auth/discord`;
  };

  if (error === "banned") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm px-4">
          <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto border border-destructive/20">
            <span className="text-3xl">X</span>
          </div>
          <h2 className="text-2xl font-bold text-destructive">Account Suspended</h2>
          <p className="text-muted-foreground text-sm">
            This account has been suspended. Contact support if you think this is a mistake.
          </p>
          <Button variant="outline" onClick={handleDiscordLogin} className="mt-4">
            <SiDiscord className="mr-2 w-4 h-4" />
            Try a different account
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="z-10 flex flex-col items-center max-w-lg text-center px-4"
      >
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-8 border border-primary/20 shadow-[0_0_40px_rgba(var(--primary),0.2)]">
          <div className="w-8 h-8 bg-primary rounded-lg rotate-45" />
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 text-foreground">
          Blocker <span className="text-primary">X</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-10 max-w-md mx-auto leading-relaxed">
          Premium Discord bot hosting. Fast, reliable, and built for developers who demand control.
        </p>

        <Button
          size="lg"
          onClick={handleDiscordLogin}
          className="h-14 px-8 text-base bg-[#5865F2] hover:bg-[#4752C4] text-white border-0 shadow-[0_0_20px_rgba(88,101,242,0.3)] transition-all hover:shadow-[0_0_30px_rgba(88,101,242,0.5)]"
        >
          <SiDiscord className="mr-3 w-5 h-5" />
          Sign in with Discord
        </Button>

        <div className="mt-10 flex items-center gap-3 text-xs text-muted-foreground/50">
          <a
            href="/privacy"
            className="hover:text-muted-foreground transition-colors underline-offset-4 hover:underline"
          >
            Privacy Policy
          </a>
          <span className="opacity-50">|</span>
          <a
            href="/usage"
            className="hover:text-muted-foreground transition-colors underline-offset-4 hover:underline"
          >
            Usage Policies
          </a>
        </div>
      </motion.div>
    </div>
  );
}
