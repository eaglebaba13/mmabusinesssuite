-- Phase 2: Security & Integrity Hardening - Foreign Keys and Lookup Indexes
-- 1. Foreign Key: employees.user_id -> auth.users(id) ON DELETE SET NULL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_user_id_fkey'
    ) THEN
        ALTER TABLE public.employees
            ADD CONSTRAINT employees_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 2. Foreign Key: employees.reporting_to -> public.employees(id) ON DELETE SET NULL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_reporting_to_fkey'
    ) THEN
        ALTER TABLE public.employees
            ADD CONSTRAINT employees_reporting_to_fkey
            FOREIGN KEY (reporting_to) REFERENCES public.employees(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Foreign Key: departments.head_employee_id -> public.employees(id) ON DELETE SET NULL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'departments_head_employee_id_fkey'
    ) THEN
        ALTER TABLE public.departments
            ADD CONSTRAINT departments_head_employee_id_fkey
            FOREIGN KEY (head_employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4. Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_state_franchises_user_id 
    ON public.state_franchises (user_id);

CREATE INDEX IF NOT EXISTS idx_franchisee_documents_uploaded_by 
    ON public.franchisee_documents (uploaded_by);

CREATE INDEX IF NOT EXISTS idx_social_lead_events_lead_id 
    ON public.social_lead_events (lead_id);
