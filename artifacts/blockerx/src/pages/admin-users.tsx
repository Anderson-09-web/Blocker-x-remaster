import { useState } from "react";
import { useListUsers, useBanUser, useUnbanUser, useDeleteUser, useUpgradeUser, useDowngradeUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Search, ShieldOff, Shield, Trash2, ChevronUp, ChevronDown } from "lucide-react";

const OWNER_DISCORD_ID = "1237892993013387307";

const ACTION_LABELS: Record<string, string> = {
  ban: "banned",
  unban: "unbanned",
  delete: "deleted",
  upgrade: "upgraded to Blocker X",
  downgrade: "downgraded to Free",
};

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const { data: result, isLoading } = useListUsers({ search: search || undefined });
  const banUser = useBanUser();
  const unbanUser = useUnbanUser();
  const deleteUser = useDeleteUser();
  const upgradeUser = useUpgradeUser();
  const downgradeUser = useDowngradeUser();
  const qc = useQueryClient();
  const { toast } = useToast();

  const users = (result as any)?.users || [];
  const refresh = () => qc.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const handle = (action: string, userId: string, username: string) => {
    const fns: Record<string, any> = { ban: banUser, unban: unbanUser, delete: deleteUser, upgrade: upgradeUser, downgrade: downgradeUser };
    fns[action].mutate({ userId }, {
      onSuccess: () => {
        refresh();
        toast({ title: `${username} ${ACTION_LABELS[action] || action}` });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || err?.message || `Failed to ${action}`;
        toast({ title: msg, variant: "destructive" });
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-1">{(result as any)?.total ?? 0} total users</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by username or Discord ID..." className="pl-10" />
      </div>

      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-14 w-full"/>)}</div>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">No users found.</p>
          ) : (
            <div className="divide-y divide-border/30 overflow-x-auto">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-6 py-2 text-xs font-medium text-muted-foreground">
                <span>User</span><span>Plan</span><span>Status</span><span>Actions</span>
              </div>
              {users.map((u: any) => {
                const isOwner = u.discordId === OWNER_DISCORD_ID;
                return (
                  <div key={u.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-6 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{u.username}</p>
                        {isOwner && <span className="text-xs px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20">Owner</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{u.discordId}</p>
                      <p className="text-xs text-muted-foreground">Joined {new Date(u.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      u.plan === "blockerx" ? "bg-amber-500/15 text-amber-400 border-amber-500/20" :
                      u.plan === "plus" ? "bg-blue-500/15 text-blue-400 border-blue-500/20" :
                      "bg-gray-500/15 text-gray-400 border-gray-500/20"
                    }`}>
                      {u.plan === "blockerx" ? "Blocker X" : u.plan === "plus" ? "Plus" : "Free"}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${u.isBanned ? "bg-red-500/15 text-red-400 border-red-500/20" : "bg-green-500/15 text-green-400 border-green-500/20"}`}>
                      {u.isBanned ? "Banned" : "Active"}
                    </span>
                    <div className="flex items-center gap-1">
                      {u.isBanned ? (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-400 hover:bg-green-500/10" title="Unban" onClick={() => handle("unban", u.id, u.username)}>
                          <Shield className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-yellow-400 hover:bg-yellow-500/10" title="Ban" disabled={isOwner} onClick={() => handle("ban", u.id, u.username)}>
                          <ShieldOff className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {u.plan === "free" ? (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-400 hover:bg-amber-500/10" title="Upgrade to Blocker X" onClick={() => handle("upgrade", u.id, u.username)}>
                          <ChevronUp className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:bg-gray-500/10" title="Downgrade to Free" onClick={() => handle("downgrade", u.id, u.username)}>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" title="Delete" disabled={isOwner} onClick={() => handle("delete", u.id, u.username)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
