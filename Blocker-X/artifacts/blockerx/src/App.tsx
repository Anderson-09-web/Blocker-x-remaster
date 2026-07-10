import React from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";

import LandingPage from "@/pages/landing";
import InvitePage from "@/pages/invite";
import DashboardPage from "@/pages/dashboard";
import BotsPage from "@/pages/bots";
import BotDetailPage from "@/pages/bot-detail";
import AnnouncementsPage from "@/pages/announcements";
import StoragePage from "@/pages/storage";
import AiPage from "@/pages/ai";
import NotificationsPage from "@/pages/notifications";
import ProfilePage from "@/pages/profile";
import SettingsPage from "@/pages/settings";
import BillingPage from "@/pages/billing";
import AdminPage from "@/pages/admin";
import AdminUsersPage from "@/pages/admin-users";
import AdminInvitesPage from "@/pages/admin-invites";
import AdminDeploymentsPage from "@/pages/admin-deployments";
import AdminLogsPage from "@/pages/admin-logs";
import AdminBroadcastPage from "@/pages/admin-broadcast";
import AdminDocsPage from "@/pages/admin-docs";
import WebhooksPage from "@/pages/webhooks";
import NotFound from "@/pages/not-found";
import PrivacyPage from "@/pages/privacy";
import UsagePoliciesPage from "@/pages/usage-policies";
import DashboardLayout from "@/components/layout/dashboard-layout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function ProtectedRoute({ component: Component, adminOnly = false }: { component: React.ComponentType; adminOnly?: boolean }) {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    </div>
  );
  if (user.isBanned) return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <p className="text-2xl font-bold text-destructive mb-2">Account Suspended</p>
        <p className="text-muted-foreground">Your account has been suspended. Contact support for help.</p>
      </div>
    </div>
  );
  if (adminOnly && !user.isAdmin) return <NotFound />;
  return <Component />;
}

/**
 * All protected/dashboard routes share ONE DashboardLayout instance.
 * This is the key fix — previously each Route rendered its own DashboardLayout,
 * causing the sidebar to unmount+remount (and glitch) on every navigation.
 */
function DashboardRoutes() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard"><ProtectedRoute component={DashboardPage} /></Route>
        <Route path="/bots/:botId"><ProtectedRoute component={BotDetailPage} /></Route>
        <Route path="/bots"><ProtectedRoute component={BotsPage} /></Route>
        <Route path="/announcements"><ProtectedRoute component={AnnouncementsPage} /></Route>
        <Route path="/storage"><ProtectedRoute component={StoragePage} /></Route>
        <Route path="/ai"><ProtectedRoute component={AiPage} /></Route>
        <Route path="/notifications"><ProtectedRoute component={NotificationsPage} /></Route>
        <Route path="/profile"><ProtectedRoute component={ProfilePage} /></Route>
        <Route path="/settings"><ProtectedRoute component={SettingsPage} /></Route>
        <Route path="/billing"><ProtectedRoute component={BillingPage} /></Route>
        <Route path="/admin/users"><ProtectedRoute component={AdminUsersPage} adminOnly /></Route>
        <Route path="/admin/invites"><ProtectedRoute component={AdminInvitesPage} adminOnly /></Route>
        <Route path="/admin/deployments"><ProtectedRoute component={AdminDeploymentsPage} adminOnly /></Route>
        <Route path="/admin/logs"><ProtectedRoute component={AdminLogsPage} adminOnly /></Route>
        <Route path="/admin/broadcast"><ProtectedRoute component={AdminBroadcastPage} adminOnly /></Route>
        <Route path="/admin/docs"><ProtectedRoute component={AdminDocsPage} adminOnly /></Route>
        <Route path="/admin"><ProtectedRoute component={AdminPage} adminOnly /></Route>
        <Route path="/webhooks"><ProtectedRoute component={WebhooksPage} /></Route>
        <Route><NotFound /></Route>
      </Switch>
    </DashboardLayout>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/usage" component={UsagePoliciesPage} />
      <Route path="/invite" component={InvitePage} />
      {/* All other paths share one stable DashboardLayout — sidebar never remounts */}
      <Route><DashboardRoutes /></Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider disableHoverableContent skipDelayDuration={0} delayDuration={0}>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
