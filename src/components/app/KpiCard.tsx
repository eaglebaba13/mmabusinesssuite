import { motion } from "framer-motion";
import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: number;
  icon?: LucideIcon;
  delay?: number;
  hint?: string;
}

export function KpiCard({ label, value, delta, icon: Icon, delay = 0, hint }: KpiCardProps) {
  const isUp = (delta ?? 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="group relative overflow-hidden rounded-2xl glass p-5 hover-gold-glow"
    >
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        {Icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-gold shadow-gold">
            <Icon className="h-4 w-4 text-background" />
          </div>
        )}
      </div>
      <div className="mt-4 font-display text-3xl text-gradient-gold">{value}</div>
      <div className="mt-2 flex items-center justify-between text-xs">
        {delta !== undefined ? (
          <span className={cn("flex items-center gap-1 font-medium", isUp ? "text-emerald-400" : "text-rose-400")}>
            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        ) : <span />}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
    </motion.div>
  );
}
