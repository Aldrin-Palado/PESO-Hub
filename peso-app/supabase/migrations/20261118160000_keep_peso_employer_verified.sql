ALTER TABLE public.employer
  ADD COLUMN IF NOT EXISTS is_peso boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS employer_single_peso_profile
  ON public.employer (is_peso)
  WHERE is_peso;

CREATE OR REPLACE FUNCTION public.set_new_employer_pending()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_peso IS TRUE THEN
    NEW.verification_status := 'verified';
    NEW.is_verified := true;
    NEW.verification_refresh_required := false;
    NEW.last_verified_at := COALESCE(NEW.last_verified_at, now());
  ELSE
    NEW.verification_status := 'pending';
    NEW.is_verified := false;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.track_profile_verification_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  IF TG_TABLE_NAME = 'employer' THEN
    IF COALESCE(OLD.is_peso, false)
       OR COALESCE(NEW.is_peso, false) THEN
      NEW.is_peso := true;
      NEW.verification_status := 'verified';
      NEW.is_verified := true;
      NEW.verification_refresh_required := false;
      NEW.last_verified_at := COALESCE(
        OLD.last_verified_at,
        NEW.last_verified_at,
        now()
      );
      RETURN NEW;
    END IF;
  END IF;

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

DROP TRIGGER IF EXISTS trg_track_employer_verification_refresh
  ON public.employer;
CREATE TRIGGER trg_track_employer_verification_refresh
BEFORE UPDATE OF
  is_peso,
  verification_status,
  registration_details,
  verification_details_reviewed_at,
  verification_refresh_required,
  last_verified_at,
  is_verified
ON public.employer
FOR EACH ROW
EXECUTE FUNCTION public.track_profile_verification_refresh();

INSERT INTO public.employer AS peso_profile (
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
  verification_status = 'verified',
  verification_refresh_required = false,
  last_verified_at = COALESCE(peso_profile.last_verified_at, now());
