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
import { issueInvoice, cancelInvoice, reviseInvoice, createInvoice } from "@/server/invoices.functions";
import { formatINR } from "@/lib/format";
import { toast } from "sonner";
import { Plus, FileText, Ban, RefreshCw, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/app/billing/invoices")({
  head: () => ({ meta: [{ title: "Invoices — MMA Suite" }] }),
  component: InvoicesPage,
});

const DOC_TYPES = ["b2b_tax", "b2c", "proforma", "quotation", "receipt", "credit_note", "debit_note"] as const;

function InvoicesPage() {
  const qc = useQueryClient();
  const [docFilter, setDocFilter] = React.useState<string>("all");

  const invoicesQ = useQuery({
    queryKey: ["invoices", docFilter],
    queryFn: async () => {
      let q = supabase.from("invoices").select("*, companies!invoices_company_id_fkey(name)").order("invoice_date", { ascending: false }).limit(200);
      if (docFilter !== "all") q = q.eq("doc_type", docFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const issueFn = useServerFn(issueInvoice);
  const cancelFn = useServerFn(cancelInvoice);
  const reviseFn = useServerFn(reviseInvoice);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold">Finance</p>
          <h1 className="font-display text-3xl">Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">Multi-company billing chain across HDK → MOS → Nail Emporium → downstream.</p>
        </div>
        <div className="flex gap-2">
          <Select value={docFilter} onValueChange={setDocFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All document types</SelectItem>
              {DOC_TYPES.map((d) => <SelectItem key={d} value={d}>{d.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <NewInvoiceDialog onCreated={() => qc.invalidateQueries({ queryKey: ["invoices"] })} />
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">All invoices</CardTitle></CardHeader>
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
                      <Button asChild size="sm" variant="ghost"><Link to="/invoice/$token" params={{ token: inv.id }}><FileText className="h-3.5 w-3.5" /></Link></Button>
                      {inv.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={async () => {
                          try { const r = await issueFn({ data: { id: inv.id } }); toast.success(`Issued as ${r.invoice_number}`); qc.invalidateQueries({ queryKey: ["invoices"] }); } catch (e) { toast.error((e as Error).message); }
                        }}><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                      )}
                      {inv.status === "issued" && (
                        <>
                          <Button size="sm" variant="outline" onClick={async () => {
                            try { await reviseFn({ data: { id: inv.id } }); toast.success("Revision created (draft)"); qc.invalidateQueries({ queryKey: ["invoices"] }); } catch (e) { toast.error((e as Error).message); }
                          }}><RefreshCw className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={async () => {
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

function NewInvoiceDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [companyId, setCompanyId] = React.useState("");
  const [docType, setDocType] = React.useState<typeof DOC_TYPES[number]>("b2b_tax");
  const [billToName, setBillToName] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = React.useState("");
  const [items, setItems] = React.useState([{ description: "", quantity: 1, unit_price: 0, discount_pct: 0, gst_pct: 18, is_student_product: false }]);
  const [issue, setIssue] = React.useState(false);

  const companies = useQuery({ queryKey: ["companies"], queryFn: async () => (await supabase.from("companies").select("id,name").order("name")).data });
  const create = useServerFn(createInvoice);

  const submit = async () => {
    try {
      await create({ data: { company_id: companyId, doc_type: docType, bill_to_name: billToName, invoice_date: invoiceDate, notes, items, issue, is_demo: false } });
      toast.success(issue ? "Invoice issued" : "Draft saved");
      setOpen(false); onCreated();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> New Invoice</Button></DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>From Company</Label>
            <Select value={companyId} onValueChange={setCompanyId}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{companies.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>Document Type</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as any)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DOC_TYPES.map((d) => <SelectItem key={d} value={d}>{d.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="col-span-2"><Label>Bill To (name)</Label><Input value={billToName} onChange={(e) => setBillToName(e.target.value)} /></div>
          <div><Label>Invoice Date</Label><Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
        </div>
        <div className="space-y-2">
          <Label>Items</Label>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <Input className="col-span-5" placeholder="Description" value={it.description} onChange={(e) => { const n = [...items]; n[i].description = e.target.value; setItems(n); }} />
              <Input className="col-span-2" type="number" placeholder="Qty" value={it.quantity} onChange={(e) => { const n = [...items]; n[i].quantity = +e.target.value; setItems(n); }} />
              <Input className="col-span-3" type="number" placeholder="Unit Price" value={it.unit_price} onChange={(e) => { const n = [...items]; n[i].unit_price = +e.target.value; setItems(n); }} />
              <Input className="col-span-2" type="number" placeholder="GST%" value={it.gst_pct} onChange={(e) => { const n = [...items]; n[i].gst_pct = +e.target.value; setItems(n); }} />
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setItems([...items, { description: "", quantity: 1, unit_price: 0, discount_pct: 0, gst_pct: 18, is_student_product: false }])}>+ Add line</Button>
        </div>
        <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { setIssue(false); submit(); }}>Save Draft</Button>
          <Button onClick={() => { setIssue(true); submit(); }}>Issue Invoice</Button>
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
