-- Extend existing verification authorization to least-privileged staff roles.
CREATE OR REPLACE FUNCTION public.review_verification_application(p_application uuid, p_decision text, p_note text DEFAULT ''::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE item public.verification_applications%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.sf_admin_has_permission('verifications.manage') THEN RAISE EXCEPTION 'Admin required';END IF;
 IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid review outcome';END IF;
 IF char_length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'Review note too long';END IF;
 SELECT * INTO item FROM public.verification_applications WHERE id=p_application FOR UPDATE;
 IF NOT FOUND OR item.status<>'pending' THEN RAISE EXCEPTION 'Application not pending';END IF;
 UPDATE public.verification_applications SET status=p_decision,reviewed_at=now(),reviewer_note=left(coalesce(p_note,''),1000) WHERE id=item.id;
 IF p_decision='approved' THEN
  INSERT INTO public.account_verifications(profile_id,verification_type,status,reviewed_at,reviewer_id,reviewer_note,updated_at)
  VALUES(item.user_id,item.verification_type,'approved',now(),auth.uid(),left(coalesce(p_note,''),1000),now())
  ON CONFLICT(profile_id) DO UPDATE SET verification_type=excluded.verification_type,status='approved',
  reviewed_at=now(),reviewer_id=excluded.reviewer_id,reviewer_note=excluded.reviewer_note,updated_at=now();
 END IF;
 INSERT INTO public.verification_audit(application_id,reviewer_id,user_id,old_status,new_status,note)
 VALUES(item.id,auth.uid(),item.user_id,item.status,p_decision,left(coalesce(p_note,''),1000));
 RETURN true;
END $function$

CREATE OR REPLACE FUNCTION public.revoke_account_verification(p_profile_id uuid, p_reason text DEFAULT ''::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE app_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.sf_admin_has_permission('verifications.manage') THEN RAISE EXCEPTION 'Admin required';END IF;
 IF char_length(coalesce(p_reason,''))>1000 THEN RAISE EXCEPTION 'Reason too long';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.account_verifications WHERE profile_id=p_profile_id AND status='approved' FOR UPDATE)
 THEN RAISE EXCEPTION 'No active verification found';END IF;
 SELECT id INTO app_id FROM public.verification_applications WHERE user_id=p_profile_id AND status='approved'
 ORDER BY submitted_at DESC LIMIT 1;
 IF app_id IS NULL THEN RAISE EXCEPTION 'No corresponding approved application found';END IF;
 UPDATE public.account_verifications SET status='revoked',reviewer_id=auth.uid(),reviewed_at=now(),
 reviewer_note=left(coalesce(p_reason,''),1000),updated_at=now() WHERE profile_id=p_profile_id;
 INSERT INTO public.verification_audit(application_id,reviewer_id,user_id,old_status,new_status,note)
 VALUES(app_id,auth.uid(),p_profile_id,'approved','revoked',left(coalesce(p_reason,''),1000));
 RETURN true;
END $function$


DROP POLICY IF EXISTS sf_reviewer_read_applications ON public.verification_applications;
CREATE POLICY sf_reviewer_read_applications ON public.verification_applications FOR SELECT TO authenticated USING((SELECT public.sf_admin_has_permission('verifications.manage')));
DROP POLICY IF EXISTS sf_reviewer_read_audit ON public.verification_audit;
CREATE POLICY sf_reviewer_read_audit ON public.verification_audit FOR SELECT TO authenticated USING((SELECT public.sf_admin_has_permission('verifications.manage')));
