import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildErrorsCsv,
  buildTemplateCsv,
  downloadCsv,
  parseFile,
  validateRows,
  type ImportConfig,
  type ParsedRow,
} from "@/lib/import";
import { fetchLookups } from "@/lib/import-configs";

type Step = "intro" | "preview" | "done";

interface Props {
  config: ImportConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BATCH_SIZE = 500;

export function ImportDialog({ config, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = React.useState<Step>("intro");
  const [filename, setFilename] = React.useState<string>("");
  const [parsing, setParsing] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [rows, setRows] = React.useState<ParsedRow[]>([]);
  const [insertedCount, setInsertedCount] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const validRows = React.useMemo(() => rows.filter((r) => r.data && !r.error), [rows]);
  const invalidRows = React.useMemo(() => rows.filter((r) => r.error), [rows]);

  // Reset whenever the dialog reopens.
  React.useEffect(() => {
    if (open) {
      setStep("intro");
      setFilename("");
      setRows([]);
      setInsertedCount(0);
    }
  }, [open]);

  const handleTemplate = () => {
    downloadCsv(`import-template-${config.entity}.csv`, buildTemplateCsv(config));
  };

  const handlePick = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setParsing(true);
    try {
      const { rows: parsed } = await parseFile(file, config);
      if (parsed.length === 0) {
        toast.error("File is empty or has no recognisable columns.");
        setParsing(false);
        return;
      }
      const lookups = await fetchLookups(config.entity);
      const validated = await validateRows(parsed, config, { lookups });
      setRows(validated);
      setStep("preview");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not parse file");
    } finally {
      setParsing(false);
      // Allow re-uploading the same file
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }
    setImporting(true);
    let inserted = 0;
    try {
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const chunk = validRows.slice(i, i + BATCH_SIZE).map((r) => r.data!);
        const { error } = await (supabase as any).from(config.table).insert(chunk);
        if (error) throw error;
        inserted += chunk.length;
        setInsertedCount(inserted);
      }

      // Audit log (best-effort)
      const { data: u } = await supabase.auth.getUser();
      if (u.user?.id) {
        await supabase.from("audit_logs").insert({
          user_id: u.user.id,
          action: "bulk_import",
          entity: config.table,
          metadata: { count: inserted, filename },
        });
      }

      toast.success(`Imported ${inserted} ${config.label.toLowerCase()}`);
      config.invalidateKeys?.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      setStep("done");
    } catch (err: any) {
      toast.error(err?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadErrors = () => {
    if (invalidRows.length === 0) return;
    downloadCsv(
      `import-errors-${config.entity}-${format(new Date(), "yyyy-MM-dd")}.csv`,
      buildErrorsCsv(invalidRows),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import {config.label.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file. Required columns are marked with an asterisk in the template.
          </DialogDescription>
        </DialogHeader>

        {step === "intro" && (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-border/60 bg-card/40 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Download className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">Step 1 — Download the template</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Get a CSV with all supported columns and one example row.
                  </p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={handleTemplate}>
                    <Download className="mr-2 h-3.5 w-3.5" /> Download template
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-card/40 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Upload className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">Step 2 — Upload your file</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Accepts .csv, .xlsx, or .xls. Empty rows are skipped automatically.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={handleFile}
                  />
                  <Button size="sm" className="mt-3" onClick={handlePick} disabled={parsing}>
                    {parsing ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                    )}
                    {parsing ? "Parsing…" : "Choose file"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Supported columns</p>
              <p className="mt-1">
                {config.columns
                  .map((c) => (c.required ? `${c.key}*` : c.key))
                  .join(", ")}
              </p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                {validRows.length} valid
              </Badge>
              {invalidRows.length > 0 && (
                <Badge variant="outline" className="border-rose-500/40 text-rose-400">
                  <AlertCircle className="mr-1 h-3 w-3" />
                  {invalidRows.length} invalid
                </Badge>
              )}
              <Badge variant="outline">{filename}</Badge>
            </div>

            <div className="max-h-[40vh] overflow-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Row</TableHead>
                    <TableHead className="w-16">Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((r) => (
                    <TableRow key={r.rowNumber}>
                      <TableCell className="text-muted-foreground">{r.rowNumber}</TableCell>
                      <TableCell>
                        {r.error ? (
                          <Badge variant="outline" className="border-rose-500/40 text-rose-400">
                            Error
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
                            OK
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.error ? (
                          <span className="text-rose-400">{r.error}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            {Object.values(r.raw).filter((v) => v !== null && v !== "").slice(0, 3).join(" · ")}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 50 && (
                <p className="px-3 py-2 text-center text-xs text-muted-foreground">
                  Showing first 50 of {rows.length} rows.
                </p>
              )}
            </div>

            {invalidRows.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleDownloadErrors}>
                <Download className="mr-2 h-3.5 w-3.5" /> Download invalid rows
              </Button>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3 py-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            </div>
            <h3 className="font-display text-xl">Import complete</h3>
            <p className="text-sm text-muted-foreground">
              {insertedCount} {config.label.toLowerCase()} added.
            </p>
            {invalidRows.length > 0 && (
              <p className="text-xs text-amber-400">
                {invalidRows.length} row(s) skipped — download them above to fix and re-upload.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "intro" && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="ghost" onClick={() => setStep("intro")} disabled={importing}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={importing || validRows.length === 0}>
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Importing {insertedCount}/{validRows.length}…
                  </>
                ) : (
                  <>Import {validRows.length} valid row{validRows.length === 1 ? "" : "s"}</>
                )}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
