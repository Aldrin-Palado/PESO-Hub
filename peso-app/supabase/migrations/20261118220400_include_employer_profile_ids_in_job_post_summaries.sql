DROP FUNCTION public.get_job_post_employer_summaries();

CREATE FUNCTION public.get_job_post_employer_summaries()
RETURNS TABLE(
  employer_id uuid,
  name text,
  logo_url text,
  user_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    public.is_admin()
    OR public.current_staff_has_permission('job_posts')
  ) THEN
    RAISE EXCEPTION 'You are not authorized to view job post employer summaries.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT employer.employer_id, employer.name, employer.logo_url, employer.user_id
  FROM public.employer AS employer
  WHERE EXISTS (
    SELECT 1
    FROM public.job_vacancy AS job
    WHERE job.employer_id = employer.employer_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_job_post_employer_summaries()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_job_post_employer_summaries()
  TO authenticated;
