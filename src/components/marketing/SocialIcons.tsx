import { Facebook, Instagram, Linkedin, Twitter, Youtube, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Org = {
  facebook_url?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
  linkedin_url?: string | null;
  twitter_url?: string | null;
  whatsapp_number?: string | null;
};

const ICON_MAP = [
  { key: "facebook", field: "facebook_url" as const, icon: Facebook, label: "Facebook", color: "hover:text-[#1877F2]" },
  { key: "instagram", field: "instagram_url" as const, icon: Instagram, label: "Instagram", color: "hover:text-[#E4405F]" },
  { key: "youtube", field: "youtube_url" as const, icon: Youtube, label: "YouTube", color: "hover:text-[#FF0000]" },
  { key: "linkedin", field: "linkedin_url" as const, icon: Linkedin, label: "LinkedIn", color: "hover:text-[#0A66C2]" },
  { key: "twitter", field: "twitter_url" as const, icon: Twitter, label: "X / Twitter", color: "hover:text-foreground" },
];

export function SocialIcons({ org, className }: { org: Org | null | undefined; className?: string }) {
  if (!org) return null;
  const items = ICON_MAP.filter((i) => org[i.field]);
  const wa = org.whatsapp_number?.trim();

  if (items.length === 0 && !wa) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {items.map((i) => (
        <a
          key={i.key}
          href={org[i.field]!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={i.label}
          className={cn("text-muted-foreground transition-colors", i.color)}
        >
          <i.icon className="h-4 w-4" />
        </a>
      ))}
      {wa && (
        <a
          href={`https://wa.me/${wa.replace(/[^0-9]/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp"
          className="text-muted-foreground transition-colors hover:text-[#25D366]"
        >
          <MessageCircle className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}
