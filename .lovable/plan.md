# Node production target for Coolify

## Goal
Produce a persistent Node.js server for self-hosted production builds while preserving Lovable preview builds and all application behavior.

## Changes
- Set the Lovable Vite wrapper’s explicit Nitro production preset to `node-server`.
- Leave the existing TanStack Start plugins, Lovable preview behavior, UI, HR module, backend integration, credentials, and `wrangler.jsonc` unchanged.
- Record the production target as a project architecture rule.

## Verification
- Run the existing production build.
- Confirm `.output/server/index.mjs` exists.
- Confirm `.output/nitro.json` is not `cloudflare-module` and reports the Node server target.
- Start the output with `HOST=0.0.0.0 PORT=3000 node .output/server/index.mjs`, verify it stays alive and responds over HTTP, then stop only the test process.
- Check the latest preview build diagnostics for regressions.

## Technical detail
The installed Lovable configuration package explicitly supports `defineConfig({ nitro: { preset: "…" } })` outside Lovable’s sandbox. Lovable’s own hosted build continues to pin its required Cloudflare preset internally, so this one override supports both deployment environments without adding another framework or Docker configuration.
