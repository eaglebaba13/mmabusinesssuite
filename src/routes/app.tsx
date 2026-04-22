import * as React from "react";
import { createFileRoute, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/AppSidebar";
import { TopBar } from "@/components/app/TopBar";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();

  React.useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [loading, isAuthenticated, navigate, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="font-display text-2xl text-gradient-gold">Loading…</div>
      </div>
    );
  }
  if (!isAuthenticated) return null;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-x-hidden">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
