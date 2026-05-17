import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";
import { ArrowLeft, Printer } from "lucide-react";

export const Route = createFileRoute("/app/billing/invoices/$invoiceId")({
  head: () => ({ meta: [{ title: "Invoice — MMA Suite" }] }),
  component: InvoicePrintPage,
});

const DOC_TITLE: Record<string, string> = {
  b2b_tax: "Tax Invoice",
  b2c: "Retail Invoice",
  proforma: "Proforma Invoice",
  quotation: "Quotation",
  receipt: "Payment Receipt",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
};

function InvoicePrintPage() {
  const { invoiceId } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["invoice-detail", invoiceId],
    queryFn: async () => {
      const [inv, items, payments] = await Promise.all([
        supabase.from("invoices").select("*, companies!invoices_company_id_fkey(name,address,city,state,gstin,invoice_prefix), bill_company:companies!invoices_bill_to_company_id_fkey(name,gstin,address,city,state), franchisee:franchisees!invoices_franchisee_id_fkey(id,full_name,territory_id,territories(id,name,state,state_franchise_id)), state_franchise:state_franchises!invoices_state_franchise_id_fkey(id,full_name,state)").eq("id", invoiceId).maybeSingle(),
        supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("created_at"),
        supabase.from("payments").select("*").eq("invoice_id", invoiceId).order("payment_date", { ascending: false }),
      ]);
      return { inv: inv.data, items: items.data ?? [], payments: payments.data ?? [] };
    },
  });

  if (isLoading) return <div className="p-10 text-muted-foreground">Loading invoice…</div>;
  const inv = data?.inv as any;
  if (!inv) return <div className="p-10">Invoice not found</div>;

  const seller = inv.companies;
  const docTitle = DOC_TITLE[inv.doc_type] ?? "Document";
  const isReceipt = inv.doc_type === "receipt";
  const isQuote = inv.doc_type === "quotation" || inv.doc_type === "proforma";

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="ghost" size="sm"><Link to="/app/billing/invoices"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link></Button>
        <div className="flex gap-2">
          <Badge variant={inv.status === "issued" ? "default" : inv.status === "cancelled" ? "destructive" : "secondary"}>{inv.status}</Badge>
          {inv.is_demo && <Badge variant="outline">demo</Badge>}
          <Button onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" /> Print</Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-8 print:border-0 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <h1 className="font-display text-2xl">{seller?.name ?? "—"}</h1>
            <p className="text-xs text-muted-foreground">{[seller?.address, seller?.city, seller?.state].filter(Boolean).join(", ")}</p>
            {seller?.gstin && <p className="text-xs text-muted-foreground">GSTIN: {seller.gstin}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{docTitle}</p>
            <p className="font-mono text-lg font-semibold">{inv.invoice_number ?? "DRAFT"}</p>
            <p className="text-xs text-muted-foreground">Date: {inv.invoice_date}</p>
            {inv.due_date && !isReceipt && <p className="text-xs text-muted-foreground">Due: {inv.due_date}</p>}
            {inv.revision_no > 0 && <p className="text-xs text-amber-600">Revision #{inv.revision_no}</p>}
          </div>
        </div>

        {/* Parties */}
        <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Bill To</p>
            <p className="font-medium">{inv.bill_company?.name ?? inv.bill_to_name ?? "—"}</p>
            {inv.bill_company && <p className="text-xs text-muted-foreground">{[inv.bill_company.address, inv.bill_company.city, inv.bill_company.state].filter(Boolean).join(", ")}</p>}
            {(inv.bill_to_gstin || inv.bill_company?.gstin) && <p className="text-xs text-muted-foreground">GSTIN: {inv.bill_to_gstin ?? inv.bill_company?.gstin}</p>}
          </div>
          {inv.parent_invoice_id && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Revises</p>
              <p className="font-mono text-xs">{inv.parent_invoice_id.slice(0, 8)}…</p>
            </div>
          )}
        </div>

        {/* Traceability: Source Document + Territory Mapping (always visible for accounting trail) */}
        <div className="mt-4 grid gap-4 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm md:grid-cols-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Source Document</p>
            {(inv.source_document_ref || inv.source_document_url) ? (
              <>
                <p className="font-medium">
                  {inv.source_document_url ? (
                    <a href={inv.source_document_url} target="_blank" rel="noreferrer" className="text-gold underline-offset-2 hover:underline">
                      {inv.source_document_ref ?? "Open uploaded file"}
                    </a>
                  ) : (
                    <span className="font-mono text-xs">{inv.source_document_ref}</span>
                  )}
                </p>
                {inv.source_document_url && (
                  <Button asChild size="sm" variant="outline" className="mt-2 print:hidden">
                    <a href={inv.source_document_url} target="_blank" rel="noreferrer">Preview / Open file</a>
                  </Button>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">Read-only originating reference</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No source document linked</p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Revenue Attribution</p>
            {inv.state_franchise ? (
              <p className="text-xs"><span className="text-muted-foreground">State Franchise:</span> <span className="font-medium">{inv.state_franchise.full_name}</span>{inv.state_franchise.state ? ` · ${inv.state_franchise.state}` : ""}</p>
            ) : (
              <p className="text-xs"><span className="text-muted-foreground">State Franchisee:</span> <span className="font-medium">Not Assigned</span> · <span className="text-muted-foreground">Parent Company:</span> <span className="font-medium">MOS</span> · <span className="text-muted-foreground">State Commission:</span> <span className="font-medium">N/A</span></p>
            )}
            {inv.franchisee?.territories && (
              <p className="text-xs"><span className="text-muted-foreground">Territory:</span> <span className="font-medium">{inv.franchisee.territories.name}</span>{inv.franchisee.territories.state ? ` · ${inv.franchisee.territories.state}` : ""}</p>
            )}
            {inv.franchisee ? (
              <p className="text-xs"><span className="text-muted-foreground">City Franchisee:</span> <span className="font-medium">{inv.franchisee.full_name}</span></p>
            ) : (
              <p className="text-xs"><span className="text-muted-foreground">City Franchisee:</span> <span className="text-muted-foreground italic">Not mapped</span></p>
            )}
            {inv.is_intercompany && <Badge variant="outline" className="mt-1 text-[10px]">inter-company (excluded from external revenue)</Badge>}
          </div>
        </div>

        {/* Items */}
        {!isReceipt && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 text-left">#</th>
                  <th className="py-2 text-left">Description</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Rate</th>
                  <th className="py-2 text-right">Disc%</th>
                  <th className="py-2 text-right">GST%</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data!.items.map((it: any, idx: number) => (
                  <tr key={it.id} className="border-b border-border/40">
                    <td className="py-2">{idx + 1}</td>
                    <td className="py-2">{it.description}{it.is_student_product && <Badge variant="outline" className="ml-2 text-[10px]">student</Badge>}</td>
                    <td className="py-2 text-right">{Number(it.quantity)}</td>
                    <td className="py-2 text-right font-mono">{formatINR(Number(it.unit_price))}</td>
                    <td className="py-2 text-right">{Number(it.discount_pct)}%</td>
                    <td className="py-2 text-right">{Number(it.gst_pct)}%</td>
                    <td className="py-2 text-right font-mono">{formatINR(Number(it.line_total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{formatINR(Number(inv.subtotal))}</span></div>
            {Number(inv.discount_total) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="font-mono">−{formatINR(Number(inv.discount_total))}</span></div>}
            {inv.tax_mode === "inter" ? (
              <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span className="font-mono">{formatINR(Number(inv.igst_total ?? inv.gst_total))}</span></div>
            ) : inv.tax_mode === "intra" ? (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span className="font-mono">{formatINR(Number(inv.cgst_total ?? Number(inv.gst_total) / 2))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span className="font-mono">{formatINR(Number(inv.sgst_total ?? Number(inv.gst_total) / 2))}</span></div>
              </>
            ) : (
              <div className="flex justify-between"><span className="text-muted-foreground">GST</span><span className="font-mono">{formatINR(Number(inv.gst_total))}</span></div>
            )}
            <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Grand Total</span><span className="font-mono">{formatINR(Number(inv.grand_total))}</span></div>
            <div className="flex justify-between text-xs text-muted-foreground"><span>Paid</span><span className="font-mono">{formatINR(Number(inv.amount_paid))}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Balance</span><span className="font-mono">{formatINR(Number(inv.grand_total) - Number(inv.amount_paid))}</span></div>
            {(inv.place_of_supply || inv.from_state) && (
              <div className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                {inv.from_state && <div>From state: {inv.from_state}</div>}
                {inv.place_of_supply && <div>Place of Supply: {inv.place_of_supply}</div>}
              </div>
            )}
          </div>
        </div>

        {/* Payments */}
        {data!.payments.length > 0 && (
          <div className="mt-6 border-t border-border pt-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Payments</p>
            <table className="mt-2 w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="text-left">Date</th><th className="text-left">Mode</th><th className="text-left">Ref</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {data!.payments.map((p: any) => (
                  <tr key={p.id} className="border-b border-border/30">
                    <td className="py-1">{p.payment_date}</td>
                    <td className="py-1 capitalize">{p.method}</td>
                    <td className="py-1 font-mono text-xs">{p.reference ?? "—"}</td>
                    <td className="py-1 text-right font-mono">{formatINR(Number(p.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {inv.notes && (
          <div className="mt-6 border-t border-border pt-4 text-sm">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</p>
            <p className="whitespace-pre-wrap">{inv.notes}</p>
          </div>
        )}

        {isQuote && (
          <p className="mt-6 text-[10px] italic text-muted-foreground">This is a {docTitle.toLowerCase()} and not a tax invoice. Goods/services will be billed separately upon confirmation.</p>
        )}
      </div>

      <AuditHistory invoiceId={invoiceId} />
    </div>
  );
}

function AuditHistory({ invoiceId }: { invoiceId: string }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["invoice-audit", invoiceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("id, action, metadata, created_at, user_id")
        .eq("entity", "invoice")
        .eq("entity_id", invoiceId)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4 print:hidden">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Audit history</p>
      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : events.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No events recorded yet.</p>
      ) : (
        <ol className="mt-3 space-y-2 text-xs">
          {events.map((e: any) => (
            <li key={e.id} className="rounded border border-border/40 bg-background/40 p-2">
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold">{e.action}</span>
                <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
              </div>
              {e.metadata && Object.keys(e.metadata).length > 0 && (
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">{JSON.stringify(e.metadata, null, 2)}</pre>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
