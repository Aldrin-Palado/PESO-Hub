CREATE TABLE public.peso_message_daily_initiators (
  contact_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_date date NOT NULL,
  first_sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_user_id, admin_user_id, conversation_date),
  CHECK (first_sender_user_id IN (contact_user_id, admin_user_id))
);

ALTER TABLE public.peso_message_daily_initiators ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.peso_message_daily_initiators
  FROM PUBLIC, anon, authenticated;

WITH todays_messages AS (
  SELECT
    CASE
      WHEN message.sender_user_id = admin.user_id
        THEN message.recipient_user_id
      ELSE message.sender_user_id
    END AS contact_user_id,
    admin.user_id AS admin_user_id,
    (message.created_at AT TIME ZONE 'Asia/Manila')::date AS conversation_date,
    message.sender_user_id,
    message.created_at,
    message.message_id
  FROM public.peso_messages AS message
  JOIN public.peso_admin AS admin
    ON admin.is_active
   AND (
     message.sender_user_id = admin.user_id
     OR message.recipient_user_id = admin.user_id
   )
  WHERE (message.created_at AT TIME ZONE 'Asia/Manila')::date =
        (now() AT TIME ZONE 'Asia/Manila')::date
    AND (
      EXISTS (
        SELECT 1
        FROM public.job_seeker AS seeker
        WHERE seeker.user_id = CASE
          WHEN message.sender_user_id = admin.user_id
            THEN message.recipient_user_id
          ELSE message.sender_user_id
        END
      )
      OR EXISTS (
        SELECT 1
        FROM public.employer AS employer
        WHERE employer.user_id = CASE
          WHEN message.sender_user_id = admin.user_id
            THEN message.recipient_user_id
          ELSE message.sender_user_id
        END
          AND employer.is_peso IS NOT TRUE
      )
    )
),
first_messages AS (
  SELECT DISTINCT ON (
    contact_user_id,
    admin_user_id,
    conversation_date
  )
    contact_user_id,
    admin_user_id,
    conversation_date,
    sender_user_id
  FROM todays_messages
  ORDER BY
    contact_user_id,
    admin_user_id,
    conversation_date,
    created_at,
    message_id
)
INSERT INTO public.peso_message_daily_initiators (
  contact_user_id,
  admin_user_id,
  conversation_date,
  first_sender_user_id
)
SELECT
  contact_user_id,
  admin_user_id,
  conversation_date,
  sender_user_id
FROM first_messages
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.auto_acknowledge_job_seeker_admin_replies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  admin_user_id uuid;
  contact_user_id uuid;
  first_sender_user_id uuid;
  conversation_date date :=
    (transaction_timestamp() AT TIME ZONE 'Asia/Manila')::date;
  greeting text;
  acknowledgment text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.peso_admin AS admin
    WHERE admin.user_id = NEW.sender_user_id
      AND admin.is_active
  ) THEN
    admin_user_id := NEW.sender_user_id;
    contact_user_id := NEW.recipient_user_id;
  ELSIF EXISTS (
    SELECT 1
    FROM public.peso_admin AS admin
    WHERE admin.user_id = NEW.recipient_user_id
      AND admin.is_active
  ) THEN
    admin_user_id := NEW.recipient_user_id;
    contact_user_id := NEW.sender_user_id;
  ELSE
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.job_seeker AS seeker
    WHERE seeker.user_id = contact_user_id
  ) THEN
    greeting := 'Dear Job Seeker,';
  ELSIF EXISTS (
    SELECT 1
    FROM public.employer AS employer
    WHERE employer.user_id = contact_user_id
      AND employer.is_peso IS NOT TRUE
  ) THEN
    greeting := 'Dear Employer,';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.peso_message_daily_initiators AS daily_initiator (
    contact_user_id,
    admin_user_id,
    conversation_date,
    first_sender_user_id
  )
  VALUES (
    contact_user_id,
    admin_user_id,
    conversation_date,
    NEW.sender_user_id
  )
  ON CONFLICT DO NOTHING
  RETURNING daily_initiator.first_sender_user_id
    INTO first_sender_user_id;

  IF NOT FOUND OR first_sender_user_id <> contact_user_id THEN
    RETURN NEW;
  END IF;

  acknowledgment := greeting || E'\n\nThank you for contacting PESO-Hub. We have received your message and appreciate your interest.\n\nOur team will review your inquiry and respond as soon as possible. Thank you for your patience.\n\nBest regards,\nPESO Mabini Team\nPublic Employment Service Office\nMunicipality of Mabini, Batangas';

  INSERT INTO public.peso_messages (
    employer_id,
    sender_user_id,
    recipient_user_id,
    author_user_id,
    body
  )
  VALUES (
    NULL,
    admin_user_id,
    contact_user_id,
    NULL,
    acknowledgment
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_acknowledge_job_seeker_admin_replies()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS auto_acknowledge_job_seeker_admin_replies
  ON public.peso_messages;
CREATE TRIGGER auto_acknowledge_job_seeker_admin_replies
  AFTER INSERT ON public.peso_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_acknowledge_job_seeker_admin_replies();
