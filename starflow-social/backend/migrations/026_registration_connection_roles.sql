-- Disabled dedicated service roles only. No passwords, no login, no direct table grants.
-- Apply on isolated staging after 025 and acceptance; never automatically on production.
BEGIN;
CREATE ROLE sf_fresh_account_connect NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT sf_fresh_account_gateway TO sf_fresh_account_connect WITH SET TRUE, INHERIT FALSE;
CREATE ROLE sf_registration_connect NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT sf_registration_issuer TO sf_registration_connect WITH SET TRUE, INHERIT FALSE;
CREATE ROLE sf_mail_budget_connect NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT sf_mail_budget_gateway TO sf_mail_budget_connect WITH SET TRUE, INHERIT FALSE;
DO $$
BEGIN
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO sf_fresh_account_connect,sf_registration_connect,sf_mail_budget_connect',current_database());
END $$;
COMMIT;
