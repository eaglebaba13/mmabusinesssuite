import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { formatINRCompact } from "@/lib/format";
import { format } from "date-fns";

export const Route = createFileRoute("/app/franchisees")({
  head: () => ({ meta: [{ title: "Franchisees — MMA Suite" }] }),
  component: FranchiseesPage,
});

function FranchiseesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ full_name: "", email: "", phone: "", investment_amount: "500000" });
  const [saving, setSaving] = React.useState(false);

  const { data: franchisees = [] } = useQuery({
    queryKey: ["franchisees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("franchisees").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = franchisees.filter((f) =>
    f.full_name.toLowerCase().includes(search.toLowerCase()) || (f.email ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("franchisees").insert({
        full_name: form.full_name,
        email: form.email || null,
        phone: form.phone || null,
        investment_amount: Number(form.investment_amount),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Franchisee onboarded");
      setOpen(false);
      setForm({ full_name: "", email: "", phone: "", investment_amount: "500000" });
      qc.invalidateQueries({ queryKey: ["franchisees"] });
    },
    onError: (e: any) => {
      console.error(e);
      toast.error("An error occurred. Please try again.");
    },
  });

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Franchise Network</p>
          <h1 className="mt-1 font-display text-3xl">Franchisees</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-[260px] bg-card/40 pl-9" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-gold text-background"><Plus className="mr-1 h-4 w-4" />Onboard</Button>
            </DialogTrigger>
            <DialogContent className="bg-card">
              <DialogHeader><DialogTitle className="font-display text-2xl">Onboard franchisee</DialogTitle></DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSaving(true);
                  create.mutate(undefined, { onSettled: () => setSaving(false) });
                }}
                className="space-y-3"
              >
                <div><Label>Full name *</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
                </div>
                <div><Label>Investment (₹)</Label><Input type="number" value={form.investment_amount} onChange={(e) => setForm({ ...form, investment_amount: e.target.value })} className="mt-1" /></div>
                <DialogFooter>
                  <Button type="submit" disabled={saving} className="bg-gradient-gold text-background">{saving ? "Saving…" : "Onboard"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((f) => (
          <Link
            key={f.id}
            to="/app/franchisees/$franchiseeId"
            params={{ franchiseeId: f.id }}
            className="rounded-2xl glass p-5 hover-gold-glow"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-gold shadow-gold">
                <Building2 className="h-5 w-5 text-background" />
              </div>
              <Badge variant="outline" className="border-gold/40 text-gold capitalize">{f.status}</Badge>
            </div>
            <h3 className="mt-4 font-display text-xl">{f.full_name}</h3>
            <p className="text-xs text-muted-foreground">{f.email ?? f.phone ?? "—"}</p>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Investment</div>
                <div className="font-display text-lg text-gradient-gold">{formatINRCompact(Number(f.investment_amount))}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Joined</div>
                <div className="text-sm">{format(new Date(f.joined_at), "MMM yyyy")}</div>
              </div>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl glass p-12 text-center text-muted-foreground">No franchisees yet.</div>
        )}
      </div>
    </div>
  );
}
