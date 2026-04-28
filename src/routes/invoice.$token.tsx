import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Receipt as ReceiptIcon, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { downloadGstInvoicePdf } from "@/lib/invoice-pdf";
import { formatINR } from "@/lib/format";

export const Route = createFileRoute("/invoice/$token")({
  head: () => ({ meta: [{ title: "Invoice — MMA Suite" }] }),
  component: PublicInvoicePage,
});

function PublicInvoicePage() {
  const { token } = Route.useParams();

  const tokenRow = useQuery({
    queryKey: ["invoice-token", token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_share_tokens")
        .select("order_id, expires_at")
        .eq("token", token)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const orderId = tokenRow.data?.order_id ?? null;
  const expired = tokenRow.data?.expires_at
    ? new Date(tokenRow.data.expires_at).getTime() < Date.now()
    : false;

  const order = useQuery({
    enabled: !!orderId && !expired,
    queryKey: ["public-invoice", orderId],
    queryFn: async () => {
      const [o, items, payments] = await Promise.all([
        supabase
          .from("sales_orders")
          .select("*, warehouses(name, address, city, state)")
          .eq("id", orderId!)
          .maybeSingle(),
        supabase.from("sales_order_items").select("*").eq("order_id", orderId!).order("created_at"),
        supabase.from("sale_payments").select("*").eq("order_id", orderId!).order("paid_at"),
      ]);
      return { order: o.data, items: items.data ?? [], payments: payments.data ?? [] };
    },
  });

  if (tokenRow.isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Loading invoice…</div>;
  }
  if (!tokenRow.data || expired) {
    return (
      <div className="mx-auto max-w-md p-12 text-center">
        <h1 className="font-display text-2xl text-gradient-gold">Invoice link unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This share link is invalid or has expired. Please ask the sender for a new link.
        </p>
      </div>
    );
  }

  const o = order.data?.order;
  const items = order.data?.items ?? [];
  const payments = order.data?.payments ?? [];
  if (!o) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;

  const downloadPdf = () => {
    downloadGstInvoicePdf({
      invoiceNumber: o.invoice_number ?? `DRAFT-${o.id.slice(0, 8)}`,
      invoiceDate: o.created_at,
      status: o.status,
      paymentStatus: o.payment_status,
      seller: {
        name: o.warehouses?.name ?? "MMA Business Suite",
        address: o.warehouses?.address ?? null,
        city: o.warehouses?.city ?? null,
        state: o.warehouses?.state ?? null,
        gstin: null,
      },
      buyer: {
        name: o.customer_name ?? "Walk-in customer",
        phone: o.customer_phone,
        email: o.customer_email,
        address: o.customer_address,
        gstin: o.customer_gstin,
      },
      items: items.map((it: any) => ({
        product_name: it.product_name,
        sku: it.sku,
        hsn_code: it.hsn_code,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        discount_pct: Number(it.discount_pct),
        gst_pct: Number(it.gst_pct),
        line_subtotal: Number(it.line_subtotal),
        line_gst: Number(it.line_gst),
        line_total: Number(it.line_total),
      })),
      totals: {
        subtotal: Number(o.subtotal),
        discount: Number(o.discount_amount),
        cgst: Number(o.cgst_amount),
        sgst: Number(o.sgst_amount),
        igst: Number(o.igst_amount ?? 0),
        grandTotal: Number(o.grand_total),
        amountPaid: Number(o.amount_paid),
      },
      payments: payments.map((p: any) => ({
        method: p.method,
        amount: Number(p.amount),
        reference: p.reference,
        paid_at: p.paid_at,
      })),
      notes: o.notes,
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <ReceiptIcon className="h-5 w-5 text-gold" />
          <h1 className="font-display text-2xl text-gradient-gold">Tax Invoice</h1>
        </div>
        <Button onClick={downloadPdf} className="bg-gradient-gold text-background">
          <Download className="mr-1 h-4 w-4" /> Download PDF
        </Button>
      </div>

      <div className="rounded-2xl glass p-8">
        <div className="flex items-start justify-between border-b border-border/40 pb-4">
          <div>
            <p className="font-mono text-lg font-semibold">{o.invoice_number ?? "Draft"}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(o.created_at).toLocaleString("en-IN")}
            </p>
          </div>
          <Badge variant="outline" className="border-gold/40 text-gold capitalize">
            {o.payment_status}
          </Badge>
        </div>

        <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">From</p>
            <p className="font-medium">{o.warehouses?.name ?? "MMA Business Suite"}</p>
            <p className="text-xs text-muted-foreground">
              {[o.warehouses?.address, o.warehouses?.city, o.warehouses?.state].filter(Boolean).join(", ")}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">To</p>
            <p className="font-medium">{o.customer_name ?? "Walk-in customer"}</p>
            <p className="text-xs text-muted-foreground">
              {[o.customer_phone, o.customer_email].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2 text-left">Item</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Rate</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any) => (
                <tr key={it.id} className="border-b border-border/30">
                  <td className="py-2">{it.product_name}</td>
                  <td className="py-2 text-right">{Number(it.quantity)}</td>
                  <td className="py-2 text-right font-mono">{formatINR(Number(it.unit_price))}</td>
                  <td className="py-2 text-right font-mono">{formatINR(Number(it.line_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">{formatINR(Number(o.subtotal))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GST</span>
              <span className="font-mono">{formatINR(Number(o.cgst_amount) + Number(o.sgst_amount) + Number(o.igst_amount ?? 0))}</span>
            </div>
            <div className="flex justify-between border-t border-border/60 pt-2 font-semibold">
              <span>Grand Total</span>
              <span className="font-mono text-gold">{formatINR(Number(o.grand_total))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
