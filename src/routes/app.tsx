import * as React from "react";
import { createFileRoute, Outlet, useNavigate, useRouter, useLocation } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/AppSidebar";
import { TopBar } from "@/components/app/TopBar";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

const FRANCHISEE_BLOCKED = [
  "/app/dashboard", "/app/leads", "/app/franchisees", "/app/state-franchises",
  "/app/finance", "/app/billing", "/app/payouts", "/app/accounts", "/app/reports",
  "/app/dashboards", "/app/audit-logs", "/app/impersonation-sessions", "/app/hr", "/app/academy", "/app/inventory",
  "/app/webinars", "/app/pos", "/app/settings", "/app/trainer",
];
const ADMIN_ONLY = ["/app/audit-logs", "/app/impersonation-sessions", "/app/state-franchises", "/app/settings", "/app/dashboard", "/app/leads", "/app/franchisees"];
const ACCOUNTS_OR_ADMIN = ["/app/billing", "/app/finance", "/app/payouts", "/app/accounts", "/app/reports", "/app/dashboards"];

function AppLayout() {
  const { isAuthenticated, loading, hasRole, hasAnyRole, isAdmin } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();

  React.useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [loading, isAuthenticated, navigate, router]);

  // Role-based route gating
  React.useEffect(() => {
    if (loading || !isAuthenticated) return;
    const path = location.pathname;
    const matches = (list: string[]) =>
      list.some((p) => path === p || path.startsWith(p + "/"));

    // Pure franchisee → only my-franchise
    if (hasRole("franchisee") && !isAdmin && !hasRole("state_franchisee")) {
      if (matches(FRANCHISEE_BLOCKED)) {
        navigate({ to: "/app/my-franchise", replace: true });
        return;
      }
    }
    // State franchisee (no admin) → only my-state
    if (hasRole("state_franchisee") && !isAdmin) {
      const allowed = ["/app/my-state", "/app/my-franchise"];
      if (!allowed.some((p) => path === p || path.startsWith(p + "/")) && path.startsWith("/app/")) {
        navigate({ to: "/app/my-state", replace: true });
        return;
      }
    }
    // Admin-only sections
    if (!isAdmin && matches(ADMIN_ONLY)) {
      navigate({ to: "/app", replace: true });
      return;
    }
    // Accounts or admin
    if (!isAdmin && !hasAnyRole(["accounts"]) && matches(ACCOUNTS_OR_ADMIN)) {
      navigate({ to: "/app", replace: true });
      return;
    }
  }, [loading, isAuthenticated, hasRole, hasAnyRole, isAdmin, location.pathname, navigate]);

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
