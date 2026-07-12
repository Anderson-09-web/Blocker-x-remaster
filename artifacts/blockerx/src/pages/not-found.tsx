import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
      <p className="text-7xl font-bold text-primary/20">404</p>
      <h1 className="text-2xl font-bold">Page Not Found</h1>
      <p className="text-muted-foreground text-sm max-w-xs">The page you're looking for doesn't exist or has been moved.</p>
      <Link href="/dashboard">
        <Button variant="outline">Go to Dashboard</Button>
      </Link>
    </div>
  );
}
