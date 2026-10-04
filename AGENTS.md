# Project Architecture Rules

- Registered franchise and state-franchise partners must read the catalog through authenticated server functions that return only selling fields; base product cost remains protected by row-level access rules.
- Unassigned lead discovery must expose only non-contact preview fields until an atomic server-side claim assigns the lead to a sales user.
- Self-hosted production builds use Nitro's `node-server` preset so Docker/Coolify runs a persistent HTTP server; Lovable sandbox builds retain their platform-managed target.
- Complete storage exports are assembled only by an authenticated Super Admin server endpoint; privileged storage credentials and archive contents never pass through public access.
- Existing franchise login recovery must use a dedicated authenticated server action with ownership checks and compensating rollback; never reset a reused account password.