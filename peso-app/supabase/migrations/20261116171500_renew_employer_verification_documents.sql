CREATE OR REPLACE FUNCTION public.expire_stale_profile_verifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.employer AS employer
  SET
    verification_status = 'pending',
    is_verified = false,
    verification_refresh_required = true,
    registration_details = jsonb_set(
      CASE
        WHEN jsonb_typeof(employer.registration_details) = 'object'
          THEN employer.registration_details
        ELSE '{}'::jsonb
      END,
      '{establishment_status}',
      '"For Renewal"'::jsonb,
      true
    ),
    verification_documents = COALESCE(
      (
        SELECT jsonb_agg(document.value ORDER BY document.ordinality)
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(employer.verification_documents) = 'array'
              THEN employer.verification_documents
            ELSE '[]'::jsonb
          END
        ) WITH ORDINALITY AS document(value, ordinality)
        WHERE COALESCE(
          document.value->>'document_type' NOT IN (
            'letter_of_intent',
            'business_permit',
            'dole_no_pending_cases',
            'vacancies_and_qualifications',
            'job_vacancy_ads'
          ),
          true
        )
      ),
      '[]'::jsonb
    )
  WHERE employer.verification_status = 'verified'
    AND COALESCE(employer.is_peso, false) = false
    AND employer.last_verified_at <= now() - interval '1 year';
END;
$$;
