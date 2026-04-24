import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MoreVertical,
  ExternalLink,
  Pencil,
  Power,
  KeyRound,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth-context";
import { FranchiseeEditDialog } from "./FranchiseeEditDialog";

interface Props {
  franchisee: any;
}

export function FranchiseeActions({ franchisee }: Props) {
  const { isAdmin, hasRole } = useAuth();
  const canManage = isAdmin || hasRole("accounts");
  const canDelete = hasRole("super_admin");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const isInactive = franchisee.status === "suspended" || franchisee.status === "closed";

  const toggleStatus = useMutation({
    mutationFn: async () => {
      const next: "active" | "suspended" = isInactive ? "active" : "suspended";
      const { error } = await supabase
        .from("franchisees")
        .update({ status: next })
        .eq("id", franchisee.id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      toast.success(next === "active" ? "Franchisee activated" : "Franchisee deactivated");
      qc.invalidateQueries({ queryKey: ["franchisees"] });
      qc.invalidateQueries({ queryKey: ["franchisee", franchisee.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("franchisees").delete().eq("id", franchisee.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Franchisee deleted");
      qc.invalidateQueries({ queryKey: ["franchisees"] });
      setDeleteOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  if (!canManage) return null;

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      <div onClick={stop} onMouseDown={stop}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 hover:bg-card/80"
              onClick={stop}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onSelect={() => {
                const url = `/app/franchisees/${franchisee.id}?as_franchisee=1`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open dashboard
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => toggleStatus.mutate()}>
              <Power className="mr-2 h-3.5 w-3.5" />
              {isInactive ? "Activate" : "Deactivate"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <KeyRound className="mr-2 h-3.5 w-3.5" /> Reset password
            </DropdownMenuItem>
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-rose-400 focus:text-rose-400"
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <FranchiseeEditDialog
        franchisee={franchisee}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this franchisee?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {franchisee.full_name}'s record. Linked revenue, sales and payouts will be detached but not deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 hover:bg-rose-600"
              onClick={() => remove.mutate()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
