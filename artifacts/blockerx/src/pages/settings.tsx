import { useGetProfile } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { data: profile, isLoading } = useGetProfile();
  const user = (profile as any)?.user;
  const { toast } = useToast();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account preferences</p>
      </div>

      <Card className="bg-card/60 border-border/40">
        <CardHeader><CardTitle className="text-sm">Account Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">{[1,2].map(i=><Skeleton key={i} className="h-10 w-full"/>)}</div>
          ) : (
            <>
              <div>
                <Label htmlFor="settings-username">Username</Label>
                <Input id="settings-username" defaultValue={user?.username} className="mt-1" disabled data-testid="input-username" />
                <p className="text-xs text-muted-foreground mt-1">Username is synced from Discord and cannot be changed here.</p>
              </div>
              <div>
                <Label htmlFor="settings-email">Email</Label>
                <Input id="settings-email" defaultValue={user?.email || ""} className="mt-1" disabled data-testid="input-email" />
                <p className="text-xs text-muted-foreground mt-1">Email is synced from your Discord account.</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/60 border-border/40">
        <CardHeader><CardTitle className="text-sm">Danger Zone</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-destructive/5">
            <div>
              <p className="font-medium text-sm text-destructive">Delete Account</p>
              <p className="text-xs text-muted-foreground mt-0.5">Permanently delete your account and all associated data.</p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => toast({ title: "Contact support to delete your account.", variant: "destructive" })} data-testid="button-delete-account">
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
