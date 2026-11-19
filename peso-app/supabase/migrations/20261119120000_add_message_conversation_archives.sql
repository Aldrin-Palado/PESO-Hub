CREATE TABLE public.peso_message_archives (
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, contact_user_id),
  CONSTRAINT peso_message_archives_distinct_participants
    CHECK (owner_user_id <> contact_user_id)
);

ALTER TABLE public.peso_message_archives ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.peso_message_archives FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.peso_message_archives TO authenticated;
GRANT ALL ON TABLE public.peso_message_archives TO service_role;

CREATE POLICY "Users can read their own message archives"
  ON public.peso_message_archives
  FOR SELECT
  TO authenticated
  USING (owner_user_id = (SELECT auth.uid()));

CREATE POLICY "Users can archive their own conversations"
  ON public.peso_message_archives
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = (SELECT auth.uid()));

CREATE POLICY "Users can restore their own conversations"
  ON public.peso_message_archives
  FOR DELETE
  TO authenticated
  USING (owner_user_id = (SELECT auth.uid()));
