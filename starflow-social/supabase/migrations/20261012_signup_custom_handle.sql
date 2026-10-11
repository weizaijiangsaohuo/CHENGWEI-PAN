-- User-selected handles are claimed atomically during Supabase Auth signup.
-- Existing profiles (including @wei and @starflow) are not changed.
-- Email verification continues to be handled by Supabase Auth.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  prefix text;
  nickname text;
  requested_handle text;
  chosen_handle text;
BEGIN
  prefix := lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  IF char_length(prefix) < 2 THEN prefix := 'user'; END IF;
  nickname := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
                    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), '新朋友'), 60);

  requested_handle := nullif(btrim(new.raw_user_meta_data ->> 'handle'), '');
  IF requested_handle IS NOT NULL THEN
    chosen_handle := lower(requested_handle);
    IF chosen_handle !~ '^[a-z0-9_]{3,24}$'
       OR chosen_handle ~ '^(admin|administrator|support|system|security|moderator)(_|$)' THEN
      RAISE EXCEPTION 'Invalid account username';
    END IF;
  ELSE
    chosen_handle := left(prefix, 16) || '_' || left(replace(new.id::text, '-', ''), 7);
  END IF;

  INSERT INTO public.profiles(id, handle, display_name)
  VALUES(new.id, chosen_handle, nickname);
  RETURN new;
END;
$$;
