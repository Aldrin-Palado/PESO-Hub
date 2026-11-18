CREATE POLICY "Authorized PESO staff can view PESO employer profile"
  ON public.employer
  FOR SELECT
  TO authenticated
  USING (public.is_accessible_peso_employer(employer_id));
