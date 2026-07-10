import { useGetSystemLogs } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";

export default function AdminLogsPage() {
  const { data: logs, isLoading } = useGetSystemLogs({});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground mt-1">Track admin actions across the platform</p>
      </div>

      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-12 w-full"/>)}</div>
          ) : !(logs as any[])?.length ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <FileText className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No audit logs yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30 font-mono text-sm">
              {(logs as any[])?.map((l: any) => (
                <div key={l.id} className="flex items-start gap-4 px-6 py-3 hover:bg-accent/10" data-testid={`row-log-${l.id}`}>
                  <span className="text-muted-foreground text-xs shrink-0 pt-0.5">{new Date(l.createdAt).toLocaleString()}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-primary font-medium">{l.action}</span>
                    {l.target && <span className="text-muted-foreground"> → {l.target}</span>}
                    {l.details && <span className="text-muted-foreground"> · {l.details}</span>}
                    {l.userId && <p className="text-xs text-muted-foreground mt-0.5">by {l.userId}</p>}
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
