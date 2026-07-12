import React, { useState } from "react";
import Sidebar, { SidebarContent } from "./sidebar";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import bxLogo from "@/assets/bx-logo.png";
import { useLocation } from "wouter";

function isDomCleanupError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)) ?? "";
  return (
    msg.includes("removeChild") ||
    msg.includes("insertBefore") ||
    msg.includes("El nodo que se va a eliminar") ||
    msg.includes("The node to be removed is not a child") ||
    (err instanceof DOMException && err.name === "NotFoundError")
  );
}

class PageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(err: Error) {
    if (isDomCleanupError(err)) return { hasError: false, error: "" };
    return { hasError: true, error: err?.message || "Unknown error" };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
          <p className="text-destructive font-semibold">Algo salió mal</p>
          <p className="text-sm text-muted-foreground max-w-sm text-center">{this.state.error}</p>
          <button
            className="text-xs bg-primary text-primary-foreground px-4 py-2 rounded-lg"
            onClick={() => this.setState({ hasError: false, error: "" })}
          >Reintentar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        {/* Ambient grid background */}
        <div className="absolute inset-0 bx-grid-bg pointer-events-none z-0" />
        {/* Top radial glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[300px] pointer-events-none z-0"
          style={{
            background: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(0,213,255,0.04) 0%, transparent 70%)",
          }}
        />

        {/* Mobile header */}
        <header className="relative z-10 h-14 md:hidden flex items-center px-4 border-b border-border/60 bg-sidebar/80 backdrop-blur-md shrink-0 gap-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="p-0 w-60 bg-sidebar border-border/60"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <SidebarContent onNavigate={() => setTimeout(() => setMobileOpen(false), 50)} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <img src={bxLogo} alt="BX" className="w-7 h-7 object-contain bx-logo-glow" />
            <span className="font-bold tracking-[0.08em] text-sm text-foreground">BX</span>
          </div>
        </header>

        {/* Global announcement banner */}
        <div className="relative z-10">
          <AnnouncementBanner />
        </div>

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative z-10">
          <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-full">
            <PageErrorBoundary>
              {children}
            </PageErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
