ALTER TABLE public.job_vacancy
  ADD COLUMN IF NOT EXISTS salary_period text NOT NULL DEFAULT 'monthly';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.job_vacancy'::regclass
      AND conname = 'job_vacancy_salary_period_check'
  ) THEN
    ALTER TABLE public.job_vacancy
      ADD CONSTRAINT job_vacancy_salary_period_check
      CHECK (salary_period IN ('monthly', 'yearly'));
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.get_open_job_vacancies();

CREATE FUNCTION public.get_open_job_vacancies()
RETURNS TABLE (
  job_vacancy_id uuid,
  position_title text,
  description text,
  job_qualifications text,
  requirements text,
  location text,
  employment_type text,
  salary_min numeric,
  salary_max numeric,
  salary_period text,
  vacancies_available integer,
  date_posted timestamptz,
  deadline date,
  image_url text,
  employer_name text,
  job_classification text,
  employer_verified boolean,
  employer_address text,
  employer_description text,
  employer_industry text,
  employer_website text,
  employer_logo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    job.job_vacancy_id,
    job.position_title,
    job.description,
    job.job_qualifications,
    job.requirements,
    job.location,
    job.employment_type,
    job.salary_min,
    job.salary_max,
    job.salary_period,
    job.vacancies_available,
    job.date_posted,
    job.deadline,
    job.image_url,
    employer.name AS employer_name,
    job.job_classification,
    employer.is_verified AS employer_verified,
    employer.address AS employer_address,
    employer.company_description AS employer_description,
    employer.industry AS employer_industry,
    employer.website AS employer_website,
    employer.logo_url AS employer_logo_url
  FROM public.job_vacancy AS job
  JOIN public.employer AS employer
    ON employer.employer_id = job.employer_id
  WHERE job.status = 'open';
$$;

REVOKE ALL ON FUNCTION public.get_open_job_vacancies()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_open_job_vacancies()
  TO authenticated;
