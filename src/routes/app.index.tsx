import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/")({
  component: AppIndex,
});

function AppIndex() {
  const { loading, hasRole, isAdmin, hasAnyRole } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (loading) return;
    // Franchisees → their own dashboard. Anyone else → master dashboard if they
    // have any "office" role; trainer-only → trainer portal.
    if (hasRole("state_franchisee") && !isAdmin) {
      navigate({ to: "/app/my-state", replace: true });
      return;
    }
    if (hasRole("franchisee") && !isAdmin) {
      navigate({ to: "/app/my-franchise", replace: true });
      return;
    }
    if (hasRole("trainer") && !isAdmin && !hasAnyRole(["sales", "accounts", "academy_admin", "inventory", "hr", "webinar", "package_sales"])) {
      navigate({ to: "/app/trainer", replace: true });
      return;
    }
    navigate({ to: "/app/dashboard", replace: true });
  }, [loading, hasRole, isAdmin, hasAnyRole, navigate]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="font-display text-xl text-muted-foreground">Loading…</div>
    </div>
  );
}
