import React from "react";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TerminalSquare, Rocket, HardDrive, Activity, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCountUp } from "@/hooks/use-count-up";

function StatCard({ title, value, rawValue, icon: Icon, description, delay = 0 }: {
  title: string;
  value: string;
  rawValue: number;
  icon: React.ElementType;
  description: string;
  delay?: number;
}) {
  const animated = useCountUp(rawValue, 800);

  return (
    <div>
      <Card className="relative overflow-hidden border-border/60 bg-card/60 backdrop-blur-sm bx-card-glow bx-stat-bar">
        {/* Diagonal line accent */}
        <div
          className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
          style={{
            background: "linear-gradient(225deg, rgba(0,213,255,0.06) 0%, transparent 60%)",
          }}
        />
        <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </CardTitle>
          <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="text-2xl font-bold tracking-tight mb-0.5 tabular-nums">
            {value.includes("MB") || value.includes("KB")
              ? value
              : animated.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return (
    <div className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 border border-green-500/20 font-medium">
      <CheckCircle2 className="w-3 h-3" /> success
    </div>
  );
  if (status === "failed") return (
    <div className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
      <XCircle className="w-3 h-3" /> failed
    </div>
  );
  return (
    <div className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-medium">
      <Clock className="w-3 h-3" /> {status}
    </div>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useGetDashboardStats();

  const storageMB = stats ? stats.storageUsedBytes / 1024 / 1024 : 0;
  const storageStr = storageMB < 1
    ? `${(storageMB * 1024).toFixed(0)} KB`
    : `${storageMB.toFixed(2)} MB`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-7 rounded-full bg-primary" style={{ boxShadow: "0 0 10px rgba(0,213,255,0.8)" }} />
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        </div>
        <p className="text-sm text-muted-foreground ml-4">Overview of your bots and deployments.</p>
      </div>

      {/* Stat cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <Card key={i} className="border-border/60 bg-card/60">
              <CardContent className="pt-4 pb-4 px-4 space-y-3">
                <Skeleton className="h-3 w-24 bx-shimmer" />
                <Skeleton className="h-8 w-16 bx-shimmer" />
                <Skeleton className="h-3 w-32 bx-shimmer" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Bots"
            value={String(stats?.totalBots || 0)}
            rawValue={stats?.totalBots || 0}
            icon={TerminalSquare}
            description={`${stats?.runningBots || 0} currently running`}
            delay={0}
          />
          <StatCard
            title="Deployments"
            value={String(stats?.totalDeployments || 0)}
            rawValue={stats?.totalDeployments || 0}
            icon={Rocket}
            description="Total lifetime deployments"
            delay={0.06}
          />
          <StatCard
            title="Storage Used"
            value={storageStr}
            rawValue={Math.round(storageMB * 100)}
            icon={HardDrive}
            description="Across all projects"
            delay={0.12}
          />
          <StatCard
            title="AI Requests"
            value={String(stats?.aiUsageCount || 0)}
            rawValue={stats?.aiUsageCount || 0}
            icon={Activity}
            description="Tokens used this month"
            delay={0.18}
          />
        </div>
      )}

      {/* Bottom cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent deployments */}
        <div>
          <Card className="border-border/60 bg-card/60 backdrop-blur-sm bx-card-glow h-full">
            <CardHeader className="pb-3 pt-5 px-5">
              <div className="flex items-center gap-2">
                <Rocket className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-semibold">Recent Deployments</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {isLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-11 w-full bx-shimmer" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {stats?.recentDeployments?.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Rocket className="w-8 h-8 text-muted-foreground/20 mb-2" />
                      <p className="text-sm text-muted-foreground">No deployments yet</p>
                    </div>
                  )}
                  {stats?.recentDeployments?.map((dep: any) => (
                    <div
                      key={dep.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-background/40 border border-border/40 hover:border-primary/20 transition-colors"
                    >
                      <div>
                        <p className="font-semibold text-xs">{dep.botName}</p>
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          {new Date(dep.startedAt).toLocaleString()}
                        </p>
                      </div>
                      <StatusBadge status={dep.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* System logs */}
        <div
        >
          <Card className="border-border/60 bg-card/60 backdrop-blur-sm bx-card-glow h-full">
            <CardHeader className="pb-3 pt-5 px-5">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-semibold">System Logs</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {isLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full bx-shimmer" />)}
                </div>
              ) : (
                <div className="space-y-1.5 font-mono text-xs">
                  {stats?.recentLogs?.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Activity className="w-8 h-8 text-muted-foreground/20 mb-2" />
                      <p className="text-sm text-muted-foreground font-sans">No recent logs</p>
                    </div>
                  )}
                  {stats?.recentLogs?.map((log: any) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-background/40 transition-colors group"
                    >
                      <span className="text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground/60 transition-colors tabular-nums">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <span className={`shrink-0 font-bold ${
                        log.level === "error" ? "text-red-400" :
                        log.level === "warn"  ? "text-amber-400" :
                        log.level === "info"  ? "text-primary/70" : "text-muted-foreground"
                      }`}>
                        [{log.level}]
                      </span>
                      <span className="text-foreground/70 break-all">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
