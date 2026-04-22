-- ENUMS
CREATE TYPE public.employment_type AS ENUM ('full_time','part_time','contract','intern','consultant');
CREATE TYPE public.employee_status AS ENUM ('active','on_leave','suspended','terminated','resigned');
CREATE TYPE public.emp_attendance_status AS ENUM ('present','absent','half_day','leave','holiday','weekoff');
CREATE TYPE public.leave_type AS ENUM ('casual','sick','paid','unpaid','comp_off','maternity','paternity');
CREATE TYPE public.leave_status AS ENUM ('pending','approved','rejected','cancelled');
CREATE TYPE public.payroll_status AS ENUM ('draft','processing','paid','cancelled');

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  head_employee_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  employee_code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text,
  phone text,
  designation text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  employment_type public.employment_type NOT NULL DEFAULT 'full_time',
  status public.employee_status NOT NULL DEFAULT 'active',
  date_of_joining date NOT NULL DEFAULT CURRENT_DATE,
  date_of_birth date,
  date_of_exit date,
  gender text,
  address text,
  city text,
  state text,
  monthly_ctc numeric NOT NULL DEFAULT 0,
  basic_salary numeric NOT NULL DEFAULT 0,
  hra numeric NOT NULL DEFAULT 0,
  allowances numeric NOT NULL DEFAULT 0,
  pan text,
  aadhar text,
  bank_account text,
  bank_ifsc text,
  bank_name text,
  reporting_to uuid,
  notes text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.employee_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  check_in timestamptz,
  check_out timestamptz,
  status public.emp_attendance_status NOT NULL DEFAULT 'present',
  hours_worked numeric NOT NULL DEFAULT 0,
  notes text,
  marked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, attendance_date)
);

CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type public.leave_type NOT NULL DEFAULT 'casual',
  from_date date NOT NULL,
  to_date date NOT NULL,
  days numeric NOT NULL DEFAULT 1,
  reason text,
  status public.leave_status NOT NULL DEFAULT 'pending',
  approver_id uuid,
  approved_at timestamptz,
  approver_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_month date NOT NULL,
  status public.payroll_status NOT NULL DEFAULT 'draft',
  total_gross numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  total_net numeric NOT NULL DEFAULT 0,
  employee_count integer NOT NULL DEFAULT 0,
  notes text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_month)
);

CREATE TABLE public.payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  basic_salary numeric NOT NULL DEFAULT 0,
  hra numeric NOT NULL DEFAULT 0,
  allowances numeric NOT NULL DEFAULT 0,
  bonus numeric NOT NULL DEFAULT 0,
  gross_pay numeric NOT NULL DEFAULT 0,
  pf_deduction numeric NOT NULL DEFAULT 0,
  tax_deduction numeric NOT NULL DEFAULT 0,
  other_deductions numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  days_present numeric NOT NULL DEFAULT 0,
  days_absent numeric NOT NULL DEFAULT 0,
  paid_days numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_id)
);

CREATE INDEX idx_hr_employees_department ON public.employees(department_id);
CREATE INDEX idx_hr_employees_user ON public.employees(user_id);
CREATE INDEX idx_hr_employees_status ON public.employees(status);
CREATE INDEX idx_hr_emp_att_emp_date ON public.employee_attendance(employee_id, attendance_date DESC);
CREATE INDEX idx_hr_emp_att_date ON public.employee_attendance(attendance_date DESC);
CREATE INDEX idx_hr_leave_emp ON public.leave_requests(employee_id, status);
CREATE INDEX idx_hr_leave_status ON public.leave_requests(status);
CREATE INDEX idx_hr_payroll_items_run ON public.payroll_items(payroll_run_id);
CREATE INDEX idx_hr_payroll_items_emp ON public.payroll_items(employee_id);

CREATE TRIGGER trg_departments_upd BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_employees_upd BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_emp_attendance_upd BEFORE UPDATE ON public.employee_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_leave_upd BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_payroll_runs_upd BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dept hr all" ON public.departments FOR ALL
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr'::app_role));
CREATE POLICY "dept read auth" ON public.departments FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "emp hr all" ON public.employees FOR ALL
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr'::app_role));
CREATE POLICY "emp self read" ON public.employees FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "emp att hr all" ON public.employee_attendance FOR ALL
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr'::app_role));
CREATE POLICY "emp att self read" ON public.employee_attendance FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = employee_attendance.employee_id AND e.user_id = auth.uid()));

CREATE POLICY "leave hr all" ON public.leave_requests FOR ALL
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr'::app_role));
CREATE POLICY "leave self read" ON public.leave_requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid()));
CREATE POLICY "leave self insert" ON public.leave_requests FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid()));

CREATE POLICY "payroll run hr all" ON public.payroll_runs FOR ALL
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr'::app_role) OR public.has_role(auth.uid(),'accounts'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr'::app_role) OR public.has_role(auth.uid(),'accounts'::app_role));

CREATE POLICY "payroll item hr all" ON public.payroll_items FOR ALL
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr'::app_role) OR public.has_role(auth.uid(),'accounts'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'hr'::app_role) OR public.has_role(auth.uid(),'accounts'::app_role));
CREATE POLICY "payroll item self read" ON public.payroll_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = payroll_items.employee_id AND e.user_id = auth.uid()));

INSERT INTO public.departments (name, code, description) VALUES
  ('Operations','OPS','Day-to-day business operations'),
  ('Sales','SAL','Lead conversion and growth'),
  ('Academy','ACA','Training delivery and student success'),
  ('Finance','FIN','Accounts, payroll and compliance'),
  ('Marketing','MKT','Brand, content and webinars'),
  ('Human Resources','HR','People, culture and hiring')
