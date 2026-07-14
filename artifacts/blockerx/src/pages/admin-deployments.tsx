import { useListAllDeployments } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Rocket } from "lucide-react";

export default function AdminDeploymentsPage() {
  const { data: deployments, isLoading } = useListAllDeployments();

  function statusStyle(status: string) {
    const map: Record<string, string> = {
      success: "bg-green-500/15 text-green-400 border-green-500/20",
      failed: "bg-red-500/15 text-red-400 border-red-500/20",
      running: "bg-blue-500/15 text-blue-400 border-blue-500/20",
      pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
      cancelled: "bg-gray-500/15 text-gray-400 border-gray-500/20",
    };
    return map[status] || map.cancelled;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">All Deployments</h1>
        <p className="text-muted-foreground mt-1">Platform-wide deployment history</p>
      </div>

      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-14 w-full"/>)}</div>
          ) : !(deployments as any[])?.length ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Rocket className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No deployments yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {(deployments as any[])?.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between px-6 py-4 hover:bg-accent/10 transition-colors" data-testid={`row-deploy-${d.id}`}>
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-sm">{d.botName}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${statusStyle(d.status)}`}>{d.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      User: {d.userId} · {new Date(d.startedAt).toLocaleString()}
                    </p>
                    {d.errorMessage && <p className="text-xs text-destructive mt-1">{d.errorMessage}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
