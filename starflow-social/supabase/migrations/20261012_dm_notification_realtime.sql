-- Realtime delivery for private messaging and notifications.
-- Supabase Realtime checks authenticated RLS SELECT policies before delivering
-- postgres_changes. Keep the underlying tables private.
DO $$
DECLARE
  realtime_table text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'Supabase Realtime publication not found';
  END IF;
  FOREACH realtime_table IN ARRAY ARRAY[
    'dm_conversations', 'dm_messages', 'dm_read_state', 'notifications'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = realtime_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', realtime_table);
    END IF;
  END LOOP;
END
$$;
