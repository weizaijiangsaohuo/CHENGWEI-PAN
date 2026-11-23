-- Additive migration for the isolated new backend only. Keep all existing DMs.
BEGIN;
ALTER TABLE sf_core.direct_messages ADD COLUMN client_request_id uuid;
ALTER TABLE sf_core.direct_messages ADD CONSTRAINT dm_sender_request_unique UNIQUE(sender_id,client_request_id);
GRANT INSERT(client_request_id) ON sf_core.direct_messages TO sf_profile_runtime;
COMMIT;
