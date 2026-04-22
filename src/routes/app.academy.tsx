import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { GraduationCap, BookOpen, Users2, CalendarDays, Wallet, Award, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/academy")({
  head: () => ({ meta: [{ title: "Academy — MMA Suite" }] }),
  component: AcademyLayout,
});

const TABS = [
  { to: "/app/academy" as const, label: "Overview", icon: GraduationCap, exact: true },
  { to: "/app/academy/courses" as const, label: "Courses", icon: BookOpen },
  { to: "/app/academy/batches" as const, label: "Batches", icon: CalendarDays },
  { to: "/app/academy/students" as const, label: "Students", icon: Users2 },
  { to: "/app/academy/trainers" as const, label: "Trainers", icon: UserCog },
  { to: "/app/academy/fees" as const, label: "Fees", icon: Wallet },
  { to: "/app/academy/certificates" as const, label: "Certificates", icon: Award },
];

function AcademyLayout() {
  const loc = useLocation();
  return (
    <div className="flex flex-col">
      <div className="border-b border-border/50 bg-card/30 backdrop-blur">
        <div className="px-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-gold shadow-gold">
              <GraduationCap className="h-5 w-5 text-background" />
            </div>
            <div>
              <h1 className="font-display text-2xl text-gradient-gold">Academy</h1>
              <p className="text-xs text-muted-foreground">Courses · Batches · Students · Fees · Certificates</p>
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
