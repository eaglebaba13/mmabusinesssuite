import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/40 bg-background">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-4 md:px-6">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-muted-foreground">
            The luxury operating system for ambitious multi-business empires.
          </p>
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
