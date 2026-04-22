import * as React from "react";
import { createFileRoute, Outlet, useNavigate, useRouter, useLocation } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/AppSidebar";
import { TopBar } from "@/components/app/TopBar";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

// Routes a pure franchisee (no admin role) is NOT allowed to visit.
const FRANCHISEE_BLOCKED = [
  "/app/dashboard",
  "/app/leads",
  "/app/franchisees",
  "/app/finance",
  "/app/hr",
  "/app/academy",
  "/app/inventory",
  "/app/webinars",
  "/app/pos",
  "/app/settings",
  "/app/trainer",
];

function AppLayout() {
  const { isAuthenticated, loading, hasRole, isAdmin } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();

  React.useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [loading, isAuthenticated, navigate, router]);

  // Block franchisee-only users from admin routes
  React.useEffect(() => {
    if (loading || !isAuthenticated) return;
    if (hasRole("franchisee") && !isAdmin) {
      const blocked = FRANCHISEE_BLOCKED.some(
        (p) => location.pathname === p || location.pathname.startsWith(p + "/"),
      );
      if (blocked) {
        navigate({ to: "/app/my-franchise", replace: true });
      }
    }
  }, [loading, isAuthenticated, hasRole, isAdmin, location.pathname, navigate]);

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
