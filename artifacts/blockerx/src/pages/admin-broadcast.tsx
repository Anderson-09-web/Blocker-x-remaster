import { useState } from "react";
import { useBroadcastAnnouncement } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, Siren, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

async function fetchBanner() {
  const res = await fetch("/api/banner", { credentials: "include" });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.banner ?? null;
}

async function setBannerApi(payload: { type: string; title: string; message: string }) {
  const res = await fetch("/api/admin/banner", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to set banner");
  return res.json();
}

async function clearBannerApi() {
  const res = await fetch("/api/admin/banner", { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Failed to clear banner");
  return res.json();
}

export default function AdminBroadcastPage() {
  const broadcast = useBroadcastAnnouncement();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({ title: "", message: "", type: "announcement" });
  const [bannerForm, setBannerForm] = useState({ type: "maintenance", title: "", message: "" });

  const { data: activeBanner } = useQuery({
    queryKey: ["global-banner"],
    queryFn: fetchBanner,
    refetchInterval: 15_000,
  });

  const setBannerMutation = useMutation({
    mutationFn: setBannerApi,
    onSuccess: () => {
      toast({ title: "Banner activado" });
      qc.invalidateQueries({ queryKey: ["global-banner"] });
      setBannerForm({ type: "maintenance", title: "", message: "" });
    },
    onError: () => toast({ title: "Error al activar el banner", variant: "destructive" }),
  });

  const clearBannerMutation = useMutation({
    mutationFn: clearBannerApi,
    onSuccess: () => {
      toast({ title: "Banner eliminado" });
      qc.invalidateQueries({ queryKey: ["global-banner"] });
    },
    onError: () => toast({ title: "Error al eliminar el banner", variant: "destructive" }),
  });

  const handleSend = () => {
    if (!form.title || !form.message) return;
    broadcast.mutate({ data: { title: form.title, message: form.message, type: form.type } as any }, {
      onSuccess: (data: any) => {
        toast({ title: data.message || "Announcement sent" });
        setForm({ title: "", message: "", type: "announcement" });
      },
      onError: () => toast({ title: "Failed to send announcement", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Broadcast</h1>
        <p className="text-muted-foreground mt-1">Send announcements and manage the global dashboard banner</p>
      </div>

      {/* Global Banner */}
      <Card className="bg-card/60 border-border/40">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Siren className="w-4 h-4 text-amber-400" /> Global Dashboard Banner
          </CardTitle>
          <CardDescription className="text-xs">
            Shows a small persistent bar at the top of every user's dashboard. Use for maintenance windows or critical errors.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeBanner && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-amber-950/40 border border-amber-500/30 text-sm">
              <div>
                <span className="font-semibold text-amber-300 capitalize">[{activeBanner.type}]</span>{" "}
                <span className="text-amber-100">{activeBanner.title}</span>
                <span className="text-amber-200/70 ml-2">— {activeBanner.message}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-amber-400 hover:text-red-400 hover:bg-red-950/30 ml-3"
                onClick={() => clearBannerMutation.mutate()}
                disabled={clearBannerMutation.isPending}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={bannerForm.type} onValueChange={v => setBannerForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance">🔧 Maintenance</SelectItem>
                  <SelectItem value="error">🔴 Error</SelectItem>
                  <SelectItem value="warning">⚠️ Warning</SelectItem>
                  <SelectItem value="info">ℹ️ Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input
                value={bannerForm.title}
                onChange={e => setBannerForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Maintenance scheduled..."
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label>Message</Label>
            <Input
              value={bannerForm.message}
              onChange={e => setBannerForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Brief details shown in the banner..."
              className="mt-1"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => setBannerMutation.mutate(bannerForm)}
              disabled={setBannerMutation.isPending || !bannerForm.title || !bannerForm.message}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              {setBannerMutation.isPending ? "Activating..." : activeBanner ? "Update Banner" : "Activate Banner"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Broadcast to all users */}
      <Card className="bg-card/60 border-border/40">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Megaphone className="w-4 h-4" /> Broadcast Notification
          </CardTitle>
          <CardDescription className="text-xs">
            Sends a notification to every registered user's inbox.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="bc-title">Title</Label>
            <Input id="bc-title" value={form.title} onChange={e => setForm(f=>({...f, title: e.target.value}))}
              placeholder="Platform maintenance scheduled..." className="mt-1" data-testid="input-broadcast-title" />
          </div>
          <div>
            <Label htmlFor="bc-message">Message</Label>
            <Textarea id="bc-message" value={form.message} onChange={e => setForm(f=>({...f, message: e.target.value}))}
              placeholder="Detailed announcement..." rows={4} className="mt-1 resize-none" data-testid="textarea-broadcast-message" />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger className="mt-1" data-testid="select-broadcast-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="announcement">Announcement</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="success">Success</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">Sends to all registered users.</p>
            <Button onClick={handleSend} disabled={broadcast.isPending || !form.title || !form.message} data-testid="button-send-broadcast">
              {broadcast.isPending ? "Sending..." : "Send Broadcast"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
