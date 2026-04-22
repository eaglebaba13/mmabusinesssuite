import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-gold shadow-gold">
        <Sparkles className="h-5 w-5 text-background" strokeWidth={2.5} />
      </div>
      <div className="flex flex-col leading-none">
        <span className="font-display text-base font-semibold tracking-tight text-foreground">
          MMA<span className="text-gradient-gold"> Suite</span>
        </span>
        <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
          Business OS
        </span>
      </div>
    </Link>
  );
}
