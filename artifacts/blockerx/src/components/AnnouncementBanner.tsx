import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, WrenchIcon, Info, AlertCircle } from "lucide-react";

interface Banner {
  type: "maintenance" | "error" | "info" | "warning";
  title: string;
  message: string;
  setAt: string;
}

const STYLES: Record<Banner["type"], { bg: string; border: string; icon: React.ElementType; iconColor: string; text: string }> = {
  maintenance: {
    bg: "bg-amber-950/60",
    border: "border-amber-500/40",
    icon: WrenchIcon,
    iconColor: "text-amber-400",
    text: "text-amber-100",
  },
  error: {
    bg: "bg-red-950/60",
    border: "border-red-500/40",
    icon: AlertCircle,
    iconColor: "text-red-400",
    text: "text-red-100",
  },
  warning: {
    bg: "bg-orange-950/60",
    border: "border-orange-500/40",
    icon: AlertTriangle,
    iconColor: "text-orange-400",
    text: "text-orange-100",
  },
  info: {
    bg: "bg-blue-950/60",
    border: "border-blue-500/40",
    icon: Info,
    iconColor: "text-blue-400",
    text: "text-blue-100",
  },
};

export default function AnnouncementBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchBanner() {
      try {
        const res = await fetch("/api/banner", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setBanner(data?.banner ?? null);
      } catch {
        // non-critical — silently ignore
      }
    }

    fetchBanner();
    const interval = setInterval(fetchBanner, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const visible = banner && banner.setAt !== dismissed;

  if (!visible) return null;

  const style = STYLES[banner.type] ?? STYLES.info;
  const Icon = style.icon;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={`shrink-0 border-b ${style.bg} ${style.border} backdrop-blur-sm`}
        >
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-start gap-3">
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.iconColor}`} />
            <div className="flex-1 min-w-0">
              <span className={`text-sm font-semibold ${style.text}`}>{banner.title}</span>
              <span className={`text-sm ml-2 ${style.text} opacity-80`}>{banner.message}</span>
            </div>
            <button
              onClick={() => setDismissed(banner.setAt)}
              className={`shrink-0 ${style.iconColor} opacity-60 hover:opacity-100 transition-opacity`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