ON CONFLICT (code) DO NOTHING;

WITH d AS (SELECT code, id FROM public.departments)
INSERT INTO public.employees
  (employee_code, full_name, email, phone, designation, department_id, employment_type, status, date_of_joining, monthly_ctc, basic_salary, hra, allowances, city, state)
SELECT * FROM (VALUES
  ('EMP001','Aarav Sharma','aarav@mma.test','+919812340001','Operations Lead',(SELECT id FROM d WHERE code='OPS'),'full_time'::employment_type,'active'::employee_status,'2024-04-15'::date,85000,42500,17000,25500,'Mumbai','Maharashtra'),
  ('EMP002','Priya Iyer','priya@mma.test','+919812340002','Senior Sales Manager',(SELECT id FROM d WHERE code='SAL'),'full_time','active','2024-02-20',95000,47500,19000,28500,'Bengaluru','Karnataka'),
  ('EMP003','Rohan Mehta','rohan@mma.test','+919812340003','Sales Executive',(SELECT id FROM d WHERE code='SAL'),'full_time','active','2024-08-01',45000,22500,9000,13500,'Pune','Maharashtra'),
  ('EMP004','Sneha Kapoor','sneha@mma.test','+919812340004','Academy Coordinator',(SELECT id FROM d WHERE code='ACA'),'full_time','active','2024-06-10',55000,27500,11000,16500,'Delhi','Delhi'),
  ('EMP005','Arjun Verma','arjun@mma.test','+919812340005','Senior Trainer',(SELECT id FROM d WHERE code='ACA'),'full_time','active','2023-11-01',75000,37500,15000,22500,'Jaipur','Rajasthan'),
  ('EMP006','Ananya Nair','ananya@mma.test','+919812340006','Accounts Manager',(SELECT id FROM d WHERE code='FIN'),'full_time','active','2024-01-15',70000,35000,14000,21000,'Chennai','Tamil Nadu'),
  ('EMP007','Vikram Reddy','vikram@mma.test','+919812340007','Marketing Lead',(SELECT id FROM d WHERE code='MKT'),'full_time','active','2024-03-05',80000,40000,16000,24000,'Hyderabad','Telangana'),
  ('EMP008','Isha Bansal','isha@mma.test','+919812340008','Content Strategist',(SELECT id FROM d WHERE code='MKT'),'full_time','active','2024-07-20',55000,27500,11000,16500,'Gurugram','Haryana'),
  ('EMP009','Karan Joshi','karan@mma.test','+919812340009','HR Business Partner',(SELECT id FROM d WHERE code='HR'),'full_time','active','2023-09-12',72000,36000,14400,21600,'Ahmedabad','Gujarat'),
  ('EMP010','Megha Singh','megha@mma.test','+919812340010','Talent Acquisition',(SELECT id FROM d WHERE code='HR'),'full_time','active','2024-09-01',50000,25000,10000,15000,'Lucknow','Uttar Pradesh'),
  ('EMP011','Devang Patel','devang@mma.test','+919812340011','Junior Trainer',(SELECT id FROM d WHERE code='ACA'),'contract','active','2024-10-15',35000,17500,7000,10500,'Surat','Gujarat'),
  ('EMP012','Riya Gupta','riya@mma.test','+919812340012','Customer Support',(SELECT id FROM d WHERE code='OPS'),'full_time','on_leave','2024-05-08',38000,19000,7600,11400,'Kolkata','West Bengal')
) AS v(employee_code, full_name, email, phone, designation, department_id, employment_type, status, date_of_joining, monthly_ctc, basic_salary, hra, allowances, city, state)
ON CONFLICT (employee_code) DO NOTHING;

INSERT INTO public.employee_attendance (employee_id, attendance_date, status, check_in, check_out, hours_worked)
SELECT
  e.id,
  d::date,
  CASE
    WHEN EXTRACT(DOW FROM d) IN (0,6) THEN 'weekoff'::emp_attendance_status
    WHEN random() < 0.05 THEN 'absent'::emp_attendance_status
    WHEN random() < 0.08 THEN 'half_day'::emp_attendance_status
    ELSE 'present'::emp_attendance_status
  END,
  d::date + interval '9 hours' + (random()*30 || ' minutes')::interval,
  d::date + interval '18 hours' + (random()*60 || ' minutes')::interval,
  CASE WHEN EXTRACT(DOW FROM d) IN (0,6) THEN 0 ELSE 8 + random()*1.2 END
FROM public.employees e
CROSS JOIN generate_series(CURRENT_DATE - interval '13 days', CURRENT_DATE, interval '1 day') d
ON CONFLICT (employee_id, attendance_date) DO NOTHING;

INSERT INTO public.leave_requests (employee_id, leave_type, from_date, to_date, days, reason, status)
SELECT id,'casual'::leave_type, CURRENT_DATE + 5, CURRENT_DATE + 6, 2, 'Family function', 'pending'::leave_status FROM public.employees WHERE employee_code='EMP003'
UNION ALL
SELECT id,'sick'::leave_type, CURRENT_DATE - 3, CURRENT_DATE - 2, 2, 'Fever', 'approved'::leave_status FROM public.employees WHERE employee_code='EMP008'
UNION ALL
SELECT id,'paid'::leave_type, CURRENT_DATE + 14, CURRENT_DATE + 18, 5, 'Vacation', 'pending'::leave_status FROM public.employees WHERE employee_code='EMP007'
UNION ALL
SELECT id,'casual'::leave_type, CURRENT_DATE - 10, CURRENT_DATE - 10, 1, 'Personal work', 'approved'::leave_status FROM public.employees WHERE employee_code='EMP005';