
DO $$ BEGIN CREATE TYPE public.entity_type AS ENUM ('company','state_franchise','city_franchise','academy','dark_store','salon_branch','department');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.company_type AS ENUM ('group','distributor','retailer','operator');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.invoice_doc_type AS ENUM ('b2b_tax','b2c','proforma','quotation','receipt','credit_note','debit_note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.impersonation_mode AS ENUM ('read_only','read_write');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.invoice_status AS ENUM ('draft','issued','cancelled','revised','paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_direction AS ENUM ('in','out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ledger_status AS ENUM ('accrued','approved','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'academy_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dark_store_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'salon_branch_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'auditor';

ALTER TABLE public.state_franchises ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.franchisees ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS is_student_product boolean NOT NULL DEFAULT false;
