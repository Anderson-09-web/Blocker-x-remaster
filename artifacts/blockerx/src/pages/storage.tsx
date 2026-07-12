import { useGetStorageStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HardDrive } from "lucide-react";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function StoragePage() {
  const { data: stats, isLoading } = useGetStorageStats();

  const used = (stats as any)?.usedBytes || 0;
  const limit = (stats as any)?.limitBytes || 512 * 1024 * 1024;
  const pct = Math.min((used / limit) * 100, 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Storage</h1>
        <p className="text-muted-foreground mt-1">Cloudflare R2 storage usage across your bots</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Used</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{formatBytes(used)}</div>}
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Limit</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{formatBytes(limit)}</div>}
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Files</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{(stats as any)?.fileCount || 0}</div>}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/60 border-border/40">
        <CardHeader><CardTitle className="text-sm">Storage Usage</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-muted-foreground">{formatBytes(used)} used</span>
            <span className="text-muted-foreground">{formatBytes(limit)} total</span>
          </div>
          <div className="h-3 bg-accent/30 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">{pct.toFixed(1)}% used</p>
        </CardContent>
      </Card>

      <Card className="bg-card/60 border-border/40">
        <CardHeader><CardTitle className="text-sm">Per-Bot Breakdown</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i=><Skeleton key={i} className="h-10 w-full"/>)}</div>
          ) : (stats as any)?.bots?.length === 0 ? (
            <div className="flex items-center justify-center py-8 gap-3">
              <HardDrive className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No bots have used storage yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {(stats as any)?.bots?.map((b: any) => (
                <div key={b.botId} className="py-3 flex items-center justify-between" data-testid={`row-storage-${b.botId}`}>
                  <span className="font-medium text-sm">{b.botName}</span>
                  <span className="text-sm text-muted-foreground">{formatBytes(b.usedBytes)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
