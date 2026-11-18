ALTER TABLE public.employer
  ADD COLUMN IF NOT EXISTS is_peso boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS employer_single_peso_profile
  ON public.employer (is_peso)
  WHERE is_peso;

INSERT INTO public.employer (
  name,
  address,
  contact_person,
  is_active,
  is_verified,
  verification_status,
  is_peso
)
VALUES (
  'PESO Mabini',
  'Mabini, Batangas',
  'PESO Mabini',
  true,
  true,
  'verified',
  true
)
ON CONFLICT (is_peso) WHERE is_peso
DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  contact_person = EXCLUDED.contact_person,
  is_active = true,
  is_verified = true,
  verification_status = 'verified';

DROP POLICY IF EXISTS "Authorized PESO staff can view PESO employer profile"
  ON public.employer;
CREATE POLICY "Authorized PESO staff can view PESO employer profile"
  ON public.employer
  FOR SELECT
  TO authenticated
  USING (public.is_accessible_peso_employer(employer_id));

DROP POLICY IF EXISTS "PESO staff/admin can manage PESO job posts"
  ON public.job_vacancy;
DROP POLICY IF EXISTS "Authorized PESO staff can manage PESO job posts"
  ON public.job_vacancy;
CREATE POLICY "Authorized PESO staff can manage PESO job posts"
  ON public.job_vacancy
  FOR ALL
  TO authenticated
  USING (public.is_accessible_peso_employer(employer_id))
  WITH CHECK (public.is_accessible_peso_employer(employer_id));
