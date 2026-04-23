import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportBar } from "@/components/app/ExportBar";
import { defaultDateRange, exportToCSV, exportToPDF, inDateRange } from "@/lib/export";
import { ImportButton } from "@/components/app/ImportButton";

export const Route = createFileRoute("/app/academy/certificates")({
  head: () => ({ meta: [{ title: "Certificates — Academy" }] }),
  component: CertificatesPage,
});

function CertificatesPage() {
  const [range, setRange] = React.useState(defaultDateRange());

  const certs = useQuery({
    queryKey: ["certificates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("certificates")
        .select("*, enrollments(students(full_name), batches(batch_code, courses(title)))")
        .order("issued_on", { ascending: false });
      return data ?? [];
    },
  });

  const list = (certs.data ?? []).filter((c: any) => inDateRange(c.issued_on, range.from, range.to));

  const exportCols = [
    { header: "Code", accessor: (c: any) => c.certificate_code },
    { header: "Student", accessor: (c: any) => c.enrollments?.students?.full_name ?? "" },
    { header: "Course", accessor: (c: any) => c.enrollments?.batches?.courses?.title ?? "" },
    { header: "Batch", accessor: (c: any) => c.enrollments?.batches?.batch_code ?? "" },
    { header: "Grade", accessor: (c: any) => c.grade ?? "" },
    { header: "Issued", accessor: (c: any) => c.issued_on ?? "" },
    { header: "Remarks", accessor: (c: any) => c.remarks ?? "" },
  ];
  const fileBase = `certificates_${range.from}_to_${range.to}`;
  const onCSV = () => exportToCSV(fileBase, list, exportCols);
  const onPDF = () =>
    exportToPDF({
      filename: fileBase,
      title: "Issued Certificates",
      subtitle: `${range.from} → ${range.to}`,
      rows: list,
      columns: exportCols,
      totals: [{ label: "Total certificates", value: String(list.length) }],
    });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-xl">Certificates</h2>
          <p className="text-sm text-muted-foreground">All issued completion certificates.</p>
        </div>
        <ImportButton configKey="certificates" />
      </div>
      <ExportBar
        from={range.from}
        to={range.to}
        onFromChange={(v) => setRange({ ...range, from: v })}
        onToChange={(v) => setRange({ ...range, to: v })}
        onCSV={onCSV}
        onPDF={onPDF}
        count={list.length}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((c: any) => (
          <Card key={c.id} className="glass hover-gold-glow group p-5">
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-gold shadow-gold">
                <Award className="h-5 w-5 text-background" />
              </div>
              <Badge variant="outline" className="border-primary/40 text-primary">{c.grade ?? "—"}</Badge>
            </div>
            <div className="mt-3 font-mono text-xs text-primary">{c.certificate_code}</div>
            <h3 className="mt-1 font-display text-lg">{c.enrollments?.students?.full_name ?? "—"}</h3>
            <p className="text-sm text-muted-foreground">{c.enrollments?.batches?.courses?.title ?? "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Batch {c.enrollments?.batches?.batch_code} · Issued {c.issued_on}</p>
            <Link to="/verify/$code" params={{ code: c.certificate_code }} className="mt-3 inline-block">
              <Button size="sm" variant="outline">Verify <ExternalLink className="ml-1 h-3 w-3" /></Button>
            </Link>
          </Card>
        ))}
        {list.length === 0 && (
          <Card className="col-span-full p-10 text-center text-muted-foreground">No certificates in this date range.</Card>
        )}
      </div>
    </div>
  );
}
