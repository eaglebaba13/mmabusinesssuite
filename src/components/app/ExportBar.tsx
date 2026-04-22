import { Download, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ExportBarProps {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onCSV: () => void;
  onPDF: () => void;
  showDateRange?: boolean;
  count?: number;
}

export function ExportBar({ from, to, onFromChange, onToChange, onCSV, onPDF, showDateRange = true, count }: ExportBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border/50 bg-card/30 p-3">
      {showDateRange && (
        <>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
            <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
            <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className="h-9 w-40" />
          </div>
        </>
      )}
      <div className="ml-auto flex items-center gap-2">
        {count !== undefined && (
          <span className="mr-1 text-xs text-muted-foreground">
            <Download className="mr-1 inline h-3 w-3" />{count} rows
          </span>
        )}
        <Button size="sm" variant="outline" onClick={onCSV} className="h-9">
          <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />CSV
        </Button>
        <Button size="sm" variant="outline" onClick={onPDF} className="h-9">
          <FileText className="mr-1 h-3.5 w-3.5" />PDF
        </Button>
      </div>
    </div>
  );
}
