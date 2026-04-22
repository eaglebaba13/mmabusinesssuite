import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/app/")({
  component: () => (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Link to="/app/dashboard" className="font-display text-2xl text-gradient-gold">
        Open Dashboard →
      </Link>
    </div>
  ),
});
