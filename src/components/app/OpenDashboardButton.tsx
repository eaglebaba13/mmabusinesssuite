import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { startImpersonation } from "@/server/impersonation.functions";
import { toast } from "sonner";

interface Props {
  entity_type: "state_franchise" | "city_franchise" | "academy" | "dark_store" | "salon_branch" | "company";
  entity_id: string;
  label?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary" | "ghost";
}

export function OpenDashboardButton({ entity_type, entity_id, label = "Open Dashboard", size = "sm", variant = "outline" }: Props) {
  const start = useServerFn(startImpersonation);
  const navigate = useNavigate();

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      const res = await start({ data: { entity_type, entity_id, mode: "read_only" } });
      const url = `/imp/${res.token}`;
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Button size={size} variant={variant} onClick={onClick} className="gap-2">
      <ExternalLink className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}
