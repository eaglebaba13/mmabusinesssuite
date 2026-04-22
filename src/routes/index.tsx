import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  TrendingUp,
  Users,
  Building2,
  GraduationCap,
  ShoppingBag,
  Video,
  Sparkles,
  ShieldCheck,
  Zap,
  BarChart3,
} from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MMA Business Suite — Luxury Enterprise Operating System" },
      {
        name: "description",
        content:
          "All-in-one CRM, ERP, Franchise, Academy, Webinar & White Label SaaS for India's most ambitious multi-business empires. Built for scale.",
      },
      { property: "og:title", content: "MMA Business Suite — Luxury Enterprise OS" },
      {
        property: "og:description",
        content: "CRM, ERP, Franchise, Academy & White Label — one luxury platform.",
      },
      { property: "og:image", content: heroBg },
      { name: "twitter:image", content: heroBg },
    ],
  }),
  component: LandingPage,
});

const KPI_STRIP = [
  { value: "₹1,200Cr+", label: "GMV processed" },
  { value: "8,400+", label: "Active leads" },
  { value: "320+", label: "Franchisees onboarded" },
  { value: "99.98%", label: "Platform uptime" },
];

const MODULES = [
  {
    icon: Users,
    title: "Lead CRM",
    desc: "AI-scored pipelines, omni-channel capture, drag-and-drop kanban, sales-rep allocation by territory.",
  },
  {
    icon: Building2,
    title: "Franchise Management",
    desc: "End-to-end franchisee onboarding, ROI ledger, incentive automation, document vault, ticket SLAs.",
  },
  {
    icon: GraduationCap,
    title: "Academy",
    desc: "Course catalogue, batches, student lifecycle, fees, certificates, trainer payouts — fully integrated.",
  },
  {
    icon: ShoppingBag,
    title: "Emporium & Dark Store",
    desc: "Inventory across hubs, low-stock alerts, transfers, GST-compliant invoicing, real-time sell-through.",
  },
  {
    icon: Video,
    title: "Webinar Funnel",
    desc: "Registration pages, Zoom sync, attendee scoring, replay funnels, automated follow-ups.",
  },
  {
    icon: Sparkles,
    title: "White Label SaaS",
    desc: "Tenant-isolated workspaces, custom domain & branding, sub-admin impersonation, per-client billing.",
  },
];

const FEATURES = [
  { icon: ShieldCheck, title: "Enterprise security", desc: "Row-level security, role-based access, audit logs on every sensitive action." },
  { icon: Zap, title: "AI-native workflows", desc: "AI lead scoring, ad-copy generation, summary automation built into core." },
  { icon: BarChart3, title: "Real-time intelligence", desc: "Live KPIs across territories, sales reps, franchises, payouts and inventory." },
];

const TESTIMONIALS = [
  {
    quote:
      "We moved from 14 disconnected spreadsheets to a single source of truth in three weeks. ROI tracking that used to take a week now takes a click.",
    name: "Rajiv Mehta",
    role: "Founder, Mall of Salon",
  },
  {
    quote:
      "The franchise dashboard alone justified the platform. Our investors finally trust the numbers — and that trust unlocked our next funding round.",
    name: "Ananya Kapoor",
    role: "COO, MakeMeArtist",
  },
  {
    quote:
      "Looks like a Fortune 500 product, runs like one too. Sales reps stopped complaining and started closing.",
    name: "Vikram Shah",
    role: "VP Sales, North Region",
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage: `url(${heroBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/70 to-background" />

        <div className="mx-auto max-w-7xl px-4 py-24 md:px-6 md:py-36">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="mx-auto max-w-4xl text-center"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
              Enterprise OS · Built in India
            </div>
            <h1 className="font-display text-5xl font-semibold leading-[1.05] md:text-7xl lg:text-8xl">
              Run an empire,<br />
              <span className="text-gradient-gold">not a spreadsheet.</span>
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-lg text-muted-foreground md:text-xl">
              MMA Business Suite is the luxury operating system for multi-business operators —
              CRM, ERP, Franchise, Academy, Webinar & White Label SaaS in one cinematic interface.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="bg-gradient-gold text-background hover:shadow-gold-lg group">
                <Link to="/signup">
                  Start free trial
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-border text-foreground hover:bg-accent/10">
                <Link to="/pricing">View pricing</Link>
              </Button>
            </div>
          </motion.div>

          {/* KPI strip */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mx-auto mt-20 grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-2xl glass-strong md:grid-cols-4"
          >
            {KPI_STRIP.map((k) => (
              <div key={k.label} className="px-6 py-7 text-center">
                <div className="font-display text-3xl text-gradient-gold md:text-4xl">{k.value}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{k.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* MODULES */}
      <section className="border-t border-border/40 py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-gold">The Suite</p>
            <h2 className="mt-3 font-display text-4xl md:text-5xl">
              Six businesses. <span className="text-gradient-gold">One platform.</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every module is purpose-built for the way Indian multi-business empires actually
              operate — not a translation of a US SaaS template.
            </p>
          </div>

          <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m, i) => (
              <motion.div
                key={m.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="group relative rounded-2xl glass p-7 hover-gold-glow"
              >
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-gold shadow-gold">
                  <m.icon className="h-6 w-6 text-background" />
                </div>
                <h3 className="font-display text-xl">{m.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="relative border-t border-border/40 py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="grid gap-12 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <f.icon className="h-8 w-8 text-gold" />
                <h3 className="mt-4 font-display text-2xl">{f.title}</h3>
                <p className="mt-2 text-muted-foreground">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="relative border-t border-border/40 bg-card/30 py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-gold">Trusted by operators</p>
            <h2 className="mt-3 font-display text-4xl md:text-5xl">
              The chosen platform of <span className="text-gradient-gold">India's boldest brands.</span>
            </h2>
          </div>
          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="rounded-2xl glass p-7">
                <p className="text-sm leading-relaxed text-foreground">"{t.quote}"</p>
                <div className="mt-6 border-t border-border pt-4">
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/40 py-24 md:py-32">
        <div className="mx-auto max-w-4xl px-4 text-center md:px-6">
          <TrendingUp className="mx-auto h-10 w-10 text-gold" />
          <h2 className="mt-6 font-display text-4xl md:text-6xl">
            Your <span className="text-gradient-gold">₹100Cr</span> infrastructure is one click away.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-muted-foreground">
            Spin up your workspace in 60 seconds. Onboard your first franchisee today.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-gradient-gold text-background hover:shadow-gold-lg">
              <Link to="/signup">Get started — free</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
