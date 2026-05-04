import { Outlet, Link, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { ModeProvider } from "@/lib/mode-context";
import { Toaster } from "@/components/ui/sonner";

interface RouterContext {
  queryClient: QueryClient;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-8xl text-gradient-gold">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:shadow-gold"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MMA Business Suite — Enterprise CRM, ERP & Franchise OS" },
      {
        name: "description",
        content:
          "MMA Business Suite is a luxury all-in-one enterprise platform: CRM, ERP, Academy, Franchisee Management, Webinar Funnels, and White Label SaaS — built for ambitious multi-business operators.",
      },
      { name: "author", content: "MMA Business Suite" },
      { property: "og:title", content: "MMA Business Suite — Enterprise CRM, ERP & Franchise OS" },
      {
        property: "og:description",
        content: "Luxury all-in-one platform for CRM, ERP, Franchise, Academy & White Label.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "MMA Business Suite — Enterprise CRM, ERP & Franchise OS" },
      { name: "description", content: "Luxe Salon Suite is an enterprise-grade SaaS platform automating multi-business operations." },
      { property: "og:description", content: "Luxe Salon Suite is an enterprise-grade SaaS platform automating multi-business operations." },
      { name: "twitter:description", content: "Luxe Salon Suite is an enterprise-grade SaaS platform automating multi-business operations." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bd964fd4-f091-4808-99bd-3e204ec75b0f/id-preview-197ffddc--c6e00624-2a00-4902-b083-04207782db49.lovable.app-1776854167490.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bd964fd4-f091-4808-99bd-3e204ec75b0f/id-preview-197ffddc--c6e00624-2a00-4902-b083-04207782db49.lovable.app-1776854167490.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ModeProvider>
          <Outlet />
          <Toaster richColors position="top-right" theme="dark" />
        </ModeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
