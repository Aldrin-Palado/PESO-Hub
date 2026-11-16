ALTER TABLE public.application
  ADD COLUMN IF NOT EXISTS archive_after timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS application_archive_after_idx
  ON public.application (archive_after)
  WHERE archived_at IS NULL AND archive_after IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_application_archive_deadline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text = ANY (ARRAY['hired', 'rejected', 'withdrawn']) THEN
    NEW.archive_after := statement_timestamp() + interval '1 month';
  ELSE
    NEW.archive_after := NULL;
  END IF;
  NEW.archived_at := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_application_archive_deadline
  ON public.application;

CREATE TRIGGER set_application_archive_deadline
  BEFORE INSERT OR UPDATE OF status
  ON public.application
  FOR EACH ROW
  EXECUTE FUNCTION public.set_application_archive_deadline();

UPDATE public.application AS application_record
SET archive_after = (
  SELECT history.changed_at + interval '1 month'
  FROM public.application_status_history AS history
  WHERE history.application_id = application_record.application_id
  ORDER BY history.changed_at DESC, history.history_id DESC
  LIMIT 1
)
WHERE application_record.status::text = ANY (
  ARRAY['hired', 'rejected', 'withdrawn']
)
  AND application_record.archive_after IS NULL;

CREATE OR REPLACE FUNCTION public.archive_expired_applications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.application
  SET archived_at = statement_timestamp()
  WHERE archived_at IS NULL
    AND archive_after <= statement_timestamp()
    AND status::text = ANY (ARRAY['hired', 'rejected', 'withdrawn']);
END;
$$;

REVOKE ALL ON FUNCTION public.archive_expired_applications()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_expired_applications()
  TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'archive-expired-job-seeker-applications'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'archive-expired-job-seeker-applications',
    '*/15 * * * *',
    'SELECT public.archive_expired_applications();'
  );
END;
$$;

SELECT public.archive_expired_applications();
