-- Return only whether the authenticated user owns a specific browser subscription.
-- No endpoints or encryption keys are returned through this RPC.
CREATE OR REPLACE FUNCTION public.sf_web_push_device_registered(p_endpoint text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
 SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.sf_web_push_subscriptions s
  WHERE s.user_id=(SELECT auth.uid()) AND s.endpoint=p_endpoint
 );
$f$;
REVOKE ALL ON FUNCTION public.sf_web_push_device_registered(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sf_web_push_device_registered(text) TO authenticated;
