CREATE OR REPLACE FUNCTION public.restore_message_conversation_archives()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.peso_message_archives AS archive
  WHERE (archive.owner_user_id = NEW.sender_user_id
      AND archive.contact_user_id = NEW.recipient_user_id)
     OR (archive.owner_user_id = NEW.recipient_user_id
      AND archive.contact_user_id = NEW.sender_user_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restore_message_conversation_archives
  ON public.peso_messages;

CREATE TRIGGER restore_message_conversation_archives
AFTER INSERT ON public.peso_messages
FOR EACH ROW
EXECUTE FUNCTION public.restore_message_conversation_archives();
