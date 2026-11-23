# Project Status & Work Register
**Make Me Artist (`mmabusinesssuite`)**  
**Classification:** Operational Security & Architecture Standard  
**Last Updated:** November 23, 2026  
**Audited & Approved by:** Principal Software Architect / CTO

---

## 1. Executive Summary & Production Topology

| Component | Identifier / Endpoint | Status |
|---|---|---|
| **Production Domain** | `https://besuite.makemeartist.com` | Live (Coolify Reverse Proxy / Traefik v3.6) |
| **Production VPS** | `root@200.234.35.116` | Active (Host Storage: `/data/coolify/`) |
| **App Container** | `erishzzjey9qqopdtmb05ik9` | Port 3000 internal / TLS via Cloudflare |
| **Supabase Cluster** | `kgyofhcyifrpogdcyugw` | Live Production (`ap-southeast-1`) |
| **Database Pooler** | `aws-0-ap-southeast-1.pooler.supabase.com:5432` | Connected & Verified |
| **Target Git Branch** | `main` (`origin/main`) | Tracking |

---

## 2. Status Register

### DONE (Phase 1 & Phase 2 Verified Deliverables)

- [VERIFIED] **Phase 1: Forensic Audit Report (`docs/FORENSIC_AUDIT_REPORT.md`)**:
  - Re-verified historical audit findings: `employees`, `employee_attendance`, `leave_requests`, `payroll_runs`, `payroll_items`, and `departments` all confirmed at **0 rows**.
  - Verified active business rows: 480 `sales_orders`, 480 `sale_payments`, 652 `sales_order_items`, 477 `invoices`, 55 `roi_claims`, 72 `roi_payouts`, 20 `franchisees`, 25 `franchisee_credentials`, 63 `user_roles`, 31 `products`.
  - Audited 81 public tables, 210 RLS policies, 43 functions, 77 triggers.

- [VERIFIED] **Automated VPS Database Backup (`/root/backup-supabase.sh`)**:
  - Deployed `/root/backup-supabase.sh` (mode `0700`, owner `root:root`).
  - Isolated credentials in `/root/.supabase_backup.env` (mode `0600`, zero exposure to git/web).
  - Configured automated cron schedule: `0 2 * * * /root/backup-supabase.sh >> /var/log/supabase-backup.log 2>&1`.
  - Executed test backup: archive created at `/data/coolify/backups/supabase_backup_20261123_144327Z.sql.gz` (313,607 bytes / ~307 KB compressed).
  - Automated 30-day retention pruning configured (`find ... -mtime +30 -delete`).
  - Complete disaster recovery & restoration runbook authored at `docs/BACKUP_AND_RECOVERY.md`.

- [VERIFIED] **Database Foreign Key Integrity & Performance Indexes (`supabase/migrations/20261123145000_phase2_fk_indexes.sql`)**:
  - `employees_user_id_fkey`: `public.employees.user_id` -> `auth.users(id)` (`ON DELETE SET NULL`) applied & verified.
  - `employees_reporting_to_fkey`: `public.employees.reporting_to` -> `public.employees(id)` (`ON DELETE SET NULL`) applied & verified.
  - `departments_head_employee_id_fkey`: `public.departments.head_employee_id` -> `public.employees(id)` (`ON DELETE SET NULL`) applied & verified.
  - Performance indexes verified: `idx_state_franchises_user_id`, `idx_franchisee_documents_uploaded_by`, and `idx_social_lead_events_lead_id`.

- [VERIFIED] **HR PII Protection & Projection Segregation (`src/routes/app.hr.employees.tsx`)**:
  - Eliminated raw `select("*")` over-permissive network exposure. Replaced with explicit non-sensitive operational projection.
  - Isolated sensitive identity/banking fields (`pan`, `aadhar`, `bank_account`, `bank_ifsc`) to single-record, on-demand queries.
  - Enforced role check (`hr`, `super_admin`, `founder`) before exposing KYC/banking details.
  - Implemented client-side masking utilities (`maskIdentity`) and confidential password-style inputs.
  - Comprehensive security documentation published at `docs/SECURITY_AUDIT.md`.

- [VERIFIED] **React Hook Rules Compliance**:
  - Fixed conditional `React.useState` in `src/routes/invoice.$token.tsx` (moved above early return).
  - Fixed hook-in-lowercase-component in `src/routes/app.academy.batches.$batchId.tsx` (extracted `BatchErrorComponent`).

---

### DOING (Phase 2 Deployment & Release)
- Final typecheck verification, commit to `main`, push to GitHub, Coolify redeployment on VPS, and live endpoint verification.

---

### TODO (Upcoming Phase 3 & Subsequent Milestones)
- **Phase 3: Database Cryptographic Storage**:
  - Integrate PostgreSQL `pgcrypto` / Supabase Vault column encryption for PAN, Aadhaar, Bank details.
  - Implement blind HMAC-SHA256 indexing for searchable encrypted KYC.
- **Phase 4: Automated Testing & Continuous Verification**:
  - Vitest / Playwright test harnesses for invoice generation and franchise commission settlement.
- **Phase 5: Commercial Ledger Hardening**:
  - Strict audit logging triggers on `sales_orders`, `invoices`, and `roi_payouts`.

---

### BLOCKED / EXTERNAL DEPENDENCIES
- *None*.
