-- Extend private, participant-authorized voice messages to OS-native audio formats.
UPDATE storage.buckets SET allowed_mime_types=ARRAY['audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/aac'] WHERE id='sf-private-dm-voice';
CREATE OR REPLACE FUNCTION public.sf_dm_voice_can_access(p_name text,p_write boolean DEFAULT false)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
 AS $fn$
 SELECT (SELECT auth.uid()) IS NOT NULL
  AND p_name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webm|mp4|ogg|mp3|m4a|wav|aac)$'
  AND EXISTS (
   SELECT 1 FROM public.dm_conversations dc
   WHERE dc.id::text=split_part(p_name,'/',1)
    AND (dc.user_low=(SELECT auth.uid()) OR dc.user_high=(SELECT auth.uid()))
    AND (NOT p_write OR (
      split_part(p_name,'/',2)=(SELECT auth.uid())::text AND
      public.sf_dm_can_send(dc.id)
    ))
  );
 $fn$;
