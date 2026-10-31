// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, Nitro (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// When EXTERNAL_BACKEND_* secrets exist, point both browser and server clients at that backend.
const ext = {
  url: process.env.EXTERNAL_BACKEND_URL?.replace(/\/$/, ""),
  anon: process.env.EXTERNAL_BACKEND_ANON_KEY,
  service: process.env.EXTERNAL_BACKEND_SERVICE_KEY,
};
if (ext.url && ext.anon) {
  process.env.VITE_SUPABASE_URL = ext.url;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = ext.anon;
  process.env.VITE_SUPABASE_ANON_KEY = ext.anon;
  process.env.VITE_SUPABASE_PROJECT_ID = new URL(ext.url).hostname.split(".")[0];
  process.env.SUPABASE_URL = ext.url;
  process.env.SUPABASE_PUBLISHABLE_KEY = ext.anon;
  if (ext.service) process.env.SUPABASE_SERVICE_ROLE_KEY = ext.service;
}

export default defineConfig({
  nitro: {
    preset: "node-server",
  },
});
