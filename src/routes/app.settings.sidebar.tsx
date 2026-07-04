import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SIDEBAR_SECTIONS, useSidebarHidden } from "@/lib/sidebar-visibility";

export const Route = createFileRoute("/app/settings/sidebar")({
  head: () => ({ meta: [{ title: "Sidebar Sections — Settings" }] }),
  component: SidebarSettings,
});

function SidebarSettings() {
  const { hidden, toggle, reset } = useSidebarHidden();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Sidebar Sections</CardTitle>
          <CardDescription>
            Show or hide groups in the left navigation panel. Only affects this browser.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          Reset to defaults
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {SIDEBAR_SECTIONS.map((s) => {
          const visible = !hidden.has(s.key);
          return (
            <div
              key={s.key}
              className="flex items-center justify-between gap-4 rounded-lg border border-border/50 p-4"
            >
              <div className="min-w-0">
                <div className="font-medium">{s.label}</div>
                <div className="text-xs text-muted-foreground">{s.description}</div>
              </div>
              <Switch checked={visible} onCheckedChange={(v) => toggle(s.key, v)} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
