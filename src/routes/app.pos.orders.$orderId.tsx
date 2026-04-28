import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, Download, Receipt as ReceiptIcon, Share2, MessageCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { downloadGstInvoicePdf } from "@/lib/invoice-pdf";
import { formatINR } from "@/lib/format";


export const Route = createFileRoute("/app/pos/orders/$orderId")({
  component: OrderDetail,
});

function OrderDetail() {
  const { orderId } = Route.useParams();

  const order = useQuery({
    queryKey: ["pos-order", orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_orders")
        .select("*, warehouses(name, address, city, state)")
        .eq("id", orderId)
        .maybeSingle();
      return data;
    },
  });

  const items = useQuery({
    queryKey: ["pos-order-items", orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_order_items")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at");
      return data ?? [];
    },
  });

  const payments = useQuery({
    queryKey: ["pos-order-payments", orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sale_payments")
        .select("*")
        .eq("order_id", orderId)
        .order("paid_at");
      return data ?? [];
    },
  });

  const o = order.data;

  const downloadInvoice = () => {
    if (!o) return;
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
      items: (items.data ?? []).map((it: any) => ({
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
      payments: (payments.data ?? []).map((p: any) => ({
        method: p.method,
        amount: Number(p.amount),
        reference: p.reference,
        paid_at: p.paid_at,
      })),
      notes: o.notes,
    });
  };

  if (order.isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Loading invoice…</div>;
  }
  if (!o) {
    return (
      <div className="space-y-3">
        <Link to="/app/pos/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </Link>
        <p className="text-muted-foreground">Order not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/app/pos/orders"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <ShareInvoiceButtons order={o} />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> Print
          </Button>
          <Button size="sm" onClick={downloadInvoice} className="bg-gradient-gold text-background">
            <Download className="mr-1 h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="rounded-2xl glass p-8 print:rounded-none print:p-4 print:shadow-none">
        <div className="flex items-start justify-between border-b border-border/40 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <ReceiptIcon className="h-5 w-5 text-gold" />
              <h2 className="font-display text-xl text-gradient-gold">Tax Invoice</h2>
            </div>
            <p className="mt-1 font-mono text-lg font-semibold">{o.invoice_number ?? "Draft"}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(o.created_at).toLocaleString("en-IN")}
            </p>
          </div>
          <div className="text-right">
            <Badge variant="outline" className="border-gold/40 text-gold">
              {o.status}
            </Badge>
            <p className="mt-1 text-xs text-muted-foreground">
              Payment: <span className="text-foreground">{o.payment_status}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">From</p>
            <p className="mt-1 font-medium">{o.warehouses?.name ?? "—"}</p>
            {o.warehouses?.address && (
              <p className="text-xs text-muted-foreground">
                {o.warehouses.address}
                {o.warehouses.city ? `, ${o.warehouses.city}` : ""}
                {o.warehouses.state ? `, ${o.warehouses.state}` : ""}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Bill to</p>
            <p className="mt-1 font-medium">{o.customer_name ?? "Walk-in customer"}</p>
            {o.customer_phone && <p className="text-xs text-muted-foreground">{o.customer_phone}</p>}
            {o.customer_email && <p className="text-xs text-muted-foreground">{o.customer_email}</p>}
            {o.customer_gstin && (
              <p className="text-xs text-muted-foreground">GSTIN: {o.customer_gstin}</p>
            )}
          </div>
        </div>

        <Separator className="my-5" />

        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="pb-2">Item</th>
              <th className="pb-2">HSN</th>
              <th className="pb-2 text-right">Qty</th>
              <th className="pb-2 text-right">Price</th>
              <th className="pb-2 text-right">GST%</th>
              <th className="pb-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {(items.data ?? []).map((it: any) => (
              <tr key={it.id}>
                <td className="py-2">
                  <p className="font-medium">{it.product_name}</p>
                  {it.sku && <p className="text-xs text-muted-foreground">{it.sku}</p>}
                </td>
                <td className="py-2 text-xs text-muted-foreground">{it.hsn_code ?? "—"}</td>
                <td className="py-2 text-right">{Number(it.quantity)}</td>
                <td className="py-2 text-right">{formatINR(Number(it.unit_price))}</td>
                <td className="py-2 text-right text-xs text-muted-foreground">
                  {Number(it.gst_pct)}%
                </td>
                <td className="py-2 text-right font-medium">{formatINR(Number(it.line_total))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Separator className="my-5" />

        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <Row label="Subtotal" value={formatINR(Number(o.subtotal))} />
          {Number(o.discount_amount) > 0 && (
            <Row label="Discount" value={`- ${formatINR(Number(o.discount_amount))}`} className="text-rose-400" />
          )}
          <Row label="CGST" value={formatINR(Number(o.cgst_amount))} />
          <Row label="SGST" value={formatINR(Number(o.sgst_amount))} />
          <Separator className="my-2" />
          <div className="flex items-center justify-between text-base">
            <span className="font-medium">Grand Total</span>
            <span className="font-display text-xl text-gold">{formatINR(Number(o.grand_total))}</span>
          </div>
          <Row label="Amount Paid" value={formatINR(Number(o.amount_paid))} className="text-emerald-400" />
          {Number(o.grand_total) - Number(o.amount_paid) > 0 && (
            <Row
              label="Balance Due"
              value={formatINR(Number(o.grand_total) - Number(o.amount_paid))}
              className="text-amber-400"
            />
          )}
        </div>

        {(payments.data ?? []).length > 0 && (
          <>
            <Separator className="my-5" />
            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Payments</p>
            <div className="space-y-1 text-sm">
              {(payments.data ?? []).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-md bg-foreground/5 px-3 py-2">
                  <div>
                    <p className="font-medium capitalize">{p.method.replace("_", " ")}</p>
                    {p.reference && <p className="text-xs text-muted-foreground">Ref: {p.reference}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatINR(Number(p.amount))}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.paid_at).toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {o.notes && (
          <>
            <Separator className="my-5" />
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Notes</p>
            <p className="mt-1 text-sm">{o.notes}</p>
          </>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Thank you for your business · Powered by MMA Business Suite
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex items-center justify-between ${className ?? ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ShareInvoiceButtons({ order }: { order: any }) {
  const [creating, setCreating] = React.useState(false);

  const ensureToken = async (): Promise<string | null> => {
    setCreating(true);
    try {
      const { data: existing } = await supabase
        .from("invoice_share_tokens")
        .select("token")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.token) return existing.token;

      const token =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "")
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("invoice_share_tokens").insert({
        order_id: order.id,
        token,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
      return token;
    } catch (e: any) {
      toast.error(e.message ?? "Could not create share link");
      return null;
    } finally {
      setCreating(false);
    }
  };

  const buildUrl = async () => {
    const token = await ensureToken();
    if (!token) return null;
    return `${window.location.origin}/invoice/${token}`;
  };

  const onCopy = async () => {
    const url = await buildUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success("Public invoice link copied");
  };

  const onWhatsApp = async () => {
    const url = await buildUrl();
    if (!url) return;
    const phone = (order.customer_phone || "").replace(/[^\d]/g, "");
    const text = `Your invoice ${order.invoice_number ?? ""} for ${formatINR(Number(order.grand_total))}: ${url}`;
    const wa = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
  };

  const onEmail = async () => {
    const url = await buildUrl();
    if (!url) return;
    const subject = `Invoice ${order.invoice_number ?? ""}`;
    const body = `Hello,\n\nPlease find your invoice here: ${url}\n\nAmount: ${formatINR(Number(order.grand_total))}\n\nThank you.`;
    window.location.href = `mailto:${order.customer_email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={onWhatsApp} disabled={creating} title="Share on WhatsApp">
        <MessageCircle className="mr-1 h-4 w-4 text-emerald-500" /> WhatsApp
      </Button>
      <Button variant="outline" size="sm" onClick={onEmail} disabled={creating} title="Share via Email">
        <Mail className="mr-1 h-4 w-4" /> Email
      </Button>
      <Button variant="outline" size="sm" onClick={onCopy} disabled={creating} title="Copy public link">
        <Share2 className="mr-1 h-4 w-4" /> Copy link
      </Button>
    </>
  );
}
