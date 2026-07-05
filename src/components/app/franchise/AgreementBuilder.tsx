import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSignature, Download, Send, Save } from "lucide-react";
import jsPDF from "jspdf";
import {
  preloadLetterhead,
  requirePreloaded,
  drawPortraitLetterheadSync,
  PORTRAIT_CONTENT_TOP,
  PORTRAIT_CONTENT_BOTTOM,
} from "@/lib/letterhead";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";

type Product = {
  id: string;
  name: string;
  brand_name: string | null;
  investment_amount: number;
  royalty_percent: number;
  revenue_share_percent: number;
  minimum_guarantee: number;
  security_deposit: number;
  lock_in_months: number;
  
  gst_percent: number;
  agreement_template: string | null;
};

const DEFAULT_TEMPLATE = `FRANCHISE AGREEMENT

This Franchise Agreement ("Agreement") is entered into on {{today}} between:

FRANCHISOR: Make Me Artist Business Suite ("Company")
FRANCHISEE: {{franchisee.full_name}}, {{franchisee.email}}, {{franchisee.phone}}

PRODUCT: {{product.name}} ({{product.brand_name}})

1. INVESTMENT & FEES
   The Franchisee agrees to invest {{product.investment_amount}} (plus applicable {{product.gst_percent}}% GST)
   and deposit a refundable security of {{product.security_deposit}}.

2. ROYALTY & REVENUE SHARE
   Royalty: {{product.royalty_percent}}% of monthly gross revenue.
   Revenue share: {{product.revenue_share_percent}}%.
   Minimum guarantee to Franchisee: {{product.minimum_guarantee}} per annum.

3. TERM
   This Agreement is valid from {{valid_from}} to {{valid_till}}
   with a lock-in period of {{product.lock_in_months}} months.

4. OBLIGATIONS
   The Franchisee shall operate the outlet in accordance with the Company's brand
   standards, training programs, and operational manuals.

5. TERMINATION
   Either party may terminate this Agreement with 90 days' written notice, subject
   to settlement of pending dues and royalties.

Signed for and on behalf of the Company: ____________________
Signed by the Franchisee: ____________________`;

function mergeTemplate(
  tpl: string,
  ctx: { product: Product; franchisee: any; valid_from: string; valid_till: string },
): string {
  const flatten: Record<string, string> = {
    today: format(new Date(), "dd MMM yyyy"),
    valid_from: ctx.valid_from,
    valid_till: ctx.valid_till,
    "product.name": ctx.product.name,
    "product.brand_name": ctx.product.brand_name ?? "—",
    
    "product.investment_amount": formatINR(ctx.product.investment_amount),
    "product.security_deposit": formatINR(ctx.product.security_deposit),
    "product.minimum_guarantee": formatINR(ctx.product.minimum_guarantee),
    "product.royalty_percent": String(ctx.product.royalty_percent),
    "product.revenue_share_percent": String(ctx.product.revenue_share_percent),
    "product.gst_percent": String(ctx.product.gst_percent),
    "product.lock_in_months": String(ctx.product.lock_in_months),
    "franchisee.full_name": ctx.franchisee?.full_name ?? "____________",
    "franchisee.email": ctx.franchisee?.email ?? "____________",
    "franchisee.phone": ctx.franchisee?.phone ?? "____________",
  };
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => flatten[k] ?? `{{${k}}}`);
}

