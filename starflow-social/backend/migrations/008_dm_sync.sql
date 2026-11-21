-- Isolated incremental message synchronization foundation. No external network.
BEGIN;
CREATE SEQUENCE sf_core.dm_sync_seq AS bigint;
ALTER TABLE sf_core.direct_messages ADD COLUMN sync_seq bigint;
-- New backend only; existing fixture rows get stable sequence values.
UPDATE sf_core.direct_messages SET sync_seq=nextval('sf_core.dm_sync_seq');
ALTER TABLE sf_core.direct_messages ALTER COLUMN sync_seq SET NOT NULL;
ALTER TABLE sf_core.direct_messages ADD UNIQUE(sync_seq);
CREATE INDEX dm_sync_sender ON sf_core.direct_messages(sender_id,sync_seq);
CREATE INDEX dm_sync_recipient ON sf_core.direct_messages(recipient_id,sync_seq);
CREATE FUNCTION sf_core.assign_dm_sync_seq() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- Serialize sequence allocation until commit, so later cursor cannot skip an earlier uncommitted insert.
 PERFORM pg_advisory_xact_lock(813266,7);
 NEW.sync_seq:=nextval('sf_core.dm_sync_seq');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sf_core.assign_dm_sync_seq() FROM PUBLIC;
CREATE TRIGGER dm_sync_sequence BEFORE INSERT ON sf_core.direct_messages FOR EACH ROW EXECUTE FUNCTION sf_core.assign_dm_sync_seq();
REVOKE ALL ON SEQUENCE sf_core.dm_sync_seq FROM PUBLIC;
-- Invoker retains message RLS; client cannot select other users' streams.
CREATE FUNCTION sf_core.read_dm_delta(p_after bigint,p_limit int DEFAULT 50)
RETURNS TABLE(sync_seq bigint,id uuid,sender_id uuid,recipient_id uuid,body text,created_at timestamptz)
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT m.sync_seq,m.id,m.sender_id,m.recipient_id,m.body,m.created_at FROM sf_core.direct_messages m
 WHERE sf_core.request_principal() IS NOT NULL AND p_after>=0 AND m.sync_seq>p_after
 ORDER BY m.sync_seq LIMIT least(greatest(coalesce(p_limit,50),1),100)
$$;
REVOKE ALL ON FUNCTION sf_core.read_dm_delta(bigint,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sf_core.read_dm_delta(bigint,int) TO sf_profile_runtime;
COMMIT;
