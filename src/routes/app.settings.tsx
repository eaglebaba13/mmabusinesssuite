import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [{ title: "Settings — MMA Suite" }] }),
  component: SettingsLayout,
});

function SettingsLayout() {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const path = location.pathname.replace(/\/$/, "");

  const tabs = [
    { to: "/app/settings", label: "Profile & Workspace", match: (p: string) => p === "/app/settings" },
    ...(isAdmin
      ? [{ to: "/app/settings/team", label: "Team & Roles", match: (p: string) => p === "/app/settings/team" }]
      : []),
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-gold">Settings</p>
        <h1 className="mt-1 font-display text-3xl">Manage your account</h1>
      </div>

      <div className="flex gap-1 border-b border-border/50">
        {tabs.map((t) => {
          const active = t.match(path);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "relative px-4 py-2.5 text-sm font-medium transition-colors",
                active ? "text-gold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {active && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-gradient-gold" />}
            </Link>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
