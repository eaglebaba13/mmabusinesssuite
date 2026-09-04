import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Sparkles, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { DOC_TYPES, docTypeDef, type DocTypeKey } from "@/lib/docgen/model";
import { ACTIVITY_TYPES, listSources } from "@/lib/docgen/builders";
import { generateDocument, listDocuments, type OfficialDocRow } from "@/lib/docgen/service";
import { DocumentPreviewDialog } from "@/components/app/DocumentPreviewDialog";

export const Route = createFileRoute("/app/documents")({
  head: () => ({
    meta: [
      { title: "Document Generator — MMA Suite" },
      {
        name: "description",
        content:
          "Generate official MMA documents — ROI claims, agreements, invoices, receipts, payouts, purchase orders and letters — on the company letterhead.",
      },
      { property: "og:title", content: "Document Generator — MMA Suite" },
      {
        property: "og:description",
        content: "Centralised official document generation on the MMA letterhead with secure storage and version history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocumentGeneratorPage,
});

type Extras = Record<string, string>;

function DocumentGeneratorPage() {
  const { isAdmin, hasRole } = useAuth();
  const qc = useQueryClient();

  const canUse = isAdmin || hasRole("accounts") || hasRole("hr");
  const allowed = React.useMemo(
    () =>
      DOC_TYPES.filter(
        (d) =>
          (d.allow.includes("admin") && isAdmin) ||
          (d.allow.includes("accounts") && hasRole("accounts")) ||
          (d.allow.includes("hr") && hasRole("hr")),
      ),
    [isAdmin, hasRole],
  );

  const [docType, setDocType] = React.useState<DocTypeKey>("roi_claim");
  const [sourceId, setSourceId] = React.useState<string | null>(null);
  const [extras, setExtras] = React.useState<Extras>({});
  const [search, setSearch] = React.useState("");
  const [preview, setPreview] = React.useState<OfficialDocRow | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  React.useEffect(() => {
    if (allowed.length && !allowed.some((d) => d.key === docType)) setDocType(allowed[0].key);
  }, [allowed, docType]);

  const def = docTypeDef(docType);
  const set = (k: string, v: string) => setExtras((p) => ({ ...p, [k]: v }));

  const sourcesQ = useQuery({
    queryKey: ["docgen-sources", def.source],
    queryFn: () => listSources(def.source),
    enabled: canUse && def.source !== "none",
  });

  const docsQ = useQuery({
    queryKey: ["official-documents"],
    queryFn: () => listDocuments(),
    enabled: canUse,
  });

  const generate = useMutation({
    mutationFn: (opts: { regenerate?: boolean }) =>
      generateDocument({ docType, sourceId, extras, regenerate: opts.regenerate, reason: extras.reason }),
    onSuccess: ({ row }) => {
      toast.success(`${row.title} ready — ${row.doc_number}`);
      setPreview(row);
      setPreviewOpen(true);
      qc.invalidateQueries({ queryKey: ["official-documents"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not generate the document"),
  });

  const regenerateExisting = useMutation({
    mutationFn: async (row: OfficialDocRow) => {
      const sid =
        row.payout_id ?? row.agreement_id ?? row.invoice_id ?? row.payment_id ?? row.purchase_order_id ?? row.employee_id ?? row.franchisee_id ?? null;
      const payload = (row.payload ?? {}) as { extras?: Extras };
      return generateDocument({
        docType: row.doc_type as DocTypeKey,
        sourceId: sid,
        extras: payload.extras ?? {},
        regenerate: true,
        reason: "Regenerated from document register",
      });
    },
    onSuccess: ({ row }) => {
      toast.success(`Regenerated ${row.doc_number} (v${row.version})`);
      setPreview(row);
      qc.invalidateQueries({ queryKey: ["official-documents"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Regeneration failed"),
  });

  const options = sourcesQ.data ?? [];
  const filteredDocs = (docsQ.data ?? []).filter((d) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${d.doc_number} ${d.title} ${d.doc_type}`.toLowerCase().includes(q);
  });

  if (!canUse) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Official document generation is restricted to admin, accounts and HR users.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Document Generator</h1>
        <p className="text-sm text-muted-foreground">
          Official MMA documents on the company letterhead, built from live business records.
        </p>
      </div>

      <Card className="p-5 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Document Type</Label>
            <Select
              value={docType}
              onValueChange={(v) => {
                setDocType(v as DocTypeKey);
                setSourceId(null);
                setExtras({});
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowed.map((d) => (
                  <SelectItem key={d.key} value={d.key}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {def.source !== "none" && (
            <div className="space-y-1.5">
              <Label>Source Record</Label>
              <Select value={sourceId ?? ""} onValueChange={setSourceId} disabled={sourcesQ.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={sourcesQ.isLoading ? "Loading records…" : "Select a record"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                      {o.sub ? ` — ${o.sub}` : ""}
                    </SelectItem>
                  ))}
                  {!options.length && !sourcesQ.isLoading && (
                    <SelectItem value="__none" disabled>
                      No records available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <ExtraFields docType={docType} extras={extras} set={set} />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => generate.mutate({})}
            disabled={generate.isPending || (def.source !== "none" && !sourceId)}
            className="bg-gradient-gold text-background"
          >
            {generate.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            Generate document
          </Button>
          <Button variant="outline" onClick={() => generate.mutate({ regenerate: true })} disabled={generate.isPending}>
            Regenerate (new version)
          </Button>
          <span className="text-xs text-muted-foreground">
            Numbering: {def.prefix}-YYYY-0000 · {def.seal ? "company seal applied" : "no company seal on this type"}
          </span>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border/40">
          <h2 className="text-sm font-semibold">Document register</h2>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Search number or type"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="divide-y divide-border/40">
          {docsQ.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading documents…</p>}
          {!docsQ.isLoading && !filteredDocs.length && (
            <p className="p-4 text-sm text-muted-foreground">No documents generated yet.</p>
          )}
          {filteredDocs.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 p-4">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {d.doc_number} — {d.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {DOC_TYPES.find((t) => t.key === d.doc_type)?.label ?? d.doc_type} ·{" "}
                  {format(new Date(d.created_at), "dd MMM yyyy")} · v{d.version}
                </p>
              </div>
              <Badge variant="secondary">{d.status}</Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPreview(d);
                  setPreviewOpen(true);
                }}
              >
                View
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        doc={preview}
        regenerating={regenerateExisting.isPending}
        onRegenerate={() => preview && regenerateExisting.mutate(preview)}
      />
    </div>
  );
}

function ExtraFields({
  docType,
  extras,
  set,
}: {
  docType: DocTypeKey;
  extras: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  const field = (key: string, label: string, type = "text") => (
    <div className="space-y-1.5" key={key}>
      <Label>{label}</Label>
      <Input type={type} value={extras[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
    </div>
  );
  const area = (key: string, label: string, rows = 4) => (
    <div className="space-y-1.5 md:col-span-2" key={key}>
      <Label>{label}</Label>
      <Textarea rows={rows} value={extras[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
    </div>
  );

  switch (docType) {
    case "roi_claim":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Activity Type</Label>
            <Select value={extras.activityType ?? ACTIVITY_TYPES[0]} onValueChange={(v) => set("activityType", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {area("description", "Activity description", 3)}
        </div>
      );
    case "payment_receipt":
      return <div className="grid gap-4 md:grid-cols-2">{field("paymentAgainst", "Payment against (optional)")}</div>;
    case "purchase_order":
      return <div className="grid gap-4 md:grid-cols-2">{field("purpose", "Purchase purpose (optional)")}</div>;
    case "offer_letter":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {field("region", "Region")}
          {field("probationPeriod", "Probation period")}
          {field("probationNotice", "Notice during probation")}
          {field("postConfirmationNotice", "Notice after confirmation")}
          {field("signatoryName", "Authorized signatory name")}
          {field("signatoryDesignation", "Signatory designation")}
          {area("performanceTarget", "Performance target", 3)}
        </div>
      );
    case "franchise_onboarding":
      return <div className="grid gap-4 md:grid-cols-2">{field("onboardingDate", "Onboarding date", "date")}</div>;
    case "franchise_renewal":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {field("newAgreementDate", "New agreement date", "date")}
          {field("newExpiryDate", "New expiry date", "date")}
        </div>
      );
    case "franchise_termination":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {field("terminationDate", "Termination date", "date")}
          {field("outstandingAmount", "Outstanding amount", "number")}
          {field("settlementAmount", "Settlement amount", "number")}
          {area("reason", "Reason for termination", 3)}
        </div>
      );
    case "official_letter":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {field("title", "Letter title (optional)")}
          {field("to", "To")}
          {field("subject", "Subject")}
          {area("body", "Body", 8)}
          {area("attachments", "Attachments (one per line)", 3)}
        </div>
      );
    default:
      return null;
  }
}
