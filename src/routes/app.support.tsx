import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { usePersistedState } from "@/hooks/use-persisted-state";

export const Route = createFileRoute("/app/support")({
  head: () => ({ meta: [{ title: "Support — MMA Suite" }] }),
  component: SupportPage,
});

function SupportPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const emptyTicket = { subject: "", description: "", priority: "medium" };
  const [form, setForm, clearFormDraft] = usePersistedState("support.new", emptyTicket);

  const { data: tickets = [] } = useQuery({
    queryKey: ["tickets"],
    queryFn: async () => {
      const { data } = await supabase.from("tickets").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tickets").insert({
        created_by: user!.id,
        subject: form.subject,
        description: form.description,
        priority: form.priority as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket created");
      setOpen(false);
      setForm(emptyTicket);
      clearFormDraft();
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (e: any) => {
      console.error(e);
      toast.error("An error occurred. Please try again.");
    },
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Support</p>
          <h1 className="mt-1 font-display text-3xl">Tickets</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-gold text-background"><Plus className="mr-1 h-4 w-4" />New ticket</Button>
          </DialogTrigger>
          <DialogContent className="bg-card">
            <DialogHeader><DialogTitle className="font-display text-2xl">Open a ticket</DialogTitle></DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
              className="space-y-3"
            >
              <div><Label>Subject *</Label><Input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="mt-1" /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" /></div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter><Button type="submit" className="bg-gradient-gold text-background">Create</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl glass">
        {tickets.length === 0 ? (
          <p className="p-12 text-center text-muted-foreground">No tickets.</p>
        ) : (
          tickets.map((t) => (
            <div key={t.id} className="flex items-center justify-between border-b border-border/40 px-5 py-4 last:border-0">
              <div>
                <div className="text-sm font-semibold">{t.subject}</div>
                <div className="text-xs text-muted-foreground">{format(new Date(t.created_at), "MMM d, yyyy")}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{t.priority}</Badge>
                <Badge variant="outline" className="border-gold/40 text-gold capitalize">{t.status.replace("_", " ")}</Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
