# Security Audit & PII Protection Specification
**Make Me Artist (`mmabusinesssuite`)**  
**Classification:** Confidential / Application Security Standard  
**Last Updated:** November 23, 2026  
**Audited & Approved by:** Principal Software Architect / CTO

---

## 1. Executive Summary

This security audit formalizes the security architecture, Personally Identifiable Information (PII) protections, and access control policies implemented across the Make Me Artist Business Suite. It addresses critical forensic audit findings regarding plaintext identity storage, over-permissive query projections, and access controls.

---

## 2. PII Exposure Analysis & Mitigation

### 2.1 Discovered Plaintext Identity Columns
During the forensic database audit of Supabase project `kgyofhcyifrpogdcyugw`, the `public.employees` table was verified to possess raw, unencrypted columns for government IDs and banking instruments:
- `pan`: Indian Permanent Account Number (`text`, 10 characters)
- `aadhar`: Indian Unique Identification Number (`text`, 12 digits)
- `bank_account`: Employee Bank Account Number (`text`)
- `bank_ifsc`: Bank Indian Financial System Code (`text`, 11 characters)

### 2.2 Wire Exposure Vulnerability (Raw `select("*")`)
- **Finding [VERIFIED]:** In `src/routes/app.hr.employees.tsx` (line 76), employee directory queries previously executed:
  ```typescript
  supabase.from("employees").select("*, departments(name, code)")
  ```
- **Risk Assessment:** High. Even though the UI only displayed code, name, designation, department, and salary, the entire payload including PAN, Aadhaar, and bank account numbers was transmitted in plaintext across the public network into client browser memory.
- **Remediation Implemented (Phase 2):**
  1. **Projection Segregation:** The global employee list query has been replaced with an explicit operational field selection (`id, employee_code, full_name, email, phone, designation, department_id, employment_type, status, date_of_joining, monthly_ctc, basic_salary, hra, allowances, city, state, created_at, departments(name, code)`). High-risk identity columns are strictly excluded from list payloads.
  2. **Role-Gated On-Demand KYC Fetch:** KYC and banking details are only queried for single records upon explicit modal interaction, and only if the authenticated user holds an authorized role (`hr`, `super_admin`, or `founder`).
  3. **Client-Side Masking & Obfuscation:** Values are displayed masked by default with password-masked input fields (`••••••••••`) and explicit reveal controls.

### 2.3 Standardized Identity Masking Formulas
| Field | Plaintext Format | Masked Display Format | Masking Algorithm |
|---|---|---|---|
| **PAN** | `ABCDE1234F` | `AB•••••4F` | First 2 characters + 5 dots + last 2 characters |
| **Aadhaar** | `123456789012` | `XXXX-XXXX-9012` | Static prefix + last 4 digits |
| **Bank Account** | `123456789012345` | `••••••••2345` | Static bullets + last 4 digits |
| **IFSC Code** | `SBIN0001234` | Full or Masked | Uppercase standardized |

---

## 3. Database Integrity & Foreign Key Hardening

In Phase 2, referential integrity was restored to prevent orphaned records in commercial workflows:
1. `public.employees.user_id` -> `auth.users(id)` with `ON DELETE SET NULL`
2. `public.employees.reporting_to` -> `public.employees(id)` with `ON DELETE SET NULL`
3. `public.departments.head_employee_id` -> `public.employees(id)` with `ON DELETE SET NULL`

### Query Performance & Lookup Indexes
The following btree indexes were verified to eliminate full table scans during franchise and CRM event lookups:
- `idx_state_franchises_user_id` on `public.state_franchises (user_id)`
- `idx_franchisee_documents_uploaded_by` on `public.franchisee_documents (uploaded_by)`
- `idx_social_lead_events_lead_id` on `public.social_lead_events (lead_id)`

---

## 4. Encryption Roadmap (Phase 3 Architecture)

While Phase 2 enforces wire-level projection segregation and UI masking, Phase 3 will introduce cryptographic data-at-rest encryption inside PostgreSQL:

### 4.1 Pgcrypto Column-Level Encryption Plan
- Symmetric AES-256 encryption using Supabase Vault or KMS-managed application keys.
- Deterministic blind index (`hmac-sha256`) for PAN searchability without decrypting full records.

```sql
-- Conceptual Phase 3 implementation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypted column migration
ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS pan_encrypted bytea,
  ADD COLUMN IF NOT EXISTS aadhar_encrypted bytea,
  ADD COLUMN IF NOT EXISTS bank_account_encrypted bytea;
```

---

## 5. Row-Level Security (RLS) Policy Status

- Total Public Tables: 81
- Public RLS Policies: 210 active policies
- Zero Disabled Policies: RLS remains enabled across all commercial and operational tables.
- Franchise Isolation: Verified that franchisee queries filter on `franchisee_id` or user ownership context.
