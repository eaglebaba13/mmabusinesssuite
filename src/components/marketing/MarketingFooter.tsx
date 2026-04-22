import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "@/components/brand/Logo";
import { SocialIcons } from "@/components/marketing/SocialIcons";
import { supabase } from "@/integrations/supabase/client";

export function MarketingFooter() {
  const { data: org } = useQuery({
    queryKey: ["org-settings-public"],
    queryFn: async () => {
      const { data } = await supabase
        .from("org_settings")
        .select("facebook_url, instagram_url, youtube_url, linkedin_url, twitter_url, whatsapp_number")
        .eq("id", 1)
        .maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });

  return (
    <footer className="border-t border-border/40 bg-background">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-4 md:px-6">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-muted-foreground">
            The luxury operating system for ambitious multi-business empires.
          </p>
          <SocialIcons org={org} className="pt-2" />
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold text-foreground">Product</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/" className="hover:text-foreground">Overview</Link></li>
            <li><Link to="/pricing" className="hover:text-foreground">Pricing</Link></li>
            <li><Link to="/login" className="hover:text-foreground">Sign in</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold text-foreground">Modules</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>CRM & Lead Pipeline</li>
            <li>Franchise Management</li>
            <li>Academy & Webinars</li>
            <li>Inventory & Dark Stores</li>
            <li>White Label SaaS</li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold text-foreground">Company</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>About</li>
            <li>Careers</li>
            <li>Privacy</li>
            <li>Terms</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} MMA Business Suite. Crafted for ambitious operators.
      </div>
    </footer>
  );
}
