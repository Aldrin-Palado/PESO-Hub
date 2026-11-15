[
	"DO $$\r\nBEGIN\r\n  IF NOT EXISTS (\r\n    SELECT 1\r\n    FROM pg_publication_tables\r\n    WHERE pubname = 'supabase_realtime'\r\n      AND schemaname = 'public'\r\n      AND tablename = 'job_vacancy'\r\n  ) THEN\r\n    ALTER PUBLICATION supabase_realtime ADD TABLE public.job_vacancy;\r\n  END IF;\r\nEND;\r\n$$"
]