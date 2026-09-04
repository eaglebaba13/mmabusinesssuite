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
import { issueInvoice, cancelInvoice, reviseInvoice, createInvoice, updateInvoice, deleteInvoice } from "@/lib/rpc/invoices.functions";
import { formatINR } from "@/lib/format";
import { toast } from "sonner";
import { Plus, FileText, Ban, RefreshCw, CheckCircle2, Pencil, X, Trash2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/billing/invoices")({
  head: () => ({ meta: [{ title: "Invoices — MMA Suite" }] }),
  component: InvoicesPage,
});

// Active billing types — only B2B and B2C are part of the live invoicing flow.
// Proforma is deprecated (archived only). Quotation / credit-note / debit-note
// remain available as supporting documents but are not part of New Invoice.
const ACTIVE_DOC_TYPES = ["b2b_tax", "b2c"] as const;
const SUPPORT_DOC_TYPES = ["quotation", "credit_note", "debit_note", "receipt"] as const;
const ALL_DOC_TYPES = [...ACTIVE_DOC_TYPES, ...SUPPORT_DOC_TYPES, "proforma"] as const;
const DOC_TYPES = ALL_DOC_TYPES;
type DocType = typeof ALL_DOC_TYPES[number];
const STATUSES = ["draft", "issued", "revised", "cancelled"] as const;

type Item = { description: string; quantity: number; unit_price: number; discount_pct: number; gst_pct: number; is_student_product: boolean };

const TAX_DOC_TYPES = new Set<DocType>(["b2b_tax", "credit_note", "debit_note"]);

function computeFormTotals(items: Item[]) {
  let subtotal = 0, discount_total = 0, gst_total = 0;
  for (const it of items) {
    const gross = Number(it.quantity || 0) * Number(it.unit_price || 0);
    const disc = gross * Number(it.discount_pct || 0) / 100;
    const net = gross - disc;
    const gst = net * Number(it.gst_pct || 0) / 100;
    subtotal += gross; discount_total += disc; gst_total += gst;
  }
  return { subtotal, discount_total, gst_total, grand_total: subtotal - discount_total + gst_total };
}

