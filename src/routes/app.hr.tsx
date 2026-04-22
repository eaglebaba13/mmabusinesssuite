import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { UserCog, Users, CalendarCheck, Plane, Banknote, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/hr")({
  head: () => ({ meta: [{ title: "HR — MMA Suite" }] }),
  component: HrLayout,
});

const TABS = [
  { to: "/app/hr" as const, label: "Overview", icon: BarChart3, exact: true },
  { to: "/app/hr/employees" as const, label: "Employees", icon: Users },
  { to: "/app/hr/attendance" as const, label: "Attendance", icon: CalendarCheck },
  { to: "/app/hr/leave" as const, label: "Leave", icon: Plane },
  { to: "/app/hr/payroll" as const, label: "Payroll", icon: Banknote },
];

function HrLayout() {
  const loc = useLocation();
  return (
    <div className="flex flex-col">
      <div className="border-b border-border/50 bg-card/30 backdrop-blur">
        <div className="px-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-gold shadow-gold">
              <UserCog className="h-5 w-5 text-background" />
            </div>
            <div>
              <h1 className="font-display text-2xl text-gradient-gold">Human Resources</h1>
              <p className="text-xs text-muted-foreground">Employees · Attendance · Leave · Payroll</p>
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
                    active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
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
