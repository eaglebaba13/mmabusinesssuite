import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Sparkles } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — MMA Business Suite" },
      {
        name: "description",
        content: "Three transparent plans — Starter, Growth & Enterprise White-Label. Pay for outcomes, not seats.",
      },
      { property: "og:title", content: "Pricing — MMA Business Suite" },
      { property: "og:description", content: "Transparent plans for ambitious multi-business operators." },
    ],
  }),
  component: PricingPage,
});

const PLANS = [
  {
    name: "Starter",
    price: "₹14,999",
    period: "/month",
    desc: "For founders launching their first vertical.",
    features: [
      "Up to 5 team members",
      "Lead CRM with AI scoring",
      "1 franchise (no white-label)",
      "Academy module",
      "Basic dashboards",
      "Email support",
    ],
    cta: "Start trial",
    highlighted: false,
  },
  {
    name: "Growth",
    price: "₹49,999",
    period: "/month",
    desc: "For scaling brands with multiple verticals.",
    features: [
      "Up to 25 team members",
      "Everything in Starter",
      "Up to 25 franchisees + ROI engine",
      "Inventory & dark stores",
      "Webinar funnel + Zoom sync",
      "WhatsApp / Meta / Google ad sync",
      "Priority support",
    ],
    cta: "Start trial",
    highlighted: true,
  },
  {
    name: "Enterprise White-Label",
    price: "Custom",
    period: "",
    desc: "For investors building their own SaaS.",
    features: [
      "Unlimited team & franchisees",
      "Multi-tenant white label",
      "Custom domain & full branding",
      "Per-tenant billing & impersonation",
      "Dedicated success manager",
      "99.99% uptime SLA",
      "On-prem & private cloud options",
    ],
    cta: "Talk to sales",
    highlighted: false,
  },
];

function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />

      <section className="relative overflow-hidden py-20 md:py-28">
        <div className="absolute inset-0 -z-10 bg-gradient-noir" />
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-gold" /> Pricing
            </div>
            <h1 className="font-display text-5xl md:text-6xl">
              Pay for <span className="text-gradient-gold">outcomes</span>, not seats.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Three plans. Honest pricing. Unlimited ambition.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-6xl gap-6 md:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`relative rounded-2xl p-8 ${
                  p.highlighted
                    ? "glass-strong shadow-gold-lg border-gold/40"
                    : "glass"
                }`}
              >
                {p.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-gold px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-background">
                    Most Popular
                  </div>
                )}
                <h3 className="font-display text-2xl">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-5xl text-gradient-gold">{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.period}</span>
                </div>
                <Button
                  asChild
                  className={`mt-6 w-full ${
                    p.highlighted
                      ? "bg-gradient-gold text-background hover:shadow-gold"
                      : "bg-card border border-gold/40 text-foreground hover:bg-accent/10"
                  }`}
                >
                  <Link to="/signup">{p.cta}</Link>
                </Button>
                <ul className="mt-7 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-12 text-center text-sm text-muted-foreground">
            All plans include 14-day free trial • No credit card required • Cancel anytime
          </p>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
