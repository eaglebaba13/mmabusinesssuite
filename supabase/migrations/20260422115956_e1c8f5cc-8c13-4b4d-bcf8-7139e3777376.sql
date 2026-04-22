-- ============ ENUMS ============
CREATE TYPE public.batch_status AS ENUM ('upcoming','ongoing','completed','cancelled');
CREATE TYPE public.batch_mode AS ENUM ('online','offline','hybrid');
CREATE TYPE public.enrollment_status AS ENUM ('active','completed','dropped','suspended');
CREATE TYPE public.attendance_status AS ENUM ('present','absent','late','excused');
CREATE TYPE public.fee_status AS ENUM ('pending','paid','partial','overdue','waived');
CREATE TYPE public.course_status AS ENUM ('draft','published','archived');

-- ============ COURSES ============
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  code text UNIQUE,
  description text,
  duration_weeks integer NOT NULL DEFAULT 4,
  fee_amount numeric(12,2) NOT NULL DEFAULT 0,
  level text DEFAULT 'beginner',
  status public.course_status NOT NULL DEFAULT 'published',
  cover_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courses read" ON public.courses FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "courses admin insert" ON public.courses FOR INSERT WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'));
CREATE POLICY "courses admin update" ON public.courses FOR UPDATE USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'));
CREATE POLICY "courses admin delete" ON public.courses FOR DELETE USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'));
CREATE TRIGGER courses_updated BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ TRAINERS ============
CREATE TABLE public.trainers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  full_name text NOT NULL,
  email text,
  phone text,
  specialization text,
  bio text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trainers admin all" ON public.trainers FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'));
CREATE POLICY "trainers read all auth" ON public.trainers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE TRIGGER trainers_updated BEFORE UPDATE ON public.trainers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ BATCHES ============
CREATE TABLE public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  trainer_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL,
  batch_code text NOT NULL UNIQUE,
  start_date date NOT NULL,
  end_date date,
  capacity integer NOT NULL DEFAULT 30,
  mode public.batch_mode NOT NULL DEFAULT 'offline',
  location text,
  status public.batch_status NOT NULL DEFAULT 'upcoming',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_batches_course ON public.batches(course_id);
CREATE INDEX idx_batches_trainer ON public.batches(trainer_id);
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batches admin all" ON public.batches FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'));
CREATE POLICY "batches read all auth" ON public.batches FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE TRIGGER batches_updated BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ STUDENTS (basic policies first) ============
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  full_name text NOT NULL,
  email text,
  phone text,
  city text,
  date_of_birth date,
  gender text,
  guardian_name text,
  guardian_phone text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_students_user ON public.students(user_id);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students admin all" ON public.students FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'));
CREATE POLICY "students self read" ON public.students FOR SELECT USING (user_id = auth.uid());
CREATE TRIGGER students_updated BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ENROLLMENTS ============
CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE RESTRICT,
  enrolled_on date NOT NULL DEFAULT CURRENT_DATE,
  status public.enrollment_status NOT NULL DEFAULT 'active',
  total_fee numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, batch_id)
);
CREATE INDEX idx_enroll_student ON public.enrollments(student_id);
CREATE INDEX idx_enroll_batch ON public.enrollments(batch_id);
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enroll admin all" ON public.enrollments FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'));
CREATE POLICY "enroll self read" ON public.enrollments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = enrollments.student_id AND s.user_id = auth.uid()));
CREATE POLICY "enroll trainer read" ON public.enrollments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.batches b
    JOIN public.trainers t ON t.id = b.trainer_id
    WHERE b.id = enrollments.batch_id AND t.user_id = auth.uid()
  ));
CREATE TRIGGER enroll_updated BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- now safe to add trainer-read on students
CREATE POLICY "students trainer read" ON public.students FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.batches b ON b.id = e.batch_id
    JOIN public.trainers t ON t.id = b.trainer_id
    WHERE e.student_id = students.id AND t.user_id = auth.uid()
  ));

-- ============ ATTENDANCE ============
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  status public.attendance_status NOT NULL DEFAULT 'present',
  notes text,
  marked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, attendance_date)
);
CREATE INDEX idx_attendance_enroll ON public.attendance(enrollment_id);
CREATE INDEX idx_attendance_date ON public.attendance(attendance_date);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "att admin all" ON public.attendance FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'));
CREATE POLICY "att trainer manage" ON public.attendance FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.batches b ON b.id = e.batch_id
    JOIN public.trainers t ON t.id = b.trainer_id
    WHERE e.id = attendance.enrollment_id AND t.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.batches b ON b.id = e.batch_id
    JOIN public.trainers t ON t.id = b.trainer_id
    WHERE e.id = attendance.enrollment_id AND t.user_id = auth.uid()
  ));
CREATE POLICY "att self read" ON public.attendance FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.students s ON s.id = e.student_id
    WHERE e.id = attendance.enrollment_id AND s.user_id = auth.uid()
  ));

-- ============ FEE PAYMENTS ============
CREATE TABLE public.fee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  method text DEFAULT 'cash',
  reference text,
  receipt_number text UNIQUE,
  paid_on date,
  due_on date,
  status public.fee_status NOT NULL DEFAULT 'pending',
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fee_enroll ON public.fee_payments(enrollment_id);
CREATE INDEX idx_fee_status ON public.fee_payments(status);
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fee admin all" ON public.fee_payments FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin') OR has_role(auth.uid(), 'accounts'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin') OR has_role(auth.uid(), 'accounts'));
CREATE POLICY "fee self read" ON public.fee_payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.students s ON s.id = e.student_id
    WHERE e.id = fee_payments.enrollment_id AND s.user_id = auth.uid()
  ));
CREATE TRIGGER fee_updated BEFORE UPDATE ON public.fee_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CERTIFICATES ============
CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  certificate_code text NOT NULL UNIQUE,
  issued_on date NOT NULL DEFAULT CURRENT_DATE,
  pdf_url text,
  grade text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cert_enroll ON public.certificates(enrollment_id);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cert admin all" ON public.certificates FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'academy_admin'));
CREATE POLICY "cert self read" ON public.certificates FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.students s ON s.id = e.student_id
    WHERE e.id = certificates.enrollment_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "cert public verify" ON public.certificates FOR SELECT USING (true);
