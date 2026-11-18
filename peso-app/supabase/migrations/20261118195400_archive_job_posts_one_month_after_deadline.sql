ALTER TABLE public.job_vacancy
  ADD COLUMN IF NOT EXISTS archive_after timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE public.job_vacancy
SET
  status = CASE
    WHEN deadline IS NOT NULL
      AND deadline::date < CURRENT_DATE
      AND status = 'open'
    THEN 'closed'
    ELSE status
  END,
  archive_after = CASE
    WHEN deadline IS NOT NULL
      AND deadline::date < CURRENT_DATE
    THEN (deadline::date::timestamp without time zone + interval '1 month')::timestamptz
    WHEN status = 'closed'
    THEN COALESCE(
      archive_after,
      pg_catalog.statement_timestamp() + interval '1 month'
    )
    ELSE NULL
  END
WHERE deadline IS NOT NULL
  AND deadline::date < CURRENT_DATE;

UPDATE public.job_vacancy
SET archive_after = CASE
  WHEN deadline IS NOT NULL AND deadline::date <= CURRENT_DATE
  THEN (deadline::date::timestamp without time zone + interval '1 month')::timestamptz
  ELSE pg_catalog.statement_timestamp() + interval '1 month'
END
WHERE status = 'closed'
  AND archive_after IS NULL;

CREATE INDEX IF NOT EXISTS job_vacancy_archive_after_pending_idx
  ON public.job_vacancy (archive_after)
  WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_job_post_archival_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  deadline_archive_after timestamptz;
BEGIN
  IF NEW.deadline IS NOT NULL THEN
    IF NEW.deadline::date <= CURRENT_DATE THEN
      deadline_archive_after :=
        (NEW.deadline::date::timestamp without time zone + interval '1 month')::timestamptz;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'closed' THEN
      NEW.archive_after := COALESCE(deadline_archive_after,
        pg_catalog.statement_timestamp() + interval '1 month');
      NEW.archived_at := NULL;
    ELSE
      NEW.archive_after := NULL;
      NEW.archived_at := NULL;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'closed' THEN
      NEW.archive_after := COALESCE(deadline_archive_after,
        pg_catalog.statement_timestamp() + interval '1 month');
      NEW.archived_at := NULL;
    ELSE
      NEW.archive_after := NULL;
      NEW.archived_at := NULL;
    END IF;
  ELSE
    NEW.archive_after := OLD.archive_after;
    IF current_user NOT IN ('postgres', 'service_role') THEN
      NEW.archived_at := OLD.archived_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_job_post_archival_schedule
  ON public.job_vacancy;

CREATE TRIGGER set_job_post_archival_schedule
  BEFORE INSERT OR UPDATE ON public.job_vacancy
  FOR EACH ROW
  EXECUTE FUNCTION public.set_job_post_archival_schedule();

CREATE OR REPLACE FUNCTION public.close_expired_job_posts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  closed_count integer;
BEGIN
  UPDATE public.job_vacancy
  SET status = 'closed'
  WHERE status = 'open'
    AND deadline IS NOT NULL
    AND deadline::date < CURRENT_DATE;

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_expired_job_posts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  archived_count integer;
BEGIN
  UPDATE public.job_vacancy
  SET archived_at = pg_catalog.statement_timestamp()
  WHERE archived_at IS NULL
    AND archive_after <= pg_catalog.statement_timestamp()
    AND status = 'closed';

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$;

REVOKE ALL ON FUNCTION public.close_expired_job_posts()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_expired_job_posts()
  FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'peso-close-expired-job-posts',
      'peso-archive-expired-job-posts'
    )
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'peso-close-expired-job-posts',
    '* * * * *',
    'SELECT public.close_expired_job_posts();'
  );
  PERFORM cron.schedule(
    'peso-archive-expired-job-posts',
    '* * * * *',
    'SELECT public.archive_expired_job_posts();'
  );
END;
$$;
