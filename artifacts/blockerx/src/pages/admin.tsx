import { useGetAdminStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, TerminalSquare, Rocket, KeyRound, Bot, Activity } from "lucide-react";

export default function AdminPage() {
  const { data: stats, isLoading } = useGetAdminStats();

  const statItems = [
    { label: "Total Users", value: (stats as any)?.totalUsers, icon: Users },
    { label: "Blocker Plus X Users", value: (stats as any)?.premiumUsers, icon: Users },
    { label: "Banned Users", value: (stats as any)?.bannedUsers, icon: Users },
    { label: "Total Bots", value: (stats as any)?.totalBots, icon: TerminalSquare },
    { label: "Running Bots", value: (stats as any)?.runningBots, icon: Bot },
    { label: "Total Deployments", value: (stats as any)?.totalDeployments, icon: Rocket },
    { label: "Active Invites", value: (stats as any)?.activeInviteCodes, icon: KeyRound },
    { label: "AI Requests", value: (stats as any)?.totalAIRequests, icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">Platform-wide statistics and management</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statItems.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card/60 border-border/40">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16" /> : (
                <p className="text-3xl font-bold" data-testid={`stat-${label.toLowerCase().replace(/ /g,"-")}`}>{value ?? 0}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
