import * as React from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportDialog } from "./ImportDialog";
import { IMPORT_CONFIGS, type ImportConfigKey } from "@/lib/import-configs";

interface Props {
  configKey: ImportConfigKey;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
  className?: string;
  label?: string;
}

export function ImportButton({
  configKey,
  size = "sm",
  variant = "outline",
  className,
  label = "Import",
}: Props) {
  const [open, setOpen] = React.useState(false);
  const config = IMPORT_CONFIGS[configKey];
  if (!config) return null;
  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)}>
        <Upload className="mr-2 h-3.5 w-3.5" />
        {label}
      </Button>
      <ImportDialog config={config} open={open} onOpenChange={setOpen} />
    </>
  );
}
