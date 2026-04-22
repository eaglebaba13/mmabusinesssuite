import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import heroBg from "@/assets/hero-bg.jpg";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — MMA Business Suite" },
      { name: "description", content: "Sign in to your MMA Business Suite workspace." },
    ],
    links: [
      { rel: "preload", as: "image", href: heroBg, fetchpriority: "high" } as unknown as Record<string, string>,
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (isAuthenticated) navigate({ to: "/app/dashboard" });
  }, [isAuthenticated, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back.");
    navigate({ to: "/app/dashboard" });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        className="absolute inset-0 -z-10 opacity-50"
        style={{ backgroundImage: `url(${heroBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/60 via-background/85 to-background" />

      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
        <div className="mb-8">
          <Logo />
        </div>
        <div className="w-full rounded-2xl glass-strong p-8 shadow-gold-lg">
          <h1 className="font-display text-3xl">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your workspace.</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 bg-background/60"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 bg-background/60"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-gradient-gold text-background hover:shadow-gold">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            New to MMA Suite?{" "}
            <Link to="/signup" className="font-medium text-gold hover:underline">
              Create an account
            </Link>
          </p>
        </div>
        <Link to="/" className="mt-6 text-xs text-muted-foreground hover:text-foreground">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
