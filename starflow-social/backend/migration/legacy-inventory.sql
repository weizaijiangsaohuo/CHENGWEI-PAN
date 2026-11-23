-- Run against an authorized legacy backup/replica, NOT a public endpoint.
-- No row contents, credentials, or user identifiers leave the database.
-- Exact counts may be expensive; use a maintenance window on large backups.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
-- query_to_xml executes a SELECT only, with schema/table names quoted by format.
WITH relations AS (
 SELECT n.nspname AS schema_name,c.relname AS table_name,c.oid
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p') AND NOT c.relispartition
 AND (n.nspname='public' OR (n.nspname='auth' AND c.relname='users')
 OR (n.nspname='storage' AND c.relname IN ('objects','buckets')))
), inventory AS (
 SELECT schema_name,table_name,
 ((xpath('/table/row/row_count/text()',query_to_xml(
 format('SELECT count(*)::text AS row_count FROM %I.%I',schema_name,table_name),false,false,'')))[1])::text AS row_count,
 (SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_catalog.pg_attribute a
 WHERE a.attrelid=relations.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns
 FROM relations
)
SELECT jsonb_build_object('version',1,'tables',coalesce(jsonb_agg(to_jsonb(inventory) ORDER BY schema_name,table_name),'[]'::jsonb)) AS legacy_inventory
FROM inventory;
COMMIT;