async function generatePdf(title: string, body: string): Promise<Blob> {
  await preloadLetterhead();
  const preloaded = await requirePreloaded();
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  drawPortraitLetterheadSync(doc, preloaded.full);

  let y = PORTRAIT_CONTENT_TOP;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text(title, margin, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(40, 40, 40);
  const lines = doc.splitTextToSize(body, pageWidth - margin * 2);
  for (const line of lines) {
    if (y > PORTRAIT_CONTENT_BOTTOM) {
      doc.addPage();
      drawPortraitLetterheadSync(doc, preloaded.full);
      y = PORTRAIT_CONTENT_TOP;
    }
    doc.text(line, margin, y);
    y += 14;
  }
  return doc.output("blob");
}

export function AgreementBuilder({ product }: { product: Product }) {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [template, setTemplate] = React.useState<string>(product.agreement_template || DEFAULT_TEMPLATE);
  const [franchiseeId, setFranchiseeId] = React.useState<string>("");
  const [validFrom, setValidFrom] = React.useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [validTill, setValidTill] = React.useState<string>(
    format(new Date(new Date().setFullYear(new Date().getFullYear() + 3)), "yyyy-MM-dd"),
  );

  const { data: franchisees = [] } = useQuery({
    queryKey: ["franchisees-for-agreements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("franchisees")
        .select("id, full_name, email, phone")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: agreements = [] } = useQuery({
    queryKey: ["agreements", product.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("franchise_agreements")
        .select("id, franchisee_id, version, status, valid_from, valid_till, created_at, signed_pdf_url")
        .eq("product_id", product.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const selected = franchisees.find((f: any) => f.id === franchiseeId);
  const merged = React.useMemo(
    () => mergeTemplate(template, { product, franchisee: selected, valid_from: validFrom, valid_till: validTill }),
    [template, product, selected, validFrom, validTill],
  );

  const saveTpl = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("franchise_products")
        .update({ agreement_template: template })
        .eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Template saved"),
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a franchisee first");
      const { error } = await (supabase as any).from("franchise_agreements").insert({
        product_id: product.id,
        franchisee_id: selected.id,
        version: `v${agreements.length + 1}`,
        status: "draft",
        template_snapshot: template,
        merged_html: merged,
        valid_from: validFrom,
        valid_till: validTill,
        generated_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agreement created (draft)");
      qc.invalidateQueries({ queryKey: ["agreements", product.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status };
      if (status === "sent") patch.sent_at = new Date().toISOString();
      if (status === "signed") patch.signed_at = new Date().toISOString();
      const { error } = await (supabase as any).from("franchise_agreements").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["agreements", product.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const downloadPdf = async () => {
    try {
      const blob = await generatePdf(`Franchise Agreement — ${product.name}`, merged);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agreement_${product.name.replace(/\s+/g, "_")}_${selected?.full_name?.replace(/\s+/g, "_") ?? "draft"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message ?? "PDF failed");
    }
  };

  if (!isAdmin) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Only admins can edit the agreement template. Ask an administrator to generate an agreement for you.
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-primary" />
          <h3 className="font-display text-xl">Agreement Template</h3>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          Use tokens like <code className="rounded bg-background/50 px-1">{"{{franchisee.full_name}}"}</code>,{" "}
          <code className="rounded bg-background/50 px-1">{"{{product.investment_amount}}"}</code>,{" "}
          <code className="rounded bg-background/50 px-1">{"{{valid_from}}"}</code>,{" "}
          <code className="rounded bg-background/50 px-1">{"{{today}}"}</code>.
        </p>
        <Textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={16}
          className="font-mono text-xs"
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={() => saveTpl.mutate()} disabled={saveTpl.isPending} variant="outline">
            <Save className="mr-2 h-4 w-4" /> Save template
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 font-display text-xl">Generate for franchisee</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Franchisee</Label>
            <select
              value={franchiseeId}
              onChange={(e) => setFranchiseeId(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-border bg-card/40 px-2 text-sm"
            >
              <option value="">— Select —</option>
              {franchisees.map((f: any) => (
                <option key={f.id} value={f.id}>
                  {f.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Valid from</Label>
            <Input type="date" className="mt-1" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Valid till</Label>
            <Input type="date" className="mt-1" value={validTill} onChange={(e) => setValidTill(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border/40 bg-background/30 p-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Preview</p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs text-foreground/90">{merged}</pre>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={downloadPdf} disabled={!selected}>
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </Button>
          <Button
            onClick={() => generate.mutate()}
            disabled={generate.isPending || !selected}
            className="bg-gradient-gold text-background"
          >
            <Send className="mr-2 h-4 w-4" />
            {generate.isPending ? "Saving…" : "Create draft agreement"}
          </Button>
        </div>
      </Card>

      {agreements.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4 font-display text-xl">Existing agreements</h3>
          <div className="space-y-2">
            {agreements.map((a: any) => {
              const f = franchisees.find((x: any) => x.id === a.franchisee_id);
              return (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/30 p-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {f?.full_name ?? "Unknown"} · <span className="text-xs text-muted-foreground">{a.version}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.valid_from ?? "—"} → {a.valid_till ?? "—"} · created {format(new Date(a.created_at), "dd MMM yyyy")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">{a.status}</Badge>
                    <select
                      value={a.status}
                      onChange={(e) => setStatus.mutate({ id: a.id, status: e.target.value })}
                      className="h-8 rounded-md border border-border bg-card/40 px-2 text-xs"
                    >
                      <option value="draft">draft</option>
                      <option value="sent">sent</option>
                      <option value="signed">signed</option>
                      <option value="expired">expired</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
