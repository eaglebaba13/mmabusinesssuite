import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";

export const Route = createFileRoute("/app/dashboards")({
  head: () => ({ meta: [{ title: "Entity Dashboards — MMA Suite" }] }),
  component: DashboardsLayout,
});

function DashboardsLayout() {
  const loc = useLocation();
  const tabs = [
    { to: "/app/dashboards/academy", label: "Academy" },
    { to: "/app/dashboards/dark-store", label: "Dark Store" },
    { to: "/app/dashboards/salon", label: "Salon Branches" },
  ] as const;
  return (
    <div className="space-y-4 p-4 md:p-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-gold">Operations</p>
        <h1 className="font-display text-3xl">Entity Dashboards</h1>
        <p className="mt-1 text-sm text-muted-foreground">Per-unit revenue, performance, and linked franchise summary.</p>
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-border">
        {tabs.map((t) => {
          const active = loc.pathname.startsWith(t.to);
          return (
            <Link key={t.to} to={t.to} className={`rounded-t-md px-4 py-2 text-sm transition-colors ${active ? "bg-gradient-gold text-background font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
