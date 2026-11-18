DROP POLICY IF EXISTS "Job seeker manages own applications"
  ON public.application;

DROP POLICY IF EXISTS "Job seekers delete applications before qualification"
  ON public.application;

DROP POLICY IF EXISTS "Job seekers delete own applications"
  ON public.application;

DROP POLICY IF EXISTS "Staff/Admin manage all applications"
  ON public.application;
