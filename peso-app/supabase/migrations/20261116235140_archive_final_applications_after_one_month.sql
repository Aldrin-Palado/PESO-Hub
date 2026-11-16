ALTER TABLE public.application
  ADD COLUMN IF NOT EXISTS archive_after timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE public.application AS application_record
SET archive_after = COALESCE(
  (
    SELECT history.changed_at
    FROM public.application_status_history AS history
    WHERE history.application_id = application_record.application_id
      AND history.status = application_record.status
    ORDER BY history.changed_at DESC, history.history_id DESC
    LIMIT 1
  ),
  application_record.updated_at,
  application_record.date_applied,
  pg_catalog.statement_timestamp()
) + interval '1 month'
WHERE application_record.status IN (
  'hired'::public.application_status,
  'rejected'::public.application_status,
  'withdrawn'::public.application_status
);

CREATE INDEX IF NOT EXISTS application_archive_after_pending_idx
  ON public.application (archive_after)
  WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_application_archival_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN (
      'hired'::public.application_status,
      'rejected'::public.application_status,
      'withdrawn'::public.application_status
    ) THEN
      NEW.archive_after := pg_catalog.statement_timestamp() + interval '1 month';
    ELSE
      NEW.archive_after := NULL;
    END IF;
    NEW.archived_at := NULL;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN (
      'hired'::public.application_status,
      'rejected'::public.application_status,
      'withdrawn'::public.application_status
    ) THEN
      NEW.archive_after := pg_catalog.statement_timestamp() + interval '1 month';
    ELSE
      NEW.archive_after := NULL;
    END IF;
    NEW.archived_at := NULL;
  ELSE
    NEW.archive_after := OLD.archive_after;
    IF current_user NOT IN ('postgres', 'service_role') THEN
      NEW.archived_at := OLD.archived_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER set_application_archival_schedule
  BEFORE INSERT OR UPDATE ON public.application
  FOR EACH ROW
  EXECUTE FUNCTION public.set_application_archival_schedule();

CREATE OR REPLACE FUNCTION public.archive_expired_applications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  archived_count integer;
BEGIN
  UPDATE public.application
  SET archived_at = pg_catalog.statement_timestamp()
  WHERE archived_at IS NULL
    AND archive_after <= pg_catalog.statement_timestamp()
    AND status IN (
      'hired'::public.application_status,
      'rejected'::public.application_status,
      'withdrawn'::public.application_status
    );

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_expired_applications()
  FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'peso-archive-expired-applications'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'peso-archive-expired-applications',
    '* * * * *',
    'SELECT public.archive_expired_applications();'
  );
END;
$$;