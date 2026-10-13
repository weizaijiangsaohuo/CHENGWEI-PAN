-- Backwards-compatible upgrade for production communities installed before join approval.
-- Retains all existing communities and members; no deletes or truncations.
ALTER TABLE public.communities
 ADD COLUMN IF NOT EXISTS join_policy text NOT NULL DEFAULT 'open';
DO $compat$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.communities'::regclass
   AND conname='communities_join_policy_check'
 ) THEN
  ALTER TABLE public.communities ADD CONSTRAINT communities_join_policy_check
   CHECK(join_policy IN ('open','approval'));
 END IF;
END $compat$;
ALTER TABLE public.community_members
 DROP CONSTRAINT IF EXISTS community_members_role_check;
ALTER TABLE public.community_members ADD CONSTRAINT community_members_role_check
 CHECK(role IN ('owner','moderator','member'));
