import { useGetProfile } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function ProfilePage() {
  const { data: profile, isLoading } = useGetProfile();
  const user = (profile as any)?.user;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1">Your account information</p>
      </div>

      <Card className="bg-card/60 border-border/40">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-4"><Skeleton className="h-16 w-16 rounded-full"/><Skeleton className="h-6 w-48"/><Skeleton className="h-4 w-32"/></div>
          ) : (
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary/20 bg-muted">
                {user?.avatar ? (
                  <img
                    src={`https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png?size=128`}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-primary">
                    {user?.username?.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <p className="text-xl font-bold" data-testid="text-username">{user?.username}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                    user?.plan === "blockerx" ? "bg-amber-500/15 text-amber-400 border-amber-500/20" :
                    user?.plan === "plus" ? "bg-blue-500/15 text-blue-400 border-blue-500/20" :
                    "bg-gray-500/15 text-gray-400 border-gray-500/20"
                  }`}>
                    {user?.plan === "blockerx" ? "Blocker X" : user?.plan === "plus" ? "Plus" : "Free"}
                  </span>
                  {user?.isAdmin && <span className="text-xs px-2 py-0.5 rounded-full border bg-purple-500/15 text-purple-400 border-purple-500/20">Admin</span>}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">Discord ID: {user?.discordId}</p>
                {user?.email && <p className="text-sm text-muted-foreground">{user.email}</p>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: "Total Bots", value: (profile as any)?.botCount ?? "-" },
          { label: "Deployments", value: (profile as any)?.deploymentCount ?? "-" },
          { label: "AI Requests", value: (profile as any)?.aiUsageCount ?? "-" },
          { label: "Storage Used", value: formatBytes((profile as any)?.storageUsedBytes || 0) },
        ].map(({ label, value }) => (
          <Card key={label} className="bg-card/60 border-border/40">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {isLoading ? <Skeleton className="h-7 w-16" /> : <p className="text-2xl font-bold" data-testid={`stat-${label.toLowerCase().replace(/ /g,"-")}`}>{value}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/60 border-border/40">
        <CardHeader><CardTitle className="text-sm">Account Details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "Member since", value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-" },
            { label: "Last login", value: user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : "-" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              {isLoading ? <Skeleton className="h-4 w-24" /> : <span className="font-medium" data-testid={`text-${label.toLowerCase().replace(/ /g, "-")}`}>{value}</span>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
