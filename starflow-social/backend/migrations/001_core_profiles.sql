-- New isolated PostgreSQL database only; never apply to the old Supabase project.
-- Run as migration owner, not the application's login. No production grants or credentials.
BEGIN;
CREATE SCHEMA sf_core;
REVOKE ALL ON SCHEMA sf_core FROM PUBLIC;
CREATE ROLE sf_profile_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE TABLE sf_core.principals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Binding only via a future trusted Better Auth adapter / administrator recovery.
-- No matching by email, username or untrusted browser input.
CREATE TABLE sf_core.auth_bindings (
 principal_id uuid PRIMARY KEY REFERENCES sf_core.principals(id) ON DELETE CASCADE,
 auth_subject uuid NOT NULL UNIQUE,
 bound_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sf_core.profiles (
 id uuid PRIMARY KEY REFERENCES sf_core.principals(id) ON DELETE CASCADE,
 handle text NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9_]{3,24}$'),
 display_name text NOT NULL DEFAULT '新朋友' CHECK (char_length(display_name) BETWEEN 1 AND 60),
 bio text NOT NULL DEFAULT '' CHECK (char_length(bio)<=160),
 avatar_url text CHECK (avatar_url IS NULL OR (char_length(avatar_url)<=2048 AND avatar_url ~ '^https://')),
 created_at timestamptz NOT NULL DEFAULT now()
);
-- No public lookup until profile visibility and moderation are fully migrated.
CREATE FUNCTION sf_core.request_principal() RETURNS uuid LANGUAGE sql STABLE
 SET search_path = pg_catalog AS $$
 SELECT CASE WHEN current_setting('sf.principal_id',true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN current_setting('sf.principal_id',true)::uuid ELSE NULL END
$$;
REVOKE ALL ON FUNCTION sf_core.request_principal() FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA sf_core FROM PUBLIC;
ALTER TABLE sf_core.principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.auth_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_core.profiles FORCE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA sf_core TO sf_profile_runtime;
GRANT EXECUTE ON FUNCTION sf_core.request_principal() TO sf_profile_runtime;
GRANT SELECT ON sf_core.profiles TO sf_profile_runtime;
GRANT UPDATE (display_name,bio,avatar_url) ON sf_core.profiles TO sf_profile_runtime;
CREATE POLICY profile_read_self ON sf_core.profiles FOR SELECT TO sf_profile_runtime
 USING (id=sf_core.request_principal());
CREATE POLICY profile_edit_self ON sf_core.profiles FOR UPDATE TO sf_profile_runtime
 USING (id=sf_core.request_principal()) WITH CHECK (id=sf_core.request_principal());
COMMIT;
