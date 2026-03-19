import { Compass, Home, LifeBuoy } from "lucide-react";
import { Link } from "wouter";

import { EmptyState } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";

export default function NotFound() {
  const { user } = useAuth();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-0 top-12 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-chart-2/10 blur-3xl" />
      </div>

      <Card className="relative w-full max-w-2xl border-border/70 bg-card/92 p-6 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.8)] sm:p-8">
        <EmptyState
          title="That page does not exist"
          description="The route is not available right now. You can head back to a stable workspace area and keep going without losing context."
          icon={Compass}
          action={
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Link href={user ? "/dashboard" : "/login"}>
                <Button className="rounded-full">
                  <Home className="mr-2 h-4 w-4" />
                  {user ? "Go to dashboard" : "Go to login"}
                </Button>
              </Link>
              {user ? (
                <Link href="/docs">
                  <Button variant="outline" className="rounded-full">
                    <LifeBuoy className="mr-2 h-4 w-4" />
                    Open documentation
                  </Button>
                </Link>
              ) : null}
            </div>
          }
        />
      </Card>
    </div>
  );
}
