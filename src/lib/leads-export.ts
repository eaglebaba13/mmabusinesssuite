import { format } from "date-fns";

interface LeadRow {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  source?: string | null;
  stage?: string | null;
  score?: number | null;
  created_at: string;
}

function escape(v: unknown) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportLeadsCsv(leads: LeadRow[], franchiseeName: string) {
  const cols = ["Name", "Phone", "Email", "City", "Source", "Stage", "Score", "Created"];
  const header = cols.join(",");
  const body = leads
    .map((l) =>
      [
        escape(l.full_name),
        escape(l.phone ?? ""),
        escape(l.email ?? ""),
        escape(l.city ?? ""),
        escape(l.source ?? ""),
        escape(l.stage ?? ""),
        escape(l.score ?? 0),
        escape(format(new Date(l.created_at), "yyyy-MM-dd HH:mm")),
      ].join(","),
    )
    .join("\n");
  const csv = `${header}\n${body}`;
  const safeName = franchiseeName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const filename = `leads-${safeName}-${format(new Date(), "yyyy-MM-dd")}.csv`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
