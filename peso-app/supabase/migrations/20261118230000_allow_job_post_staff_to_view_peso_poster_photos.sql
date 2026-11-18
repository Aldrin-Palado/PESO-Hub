DROP POLICY IF EXISTS "Job post staff can view PESO poster photos"
  ON storage.objects;

CREATE POLICY "Job post staff can view PESO poster photos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'peso-profile-photos'
    AND public.current_staff_has_permission('job_posts')
    AND EXISTS (
      SELECT 1
      FROM public.job_vacancy AS job
      JOIN public.employer AS employer
        ON employer.employer_id = job.employer_id
      WHERE employer.is_peso IS TRUE
        AND job.posted_by_user_id::text = split_part(storage.objects.name, '/', 1)
    )
  );
