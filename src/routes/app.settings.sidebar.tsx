import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SIDEBAR_SECTIONS, useSidebarHidden, itemKey } from "@/lib/sidebar-visibility";

export const Route = createFileRoute("/app/settings/sidebar")({
  head: () => ({ meta: [{ title: "Sidebar Sections — Settings" }] }),
  component: SidebarSettings,
});

function SidebarSettings() {
  const { hidden, toggle, reset, isSectionVisible, isItemVisible } = useSidebarHidden();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Sidebar Sections</CardTitle>
          <CardDescription>
            Show or hide groups and individual items in the left navigation. Only affects this browser.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          Reset to defaults
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {SIDEBAR_SECTIONS.map((s) => {
          const sectionOn = isSectionVisible(s.key);
          return (
            <div key={s.key} className="rounded-lg border border-border/50">
              <div className="flex items-center justify-between gap-4 border-b border-border/40 p-4">
                <div className="min-w-0">
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.description}</div>
                </div>
                <Switch checked={sectionOn} onCheckedChange={(v) => toggle(s.key, v)} />
              </div>
              <div className={sectionOn ? "" : "opacity-50"}>
                {s.items.map((it) => {
                  const on = isItemVisible(it.id);
                  return (
                    <div
                      key={it.id}
                      className="flex items-center justify-between gap-4 border-b border-border/30 px-4 py-2.5 pl-8 last:border-b-0"
                    >
                      <div className="min-w-0 text-sm">{it.label}</div>
                      <Switch
                        checked={on}
                        disabled={!sectionOn}
                        onCheckedChange={(v) => toggle(itemKey(it.id), v)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {hidden.size > 0 && (
          <p className="text-xs text-muted-foreground">
            {hidden.size} hidden entr{hidden.size === 1 ? "y" : "ies"}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
