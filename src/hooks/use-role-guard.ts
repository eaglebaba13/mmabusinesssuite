import * as React from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

/**
 * Pure-franchisees (no admin role) should never see admin sections like the
 * Master Dashboard, Leads, Franchisees roster, Finance, HR, Settings admin tabs.
 * This hook redirects them back to /app/my-franchise if they land on one.
 */
export function useBlockFranchiseeRoute() {
  const { loading, hasRole, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    if (loading) return;
    if (hasRole("franchisee") && !isAdmin) {
      navigate({ to: "/app/my-franchise", replace: true });
    }
    // location.pathname dep ensures redirect fires on client-side nav too
  }, [loading, hasRole, isAdmin, navigate, location.pathname]);
}
