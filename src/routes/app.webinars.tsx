import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Megaphone, ListVideo, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/webinars")({
  head: () => ({ meta: [{ title: "Webinars — MMA Suite" }] }),
  component: WebinarsLayout,
});

const TABS = [
  { to: "/app/webinars" as const, label: "Campaigns", icon: ListVideo, exact: true },
  { to: "/app/webinars/analytics" as const, label: "Analytics", icon: BarChart3 },
];

function WebinarsLayout() {
  const loc = useLocation();
  return (
    <div className="flex flex-col">
      <div className="border-b border-border/50 bg-card/30 backdrop-blur">
        <div className="px-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-gold shadow-gold">
              <Megaphone className="h-5 w-5 text-background" />
            </div>
            <div>
              <h1 className="font-display text-2xl text-gradient-gold">Webinar Funnels</h1>
              <p className="text-xs text-muted-foreground">Campaigns · Registrations · Attendance · Lead attribution</p>
            </div>
          </div>
          <nav className="mt-5 flex gap-1 overflow-x-auto pb-px">
            {TABS.map((t) => {
              const active = t.exact ? loc.pathname === t.to : loc.pathname.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <div className="p-6">
        <Outlet />
      </div>
    </div>
  );
}
