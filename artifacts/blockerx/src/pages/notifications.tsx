import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCheck } from "lucide-react";

function typeStyle(type: string) {
  const map: Record<string, string> = {
    success: "bg-green-500/15 text-green-400 border-green-500/20",
    error: "bg-red-500/15 text-red-400 border-red-500/20",
    warning: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    announcement: "bg-purple-500/15 text-purple-400 border-purple-500/20",
    info: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  };
  return map[type] || map.info;
}

export default function NotificationsPage() {
  const { data: notifs, isLoading } = useListNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const qc = useQueryClient();

  const refresh = () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });

  const unreadCount = (notifs as any[])?.filter((n: any) => !n.isRead).length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground mt-1">{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAll.mutate(undefined, { onSuccess: refresh })} data-testid="button-mark-all-read">
            <CheckCheck className="w-4 h-4 mr-2" /> Mark all read
          </Button>
        )}
      </div>

      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">{[1,2,3].map(i=><Skeleton key={i} className="h-16 w-full"/>)}</div>
          ) : (notifs as any[])?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Bell className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No notifications yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {(notifs as any[])?.map((n: any) => (
                <div key={n.id} className={`flex items-start gap-4 px-6 py-4 transition-colors ${!n.isRead ? "bg-primary/5" : "hover:bg-accent/10"}`} data-testid={`row-notif-${n.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${typeStyle(n.type)}`}>{n.type}</span>
                      {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
                    </div>
                    <p className="font-medium text-sm">{n.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                  {!n.isRead && (
                    <Button size="sm" variant="ghost" className="text-xs shrink-0" onClick={() => markRead.mutate({ notificationId: n.id }, { onSuccess: refresh })} data-testid={`button-read-${n.id}`}>
                      Mark read
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
