import * as React from "react";
import { toast } from "sonner";
import { Facebook, Linkedin, Twitter, Link as LinkIcon, MessageCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ShareButtonsProps = {
  url: string;
  title?: string;
  text?: string;
  className?: string;
  variant?: "default" | "compact";
};

/**
 * Social share buttons. Uses the standard share intent URLs for each network,
 * which work without API keys or auth.
 *
 * Instagram is intentionally excluded — Instagram has no public web share
 * intent. For Instagram, users share the link via "Copy link" and paste in
 * their app/story.
 */
export function ShareButtons({
  url,
  title = "",
  text = "",
  className,
  variant = "default",
}: ShareButtonsProps) {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedText = encodeURIComponent(text || title);

  const targets = React.useMemo(
    () => [
      {
        key: "whatsapp",
        label: "WhatsApp",
        icon: MessageCircle,
        href: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
        color: "hover:text-[#25D366]",
      },
      {
        key: "facebook",
        label: "Facebook",
        icon: Facebook,
        href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        color: "hover:text-[#1877F2]",
      },
      {
        key: "twitter",
        label: "X / Twitter",
        icon: Twitter,
        href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        color: "hover:text-foreground",
      },
      {
        key: "linkedin",
        label: "LinkedIn",
        icon: Linkedin,
        href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
        color: "hover:text-[#0A66C2]",
      },
      {
        key: "email",
        label: "Email",
        icon: Mail,
        href: `mailto:?subject=${encodedTitle}&body=${encodedText}%20${encodedUrl}`,
        color: "hover:text-primary",
      },
    ],
    [encodedUrl, encodedTitle, encodedText],
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  };

  if (variant === "compact") {
    return (
      <div className={cn("flex flex-wrap items-center gap-1", className)}>
        {targets.map((t) => (
          <Button
            key={t.key}
            asChild
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8 text-muted-foreground transition-colors", t.color)}
            title={`Share on ${t.label}`}
          >
            <a href={t.href} target="_blank" rel="noopener noreferrer" aria-label={`Share on ${t.label}`}>
              <t.icon className="h-4 w-4" />
            </a>
          </Button>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={copyLink}
          title="Copy link"
          aria-label="Copy link"
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Share</span>
      {targets.map((t) => (
        <Button
          key={t.key}
          asChild
          variant="outline"
          size="sm"
          className={cn("gap-1.5 transition-colors", t.color)}
        >
          <a href={t.href} target="_blank" rel="noopener noreferrer">
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </a>
        </Button>
      ))}
      <Button variant="outline" size="sm" className="gap-1.5" onClick={copyLink}>
        <LinkIcon className="h-3.5 w-3.5" />
        Copy
      </Button>
    </div>
  );
}
