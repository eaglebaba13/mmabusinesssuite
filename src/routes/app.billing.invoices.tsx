import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { issueInvoice, cancelInvoice, reviseInvoice, createInvoice, updateInvoice } from "@/server/invoices.functions";
import { formatINR } from "@/lib/format";
import { toast } from "sonner";
import { Plus, FileText, Ban, RefreshCw, CheckCircle2, Pencil, X } from "lucide-react";

export const Route = createFileRoute("/app/billing/invoices")({
  head: () => ({ meta: [{ title: "Invoices — MMA Suite" }] }),
  component: InvoicesPage,
});

const DOC_TYPES = ["b2b_tax", "b2c", "proforma", "quotation", "receipt", "credit_note", "debit_note"] as const;
type DocType = typeof DOC_TYPES[number];
const STATUSES = ["draft", "issued", "revised", "cancelled"] as const;

type Item = { description: string; quantity: number; unit_price: number; discount_pct: number; gst_pct: number; is_student_product: boolean };

function InvoicesPage() {
  const qc = useQueryClient();
  const [docFilter, setDocFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [companyFilter, setCompanyFilter] = React.useState<string>("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const companies = useQuery({ queryKey: ["companies"], queryFn: async () => (await supabase.from("companies").select("id,name").order("name")).data });

  const invoicesQ = useQuery({
    queryKey: ["invoices", docFilter, statusFilter, companyFilter, from, to],
    queryFn: async () => {
      let q = supabase.from("invoices").select("*, companies!invoices_company_id_fkey(name)").order("invoice_date", { ascending: false }).limit(300);
      if (docFilter !== "all") q = q.eq("doc_type", docFilter as any);
      if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
      if (companyFilter !== "all") q = q.eq("company_id", companyFilter);
      if (from) q = q.gte("invoice_date", from);
      if (to) q = q.lte("invoice_date", to);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const issueFn = useServerFn(issueInvoice);
  const cancelFn = useServerFn(cancelInvoice);
  const reviseFn = useServerFn(reviseInvoice);

  const clearFilters = () => { setDocFilter("all"); setStatusFilter("all"); setCompanyFilter("all"); setFrom(""); setTo(""); };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold">Finance</p>
          <h1 className="font-display text-3xl">Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">Multi-company billing chain across HDK → MOS → Nail Emporium → downstream.</p>
        </div>
        <NewInvoiceDialog companies={companies.data ?? []} onCreated={() => qc.invalidateQueries({ queryKey: ["invoices"] })} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Filters</CardTitle>
          <Button size="sm" variant="ghost" onClick={clearFilters}><X className="mr-1 h-3.5 w-3.5" /> Reset</Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <div><Label className="text-xs">From date</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To date</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Document type</Label>
            <Select value={docFilter} onValueChange={setDocFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {DOC_TYPES.map((d) => <SelectItem key={d} value={d}>{d.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From Company</Label>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {(companies.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">All invoices ({invoicesQ.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Number</TableHead><TableHead>Type</TableHead><TableHead>From</TableHead><TableHead>Bill To</TableHead>
              <TableHead>Date</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {invoicesQ.data?.map((inv: any) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.invoice_number ?? <span className="text-muted-foreground">DRAFT</span>}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{inv.doc_type}</Badge></TableCell>
                  <TableCell className="text-xs">{inv.companies?.name}</TableCell>
                  <TableCell className="text-xs">{inv.bill_to_name ?? "—"}</TableCell>
                  <TableCell>{inv.invoice_date}</TableCell>
                  <TableCell>{formatINR(inv.grand_total)}</TableCell>
                  <TableCell>{formatINR(inv.amount_paid)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={inv.status === "issued" ? "default" : inv.status === "cancelled" ? "destructive" : "secondary"} className="w-fit text-xs">{inv.status}</Badge>
                      {inv.is_demo && <Badge variant="outline" className="w-fit text-[10px]">demo</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="sm" variant="ghost" title="View / Print">
                        <Link to="/app/billing/invoices/$invoiceId" params={{ invoiceId: inv.id }}><FileText className="h-3.5 w-3.5" /></Link>
                      </Button>
                      {inv.status === "draft" && (
                        <>
                          <EditDraftDialog invoiceId={inv.id} onSaved={() => qc.invalidateQueries({ queryKey: ["invoices"] })} />
                          <Button size="sm" variant="outline" title="Issue" onClick={async () => {
                            try { const r = await issueFn({ data: { id: inv.id } }); toast.success(`Issued as ${r.invoice_number}`); qc.invalidateQueries({ queryKey: ["invoices"] }); } catch (e) { toast.error((e as Error).message); }
                          }}><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                      {inv.status === "issued" && (
                        <>
                          <Button size="sm" variant="outline" title="Revise" onClick={async () => {
                            try { await reviseFn({ data: { id: inv.id } }); toast.success("Revision created (draft)"); qc.invalidateQueries({ queryKey: ["invoices"] }); } catch (e) { toast.error((e as Error).message); }
                          }}><RefreshCw className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" title="Cancel" onClick={async () => {
                            const reason = prompt("Cancellation reason?"); if (!reason) return;
                            try { await cancelFn({ data: { id: inv.id, reason } }); toast.success("Cancelled"); qc.invalidateQueries({ queryKey: ["invoices"] }); } catch (e) { toast.error((e as Error).message); }
                          }}><Ban className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {invoicesQ.data?.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No invoices</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Numbering Rules</CardTitle></CardHeader>
        <CardContent><NumberingRulesTable /></CardContent>
      </Card>
    </div>
  );
}

function emptyItem(): Item { return { description: "", quantity: 1, unit_price: 0, discount_pct: 0, gst_pct: 18, is_student_product: false }; }

function InvoiceForm({ companies, value, onChange }: {
  companies: { id: string; name: string }[];
  value: { companyId: string; docType: DocType; billToName: string; invoiceDate: string; notes: string; items: Item[] };
  onChange: (v: any) => void;
}) {
  const v = value;
  const set = (patch: any) => onChange({ ...v, ...patch });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>From Company</Label>
          <Select value={v.companyId} onValueChange={(x) => set({ companyId: x })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select></div>
        <div><Label>Document Type</Label>
          <Select value={v.docType} onValueChange={(x) => set({ docType: x as DocType })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{DOC_TYPES.map((d) => <SelectItem key={d} value={d}>{d.replace("_", " ")}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="col-span-2"><Label>Bill To (name)</Label><Input value={v.billToName} onChange={(e) => set({ billToName: e.target.value })} /></div>
        <div><Label>Invoice Date</Label><Input type="date" value={v.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} /></div>
      </div>
      <div className="space-y-2">
        <Label>Items</Label>
        {v.items.map((it, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <Input className="col-span-5" placeholder="Description" value={it.description} onChange={(e) => { const n = [...v.items]; n[i] = { ...n[i], description: e.target.value }; set({ items: n }); }} />
            <Input className="col-span-2" type="number" placeholder="Qty" value={it.quantity} onChange={(e) => { const n = [...v.items]; n[i] = { ...n[i], quantity: +e.target.value }; set({ items: n }); }} />
            <Input className="col-span-2" type="number" placeholder="Unit Price" value={it.unit_price} onChange={(e) => { const n = [...v.items]; n[i] = { ...n[i], unit_price: +e.target.value }; set({ items: n }); }} />
            <Input className="col-span-1" type="number" placeholder="Disc%" value={it.discount_pct} onChange={(e) => { const n = [...v.items]; n[i] = { ...n[i], discount_pct: +e.target.value }; set({ items: n }); }} />
            <Input className="col-span-1" type="number" placeholder="GST%" value={it.gst_pct} onChange={(e) => { const n = [...v.items]; n[i] = { ...n[i], gst_pct: +e.target.value }; set({ items: n }); }} />
            <Button className="col-span-1" size="sm" variant="ghost" onClick={() => set({ items: v.items.filter((_, j) => j !== i) })} disabled={v.items.length === 1}>×</Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => set({ items: [...v.items, emptyItem()] })}>+ Add line</Button>
      </div>
      <div><Label>Notes</Label><Textarea value={v.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
    </div>
  );
}

function NewInvoiceDialog({ companies, onCreated }: { companies: { id: string; name: string }[]; onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ companyId: "", docType: "b2b_tax" as DocType, billToName: "", invoiceDate: new Date().toISOString().slice(0, 10), notes: "", items: [emptyItem()] });
  const create = useServerFn(createInvoice);
  const submit = async (issue: boolean) => {
    try {
      await create({ data: { company_id: form.companyId, doc_type: form.docType, bill_to_name: form.billToName, invoice_date: form.invoiceDate, notes: form.notes, items: form.items, issue, is_demo: false } });
      toast.success(issue ? "Invoice issued" : "Draft saved");
      setOpen(false); onCreated();
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> New Invoice</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
        <InvoiceForm companies={companies} value={form} onChange={setForm} />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => submit(false)}>Save Draft</Button>
          <Button onClick={() => submit(true)}>Issue Invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDraftDialog({ invoiceId, onSaved }: { invoiceId: string; onSaved: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>(null);
  const companies = useQuery({ queryKey: ["companies"], queryFn: async () => (await supabase.from("companies").select("id,name").order("name")).data });
  const update = useServerFn(updateInvoice);
  const issue = useServerFn(issueInvoice);

  React.useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: inv }, { data: items }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", invoiceId).single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("created_at"),
      ]);
      if (!inv) return;
      setForm({
        companyId: inv.company_id, docType: inv.doc_type as DocType, billToName: inv.bill_to_name ?? "",
        invoiceDate: inv.invoice_date, notes: inv.notes ?? "",
        items: (items ?? []).map((it: any) => ({
          description: it.description, quantity: Number(it.quantity), unit_price: Number(it.unit_price),
          discount_pct: Number(it.discount_pct), gst_pct: Number(it.gst_pct), is_student_product: !!it.is_student_product,
        })) || [emptyItem()],
      });
    })();
  }, [open, invoiceId]);

  const save = async (alsoIssue: boolean) => {
    if (!form) return;
    try {
      await update({ data: { id: invoiceId, company_id: form.companyId, doc_type: form.docType, bill_to_name: form.billToName, invoice_date: form.invoiceDate, notes: form.notes, items: form.items, is_demo: false } });
      if (alsoIssue) { const r = await issue({ data: { id: invoiceId } }); toast.success(`Issued as ${r.invoice_number}`); }
      else toast.success("Draft updated");
      setOpen(false); onSaved();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" title="Edit draft"><Pencil className="h-3.5 w-3.5" /></Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Draft Invoice</DialogTitle></DialogHeader>
        {form ? <InvoiceForm companies={companies.data ?? []} value={form} onChange={setForm} /> : <p className="text-sm text-muted-foreground">Loading…</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => save(false)} disabled={!form}>Save Draft</Button>
          <Button onClick={() => save(true)} disabled={!form}>Save & Issue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumberingRulesTable() {
  const { data } = useQuery({
    queryKey: ["numbering-rules"],
    queryFn: async () => (await supabase.from("invoice_numbering_rules").select("*, companies(name)").order("created_at", { ascending: false })).data,
  });
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Company</TableHead><TableHead>Doc Type</TableHead><TableHead>Prefix</TableHead><TableHead>FY</TableHead><TableHead>Current Seq</TableHead><TableHead>Format</TableHead></TableRow></TableHeader>
      <TableBody>
        {(data ?? []).map((r: any) => (
          <TableRow key={r.id}>
            <TableCell>{r.companies?.name}</TableCell>
            <TableCell><Badge variant="outline" className="text-xs">{r.doc_type}</Badge></TableCell>
            <TableCell className="font-mono text-xs">{r.prefix}</TableCell>
            <TableCell>{r.financial_year}</TableCell>
            <TableCell>{r.current_seq}</TableCell>
            <TableCell className="font-mono text-xs">{r.format}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
