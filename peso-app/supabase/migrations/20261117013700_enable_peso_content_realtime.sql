DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'peso_posts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.peso_posts;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'peso_announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.peso_announcements;
  END IF;
END;
$$;