function InvoicesPage() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole("super_admin");
  const [docFilter, setDocFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [companyFilter, setCompanyFilter] = React.useState<string>("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(false);

  const companies = useQuery({ queryKey: ["companies"], queryFn: async () => (await supabase.from("companies").select("id,name").order("name")).data });

  const invoicesQ = useQuery({
    queryKey: ["invoices", docFilter, statusFilter, companyFilter, from, to, showArchived],
    queryFn: async () => {
      let q = supabase.from("invoices").select("*, companies!invoices_company_id_fkey(name), franchisees!franchisee_id(full_name), state_franchises!state_franchise_id(full_name)").order("invoice_date", { ascending: false }).limit(300);
      if (docFilter !== "all") q = q.eq("doc_type", docFilter as any);
      if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
      if (companyFilter !== "all") q = q.eq("company_id", companyFilter);
      if (from) q = q.gte("invoice_date", from);
      if (to) q = q.lte("invoice_date", to);
      if (!showArchived) q = q.is("archived_at", null);
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
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived (proforma)
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">All invoices ({invoicesQ.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Number</TableHead><TableHead>Type</TableHead><TableHead>From</TableHead><TableHead>Bill To</TableHead><TableHead>Franchise</TableHead>
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
                  <TableCell className="text-xs">{inv.franchisees?.full_name ?? inv.state_franchises?.full_name ?? "—"}</TableCell>
                  <TableCell>{inv.invoice_date}</TableCell>
                  <TableCell>{formatINR(inv.grand_total)}</TableCell>
                  <TableCell>{formatINR(inv.amount_paid)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={inv.status === "issued" ? "default" : inv.status === "cancelled" ? "destructive" : "secondary"} className="w-fit text-xs">{inv.status}</Badge>
                      {inv.archived_at && <Badge variant="outline" className="w-fit text-[10px]">archived</Badge>}
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
                      {isSuperAdmin && inv.status !== "draft" && !inv.archived_at && (
                        <EditDraftDialog invoiceId={inv.id} onSaved={() => qc.invalidateQueries({ queryKey: ["invoices"] })} />
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
                      {isSuperAdmin && !inv.archived_at && (
                        <DeleteInvoiceDialog invoice={inv} onDeleted={() => qc.invalidateQueries({ queryKey: ["invoices"] })} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {invoicesQ.data?.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No invoices</TableCell></TableRow>}
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

const INVOICE_CATEGORIES: { value: string; label: string }[] = [
  { value: "tns_turnover", label: "TNS Turnover" },
  { value: "academy_sales", label: "Academy Sales" },
  { value: "mall_of_salon_sales", label: "Mall of Salon Sales" },
  { value: "franchise_fee", label: "Franchise Fee" },
  { value: "royalty", label: "Royalty" },
  { value: "product_sales", label: "Product Sales" },
  { value: "service_sales", label: "Service Sales" },
  { value: "other", label: "Other" },
];

function InvoiceForm({ companies, value, onChange }: {
  companies: { id: string; name: string }[];
  value: { companyId: string; docType: DocType; billToName: string; billToGstin?: string; placeOfSupply?: string; invoiceDate: string; notes: string; items: Item[]; franchiseeId?: string | null; stateFranchiseId?: string | null; franchiseMappingType?: string; invoiceCategory?: string; isIntercompany?: boolean; sourceDocumentRef?: string; sourceDocumentUrl?: string };
  onChange: (v: any) => void;
}) {
  const v = value;
  const set = (patch: any) => onChange({ ...v, ...patch });
  const isTax = TAX_DOC_TYPES.has(v.docType);

  // From-company state for tax mode preview
  const fromStateQ = useQuery({
    queryKey: ["company-state", v.companyId],
    enabled: !!v.companyId,
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("address").eq("id", v.companyId).maybeSingle();
      const addr = (data?.address ?? null) as any;
      return addr && typeof addr === "object" ? (addr.state as string | undefined) ?? null : null;
    },
  });
  const fromState = fromStateQ.data ?? null;
  const pos = (v.placeOfSupply ?? "").trim();
  const taxMode: "intra" | "inter" | null = !fromState || !pos
    ? null
    : fromState.trim().toLowerCase() === pos.toLowerCase() ? "intra" : "inter";

  const totals = React.useMemo(() => computeFormTotals(v.items), [v.items]);
  const cgst = taxMode === "inter" ? 0 : totals.gst_total / 2;
  const sgst = taxMode === "inter" ? 0 : totals.gst_total / 2;
  const igst = taxMode === "inter" ? totals.gst_total : 0;

  // City franchisees with territory + state franchise (for attribution selector)
  const franchiseesQ = useQuery({
    queryKey: ["franchisees-attr"],
    queryFn: async () => (await supabase
      .from("franchisees")
      .select("id, full_name, franchise_type, territories(name, state, state_franchises(full_name, state))")
      .order("full_name")).data ?? [],
  });
  const stateFranchisesQ = useQuery({
    queryKey: ["state-franchises-attr"],
    queryFn: async () => (await supabase.from("state_franchises").select("id, full_name, state").order("full_name")).data ?? [],
  });
  const selectedFr: any = (franchiseesQ.data ?? []).find((f: any) => f.id === v.franchiseeId);
  const mappingType = v.franchiseMappingType ?? "company_direct";
  const category = v.invoiceCategory ?? "other";
  const mastersList = (franchiseesQ.data ?? []).filter((f: any) => f.franchise_type === "master");
  const cityList = (franchiseesQ.data ?? []).filter((f: any) => (f.franchise_type ?? "city") === "city");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>From Company</Label>
          <Select value={v.companyId} onValueChange={(x) => set({ companyId: x })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          {v.companyId && (
            <p className="mt-1 text-[11px] text-muted-foreground">Seller state: {fromState ?? <span className="text-destructive">not set on company</span>}</p>
          )}
        </div>
        <div><Label>Document Type</Label>
          <Select value={v.docType} onValueChange={(x) => set({ docType: x as DocType })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTIVE_DOC_TYPES.map((d) => <SelectItem key={d} value={d}>{d.replace("_", " ")} (active)</SelectItem>)}
              {SUPPORT_DOC_TYPES.map((d) => <SelectItem key={d} value={d}>{d.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-muted-foreground">Proforma is archived from the active flow — only B2B and B2C count as revenue.</p>
        </div>
        <div className="col-span-2"><Label>Bill To (name)</Label><Input value={v.billToName} onChange={(e) => set({ billToName: e.target.value })} /></div>
        {isTax && (
          <>
            <div><Label>Bill To GSTIN</Label><Input value={v.billToGstin ?? ""} onChange={(e) => set({ billToGstin: e.target.value })} placeholder="e.g. 27AAAPL1234C1ZV" /></div>
            <div><Label>Place of Supply (State) <span className="text-destructive">*</span></Label><Input value={v.placeOfSupply ?? ""} onChange={(e) => set({ placeOfSupply: e.target.value })} placeholder="e.g. Maharashtra" /></div>
          </>
        )}
        <div><Label>Invoice Date</Label><Input type="date" value={v.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} /></div>
      </div>

      {/* Franchise Mapping & Invoice Category (mandatory) */}
      <div className="rounded-md border border-gold/30 bg-gold/5 p-3">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-gold">Franchise Mapping & Invoice Category *</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Franchise Mapping <span className="text-destructive">*</span></Label>
            <Select
              value={mappingType}
              onValueChange={(x) => set({ franchiseMappingType: x, franchiseeId: null, stateFranchiseId: null })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company_direct">Company Direct</SelectItem>
                <SelectItem value="master">Master Franchise</SelectItem>
                <SelectItem value="state">State Franchise</SelectItem>
                <SelectItem value="city">City Franchise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Invoice Category <span className="text-destructive">*</span></Label>
            <Select value={category} onValueChange={(x) => set({ invoiceCategory: x })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVOICE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {mappingType === "master" && (
            <div className="col-span-2">
              <Label>Select Master Franchise</Label>
              <Select value={v.franchiseeId ?? ""} onValueChange={(x) => set({ franchiseeId: x })}>
                <SelectTrigger><SelectValue placeholder="Choose master franchise" /></SelectTrigger>
                <SelectContent>
                  {mastersList.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {mappingType === "state" && (
            <div className="col-span-2">
              <Label>Select State Franchise</Label>
              <Select value={v.stateFranchiseId ?? ""} onValueChange={(x) => set({ stateFranchiseId: x })}>
                <SelectTrigger><SelectValue placeholder="Choose state franchise" /></SelectTrigger>
                <SelectContent>
                  {(stateFranchisesQ.data ?? []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.full_name}{f.state ? ` · ${f.state}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {mappingType === "city" && (
            <div className="col-span-2">
              <Label>Select City Franchise</Label>
              <Select value={v.franchiseeId ?? ""} onValueChange={(x) => set({ franchiseeId: x })}>
                <SelectTrigger><SelectValue placeholder="Choose city franchise" /></SelectTrigger>
                <SelectContent>
                  {cityList.map((f: any) => {
                    const terr = f.territories?.name ?? "no territory";
                    const st = f.territories?.state ?? "";
                    return <SelectItem key={f.id} value={f.id}>{f.full_name} · {terr}{st ? ` (${st})` : ""}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              {selectedFr && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Auto-derived state franchise: <strong>{selectedFr.territories?.state_franchises?.full_name ?? "—"}</strong>
                </p>
              )}
            </div>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Categories <em>TNS Turnover</em>, <em>Academy Sales</em> and <em>Mall of Salon Sales</em> feed the automatic ROI engine for the mapped franchisee.
        </p>
      </div>

      {/* Traceability — source document */}
      <div className="rounded-md border border-border bg-muted/20 p-3">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Source Document</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Source Document Upload (PDF/JPG/PNG)</Label>
            <SourceDocUpload
              currentUrl={v.sourceDocumentUrl}
              onUploaded={(url, name) => set({ sourceDocumentUrl: url, sourceDocumentRef: v.sourceDocumentRef || name })}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">You can upload a file <em>and/or</em> paste a URL below.</p>
          </div>
          <div><Label>Source Document Ref</Label><Input value={v.sourceDocumentRef ?? ""} onChange={(e) => set({ sourceDocumentRef: e.target.value })} placeholder="e.g. PI/1021" /></div>
          <div><Label>Source Document URL</Label><Input value={v.sourceDocumentUrl ?? ""} onChange={(e) => set({ sourceDocumentUrl: e.target.value })} placeholder="https://…/proforma.pdf" /></div>
          <div className="col-span-2 flex items-center gap-2">
            <input id="ic" type="checkbox" checked={!!v.isIntercompany} onChange={(e) => set({ isIntercompany: e.target.checked })} />
            <Label htmlFor="ic" className="cursor-pointer">Inter-company transaction (exclude from external revenue/reports)</Label>
          </div>
        </div>
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

      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Totals</span>
          {isTax && (
            <span className="text-[11px] text-muted-foreground">
              Tax mode: <strong>{taxMode === "inter" ? "Inter-state (IGST)" : taxMode === "intra" ? "Intra-state (CGST+SGST)" : "—"}</strong>
            </span>
          )}
        </div>
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{formatINR(totals.subtotal)}</span></div>
        {totals.discount_total > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="font-mono">−{formatINR(totals.discount_total)}</span></div>}
        {taxMode === "inter" ? (
          <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span className="font-mono">{formatINR(igst)}</span></div>
        ) : (
          <>
            <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span className="font-mono">{formatINR(cgst)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span className="font-mono">{formatINR(sgst)}</span></div>
          </>
        )}
        <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Grand Total</span><span className="font-mono">{formatINR(totals.grand_total)}</span></div>
      </div>

      <div><Label>Notes</Label><Textarea value={v.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
    </div>
  );
}

function NewInvoiceDialog({ companies, onCreated }: { companies: { id: string; name: string }[]; onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ companyId: "", docType: "b2b_tax" as DocType, billToName: "", billToGstin: "", placeOfSupply: "", invoiceDate: new Date().toISOString().slice(0, 10), notes: "", items: [emptyItem()], franchiseeId: null as string | null, stateFranchiseId: null as string | null, franchiseMappingType: "company_direct", invoiceCategory: "other", isIntercompany: false, sourceDocumentRef: "", sourceDocumentUrl: "" });
  const create = useServerFn(createInvoice);
  const submit = async (issue: boolean) => {
    try {
      if (issue && TAX_DOC_TYPES.has(form.docType) && !form.placeOfSupply.trim()) {
        toast.error("Place of Supply is required to issue a B2B tax invoice");
        return;
      }
      if (form.franchiseMappingType === "master" && !form.franchiseeId) { toast.error("Select the Master Franchise"); return; }
      if (form.franchiseMappingType === "state" && !form.stateFranchiseId) { toast.error("Select the State Franchise"); return; }
      if (form.franchiseMappingType === "city" && !form.franchiseeId) { toast.error("Select the City Franchise"); return; }
      await create({ data: { company_id: form.companyId, doc_type: form.docType, bill_to_name: form.billToName, bill_to_gstin: form.billToGstin || null, place_of_supply: form.placeOfSupply || null, invoice_date: form.invoiceDate, notes: form.notes, items: form.items, franchisee_id: form.franchiseeId, state_franchise_id: form.stateFranchiseId, franchise_mapping_type: form.franchiseMappingType as any, invoice_category: form.invoiceCategory as any, is_intercompany: form.isIntercompany, source_document_ref: form.sourceDocumentRef || null, source_document_url: form.sourceDocumentUrl || null, issue, is_demo: false } });
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
        billToGstin: inv.bill_to_gstin ?? "", placeOfSupply: (inv as any).place_of_supply ?? "",
        invoiceDate: inv.invoice_date, notes: inv.notes ?? "",
        franchiseeId: (inv as any).franchisee_id ?? null,
        stateFranchiseId: (inv as any).state_franchise_id ?? null,
        franchiseMappingType: (inv as any).franchise_mapping_type ?? "company_direct",
        invoiceCategory: (inv as any).invoice_category ?? "other",
        isIntercompany: !!(inv as any).is_intercompany,
        sourceDocumentRef: (inv as any).source_document_ref ?? "",
        sourceDocumentUrl: (inv as any).source_document_url ?? "",
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
      if (alsoIssue && TAX_DOC_TYPES.has(form.docType) && !(form.placeOfSupply ?? "").trim()) {
        toast.error("Place of Supply is required to issue a B2B tax invoice");
        return;
      }
      await update({ data: { id: invoiceId, company_id: form.companyId, doc_type: form.docType, bill_to_name: form.billToName, bill_to_gstin: form.billToGstin || null, place_of_supply: form.placeOfSupply || null, invoice_date: form.invoiceDate, notes: form.notes, items: form.items, franchisee_id: form.franchiseeId ?? null, state_franchise_id: form.stateFranchiseId ?? null, franchise_mapping_type: form.franchiseMappingType, invoice_category: form.invoiceCategory, is_intercompany: !!form.isIntercompany, source_document_ref: form.sourceDocumentRef || null, source_document_url: form.sourceDocumentUrl || null, is_demo: false } });
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

/**
 * Source documents live in the PRIVATE `invoice-sources` bucket. We persist the
 * storage path (not a public URL) and open files through short-lived signed
 * URLs so financial attachments are never fetchable without authorization.
 */
function sourceDocPath(stored: string) {
  const marker = "/invoice-sources/";
  const i = stored.indexOf(marker);
  return i >= 0 ? stored.slice(i + marker.length) : stored;
}

async function openSourceDoc(stored: string) {
  const { data, error } = await supabase.storage
    .from("invoice-sources")
    .createSignedUrl(sourceDocPath(stored), 300);
  if (error) { toast.error(error.message); return; }
  window.open(data.signedUrl, "_blank", "noopener");
}

function SourceDocUpload({ currentUrl, onUploaded }: { currentUrl?: string; onUploaded: (url: string, name: string) => void }) {
  const [uploading, setUploading] = React.useState(false);
  const [name, setName] = React.useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!file) return;
    const ok = ["application/pdf", "image/png", "image/jpeg"].includes(file.type);
    if (!ok) { toast.error("Only PDF, JPG, PNG allowed"); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("Max 15MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("invoice-sources").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      setName(file.name);
      onUploaded(path, file.name);
      toast.success("Source document uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1">
      <Input type="file" accept="application/pdf,image/png,image/jpeg" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      {uploading && <p className="text-[11px] text-muted-foreground">Uploading…</p>}
      {(name || currentUrl) && (
        <p className="text-[11px] text-muted-foreground">
          {name && <>Uploaded: <strong>{name}</strong> · </>}
          {currentUrl && (
            <button type="button" onClick={() => openSourceDoc(currentUrl)} className="text-gold underline-offset-2 hover:underline">
              Open file
            </button>
          )}
        </p>
      )}
    </div>
  );
}


const DELETE_REASONS = [
  { value: "duplicate", label: "Duplicate invoice" },
  { value: "wrong_party", label: "Wrong party billed" },
  { value: "wrong_amount", label: "Wrong amount" },
  { value: "test_cleanup", label: "Test data cleanup" },
  { value: "created_by_mistake", label: "Created by mistake" },
  { value: "other", label: "Other" },
] as const;

function DeleteInvoiceDialog({ invoice, onDeleted }: { invoice: any; onDeleted: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [reasonCode, setReasonCode] = React.useState<string>("");
  const [detail, setDetail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const deleteFn = useServerFn(deleteInvoice);

  const reset = () => { setReasonCode(""); setDetail(""); setBusy(false); };
  const requiresDetail = reasonCode === "other";
  const canSubmit = !!reasonCode && detail.trim().length > 0 && (!requiresDetail || detail.trim().length >= 3);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await deleteFn({ data: { id: invoice.id, reason_code: reasonCode as any, reason_detail: detail.trim() } });
      toast.success("Invoice deleted (archived)");
      setOpen(false);
      reset();
      onDeleted();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Delete (Super Admin)" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" /> Delete Invoice
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
            This invoice will be archived and removed from active revenue, receivables, payouts, and reports. Audit history is preserved.
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs">
            <div><span className="text-muted-foreground">Number:</span> <strong className="font-mono">{invoice.invoice_number ?? "DRAFT"}</strong></div>
            <div><span className="text-muted-foreground">Type:</span> <strong>{invoice.doc_type}</strong></div>
            <div className="col-span-2"><span className="text-muted-foreground">Bill To:</span> <strong>{invoice.bill_to_name ?? "—"}</strong></div>
            <div><span className="text-muted-foreground">Amount:</span> <strong>{formatINR(invoice.grand_total)}</strong></div>
            <div><span className="text-muted-foreground">Status:</span> <strong>{invoice.status}</strong></div>
          </div>
          <div>
            <Label className="text-xs">Reason for deletion <span className="text-destructive">*</span></Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
              <SelectContent>
                {DELETE_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">
              {requiresDetail ? "Explanation" : "Notes"} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={requiresDetail ? "Please explain the reason in detail…" : "Add a short note for the audit log"}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Keep Invoice</Button>
          <Button variant="destructive" onClick={submit} disabled={!canSubmit || busy}>
            {busy ? "Deleting…" : "Delete Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
