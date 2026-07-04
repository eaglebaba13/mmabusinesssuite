import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Shield, ShieldAlert, MoreVertical, Power, PowerOff, Trash2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/app/settings/team")({
  component: TeamRolesPage,
});

const ALL_ROLES: AppRole[] = [
  "super_admin", "founder", "franchisee", "state_franchisee", "sales", "accounts", "inventory",
  "academy_admin", "webinar", "hr", "white_label", "trainer", "support", "package_sales", "nail_emporium",
];

// Roles visible in the UI (super_admin is hidden from selection & filters)
const VISIBLE_ROLES: AppRole[] = ALL_ROLES.filter((r) => r !== "super_admin");

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  founder: "Admin",
  franchisee: "Franchisee",
  state_franchisee: "State Franchise",
  sales: "Sales",
  accounts: "Accounts",
  inventory: "Inventory",
  academy_admin: "Academy Admin",
  webinar: "Webinar",
  hr: "HR",
  white_label: "White Label",
  trainer: "Trainer",
  support: "Support",
  package_sales: "Package Sales",
  nail_emporium: "Nail Emporium",
};

const PRIVILEGED: AppRole[] = ["super_admin", "founder"];

interface ManagedUser {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  is_active: boolean;
  roles: AppRole[];
}

function TeamRolesPage() {
  const { isAdmin, user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<ManagedUser | null>(null);
  const [draftRoles, setDraftRoles] = React.useState<Set<AppRole>>(new Set());
  const [confirmPrivileged, setConfirmPrivileged] = React.useState<AppRole | null>(null);

  React.useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/app/settings" });
  }, [loading, isAdmin, navigate]);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users" as any);
      if (error) throw error;
      return (data ?? []) as ManagedUser[];
    },
  });

  const grant = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("admin_grant_role" as any, { _user_id: userId, _role: role });
      if (error) throw error;
    },
  });

  const revoke = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("admin_revoke_role" as any, { _user_id: userId, _role: role });
      if (error) throw error;
    },
  });

  const setActive = useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      const { error } = await supabase.rpc("admin_set_user_active" as any, { _user_id: userId, _active: active });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.active ? "User activated" : "User deactivated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to update status"),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_delete_user" as any, { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setSelected(null);
      setConfirmDelete(null);
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete user"),
  });

  const [confirmDelete, setConfirmDelete] = React.useState<ManagedUser | null>(null);

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      if (roleFilter !== "all" && !u.roles.includes(roleFilter as AppRole)) return false;
      if (!q) return true;
      return (
        (u.full_name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  const openSheet = (u: ManagedUser) => {
    setSelected(u);
    setDraftRoles(new Set(u.roles));
  };

  const toggleDraft = (role: AppRole, checked: boolean) => {
    if (checked && PRIVILEGED.includes(role) && !draftRoles.has(role)) {
      setConfirmPrivileged(role);
      return;
    }
    const next = new Set(draftRoles);
    if (checked) next.add(role);
    else next.delete(role);
    setDraftRoles(next);
  };

  const confirmGrantPrivileged = () => {
    if (!confirmPrivileged) return;
    const next = new Set(draftRoles);
    next.add(confirmPrivileged);
    setDraftRoles(next);
    setConfirmPrivileged(null);
  };

  const saveRoles = async () => {
    if (!selected) return;
    const current = new Set(selected.roles);
    const target = draftRoles;
    const toAdd: AppRole[] = [...target].filter((r) => !current.has(r));
    const toRemove: AppRole[] = [...current].filter((r) => !target.has(r));

    try {
      for (const r of toAdd) {
        await grant.mutateAsync({ userId: selected.id, role: r });
      }
      for (const r of toRemove) {
        await revoke.mutateAsync({ userId: selected.id, role: r });
      }
      toast.success(`Roles updated for ${selected.full_name || selected.email}`);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setSelected(null);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message?.includes("Cannot revoke your own") ? e.message : "Failed to update roles");
    }
  };

  const isSelf = selected?.id === user?.id;

  if (loading) return null;
  if (!isAdmin) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl glass p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl">Team & Roles</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Grant or revoke access for any team member. Changes apply on their next page load.
            </p>
          </div>
          <Badge variant="outline" className="border-gold/40 text-gold">
            {users.length} {users.length === 1 ? "user" : "users"}
          </Badge>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="sm:w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {VISIBLE_ROLES.map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-2xl glass overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading users…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No users match your filters.</div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((u) => {
              const initials = (u.full_name || u.email || "?")
                .split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
              const isPrivileged = u.roles.some((r) => PRIVILEGED.includes(r));
              const isSelfRow = u.id === user?.id;
              return (
                <div
                  key={u.id}
                  className="flex w-full items-center gap-4 p-4 transition-colors hover:bg-foreground/5"
                >
                  <button
                    onClick={() => openSheet(u)}
                    className="flex flex-1 items-center gap-4 text-left min-w-0"
                  >
                    <Avatar className="h-10 w-10 border border-gold/30">
                      <AvatarFallback className="bg-background text-xs text-gold">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`truncate font-medium ${u.is_active ? "" : "text-muted-foreground line-through"}`}>
                          {u.full_name || "Unnamed"}
                        </p>
                        {isSelfRow && (
                          <Badge variant="outline" className="h-5 border-gold/40 px-1.5 text-[10px] text-gold">You</Badge>
                        )}
                        {!u.is_active && (
                          <Badge variant="outline" className="h-5 border-destructive/50 px-1.5 text-[10px] text-destructive">Inactive</Badge>
                        )}
                        {isPrivileged && <Shield className="h-3.5 w-3.5 text-gold" />}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <div className="hidden flex-wrap items-center justify-end gap-1 sm:flex sm:max-w-[40%]">
                      {(() => {
                        const visible = u.roles.filter((r) => r !== "super_admin");
                        const hasHidden = u.roles.length > visible.length;
                        if (visible.length === 0) {
                          return (
                            <Badge variant="outline" className="text-muted-foreground">
                              {hasHidden ? "Admin (system)" : "No roles"}
                            </Badge>
                          );
                        }
                        return visible.map((r) => (
                          <Badge
                            key={r}
                            variant={PRIVILEGED.includes(r) ? "default" : "secondary"}
                            className={PRIVILEGED.includes(r) ? "bg-gradient-gold text-background" : ""}
                          >
                            {ROLE_LABELS[r]}
                          </Badge>
                        ));
                      })()}
                    </div>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openSheet(u)}>Manage roles</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {u.is_active ? (
                        <DropdownMenuItem
                          disabled={isSelfRow || setActive.isPending}
                          onClick={() => setActive.mutate({ userId: u.id, active: false })}
                        >
                          <PowerOff className="mr-2 h-4 w-4" /> Deactivate
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          disabled={setActive.isPending}
                          onClick={() => setActive.mutate({ userId: u.id, active: true })}
                        >
                          <Power className="mr-2 h-4 w-4" /> Activate
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        disabled={isSelfRow}
                        onClick={() => setConfirmDelete(u)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete user
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.full_name || "Unnamed user"}</SheetTitle>
                <SheetDescription>{selected.email}</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Roles</Label>
                  <div className="mt-3 space-y-2">
                    {VISIBLE_ROLES.map((role) => {
                      const checked = draftRoles.has(role);
                      const disableSelfSuper = isSelf && role === "super_admin" && checked;
                      return (
                        <label
                          key={role}
                          className="flex items-center gap-3 rounded-lg border border-border/50 p-3 transition-colors hover:border-gold/40"
                        >
                          <Checkbox
                            checked={checked}
                            disabled={disableSelfSuper}
                            onCheckedChange={(v) => toggleDraft(role, !!v)}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{ROLE_LABELS[role]}</span>
                              {PRIVILEGED.includes(role) && (
                                <ShieldAlert className="h-3.5 w-3.5 text-gold" />
                              )}
                            </div>
                            {disableSelfSuper && (
                              <p className="text-xs text-muted-foreground">You can't revoke your own super admin.</p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <SheetFooter className="mt-6 flex-row gap-2">
                <Button variant="outline" onClick={() => setSelected(null)} className="flex-1">Cancel</Button>
                <Button
                  onClick={saveRoles}
                  disabled={grant.isPending || revoke.isPending}
                  className="flex-1 bg-gradient-gold text-background"
                >
                  {grant.isPending || revoke.isPending ? "Saving…" : "Save changes"}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirmPrivileged} onOpenChange={(o) => !o && setConfirmPrivileged(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Grant {confirmPrivileged && ROLE_LABELS[confirmPrivileged]}?</AlertDialogTitle>
            <AlertDialogDescription>
              This is a privileged role with full access to manage users, billing, and all modules.
              Only grant it to people you fully trust.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmGrantPrivileged} className="bg-gradient-gold text-background">
              Yes, grant it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.full_name || confirmDelete?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the user account, their sign-in access, and all role assignments.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteUser.mutate(confirmDelete.id)}
              disabled={deleteUser.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUser.isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
