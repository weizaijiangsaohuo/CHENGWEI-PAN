-- Dedicated verifier gateway, no live calls, no raw evidence, no login credentials.
BEGIN;
CREATE ROLE sf_didit_reconcile_gateway NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
GRANT USAGE ON SCHEMA sf_core TO sf_didit_reconcile_gateway;
CREATE TABLE sf_core.didit_sandbox_workflows(
 workflow_id uuid NOT NULL,
 workflow_version integer NOT NULL CHECK(workflow_version>0),
 application_id uuid NOT NULL,
 document_node text NOT NULL CHECK(char_length(document_node) BETWEEN 1 AND 128),
 liveness_node text NOT NULL CHECK(char_length(liveness_node) BETWEEN 1 AND 128),
 face_node text NOT NULL CHECK(char_length(face_node) BETWEEN 1 AND 128),
 aml_node text CHECK(char_length(aml_node) BETWEEN 1 AND 128),
 enabled boolean NOT NULL DEFAULT false,
 PRIMARY KEY(workflow_id,workflow_version),
 CHECK(document_node<>liveness_node AND document_node<>face_node AND liveness_node<>face_node),
 CHECK(aml_node IS NULL OR aml_node NOT IN (document_node,liveness_node,face_node))
);
ALTER TABLE sf_core.didit_sandbox_workflows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sf_core.didit_sandbox_workflows FROM PUBLIC;
CREATE FUNCTION sf_core.resolve_didit_attempt(p_application uuid,p_workflow uuid,p_version integer,p_attempt uuid,p_session uuid)
RETURNS TABLE(revision bigint,document_node text,liveness_node text,face_node text,aml_node text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT a.revision,w.document_node,w.liveness_node,w.face_node,w.aml_node
 FROM sf_core.identity_attempts a JOIN sf_core.didit_sandbox_workflows w
 ON w.workflow_id=a.workflow_id AND w.workflow_version=a.workflow_version
 WHERE w.enabled AND w.application_id=p_application AND a.workflow_id=p_workflow
 AND a.workflow_version=p_version AND a.id=p_attempt AND a.provider_session_id=p_session AND a.environment='sandbox'
 AND a.state IN ('pending','review','declined','checks_passed')
$$;
CREATE FUNCTION sf_core.apply_didit_verified_result(p_application uuid,p_event uuid,p_attempt uuid,p_session uuid,p_workflow uuid,p_version integer,p_revision bigint,p_result text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- Recheck workflow configuration at write time and prevent concurrent disablement.
 PERFORM 1 FROM sf_core.didit_sandbox_workflows w WHERE w.workflow_id=p_workflow AND w.workflow_version=p_version
 AND w.application_id=p_application AND w.enabled FOR SHARE;
 IF NOT FOUND THEN RETURN 'rejected'; END IF;
 RETURN sf_core.apply_identity_decision(p_event,p_attempt,p_session,p_workflow,p_version,p_revision,p_result);
END $$;
REVOKE ALL ON FUNCTION sf_core.resolve_didit_attempt(uuid,uuid,integer,uuid,uuid),sf_core.apply_didit_verified_result(uuid,uuid,uuid,uuid,uuid,integer,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sf_core.resolve_didit_attempt(uuid,uuid,integer,uuid,uuid),sf_core.apply_didit_verified_result(uuid,uuid,uuid,uuid,uuid,integer,bigint,text) TO sf_didit_reconcile_gateway;
COMMIT;
