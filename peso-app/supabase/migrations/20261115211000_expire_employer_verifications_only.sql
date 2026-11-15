CREATE OR REPLACE FUNCTION public.track_profile_verification_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged :=
    current_user IN ('postgres', 'supabase_admin', 'service_role')
    OR COALESCE(auth.role(), '') = 'service_role'
    OR COALESCE(public.is_staff_or_admin(), false);

  IF is_privileged
     AND TG_TABLE_NAME = 'employer'
     AND NEW.verification_status = 'verified'
     AND OLD.verification_refresh_required THEN
    RAISE EXCEPTION
      'The employer must resubmit its updated screening details before verification.';
  END IF;

  IF NOT is_privileged THEN
    NEW.verification_status := OLD.verification_status;
    NEW.last_verified_at := OLD.last_verified_at;
    NEW.verification_refresh_required := OLD.verification_refresh_required;
    IF TG_TABLE_NAME = 'employer' THEN
      NEW.is_verified := OLD.is_verified;
    END IF;

    IF OLD.verification_refresh_required
       AND NEW.verification_details_reviewed_at
           IS DISTINCT FROM OLD.verification_details_reviewed_at
       AND NEW.user_id = auth.uid() THEN
      NEW.verification_refresh_required := false;
    END IF;
  ELSIF NEW.verification_status = 'verified'
        AND OLD.verification_status IS DISTINCT FROM 'verified' THEN
    NEW.last_verified_at := now();
    NEW.verification_refresh_required := false;
  END IF;

  IF TG_TABLE_NAME = 'employer' AND is_privileged THEN
    NEW.is_verified := NEW.verification_status = 'verified';
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.job_seeker
  DISABLE TRIGGER notify_job_seeker_on_verification;

UPDATE public.job_seeker
SET
  verification_status = CASE
    WHEN verification_status = 'pending' THEN 'verified'
    ELSE verification_status
  END,
  verification_refresh_required = false
WHERE verification_refresh_required;

ALTER TABLE public.job_seeker
  ENABLE TRIGGER notify_job_seeker_on_verification;

CREATE OR REPLACE FUNCTION public.expire_stale_profile_verifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.employer
  SET
    verification_status = 'pending',
    is_verified = false,
    verification_refresh_required = true
  WHERE verification_status = 'verified'
    AND COALESCE(is_peso, false) = false
    AND last_verified_at <= now() - interval '1 year';
END;
$$;
