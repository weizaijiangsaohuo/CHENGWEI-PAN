import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261012020000_starflow_public_ip_region.sql');
const api=read('app/api/account/ip-region/route.ts');
const utility=read('lib/ip-region.ts');
const about=read('components/StarflowAccountAbout.tsx');
const admin=read('components/StarflowSuperAdmin.tsx');
const sync=read('components/StarflowIPRegionSync.tsx');
const layout=read('app/layout.tsx');

test('rollout defaults to disabled and RLS prevents premature public disclosure',()=>{
 for(const str of [
  'enabled boolean NOT NULL DEFAULT false',
  'VALUES(true,false)',
  'ENABLE ROW LEVEL SECURITY',
  "USING ((SELECT enabled FROM public.sf_ip_region_policy WHERE id=true))",
  'GRANT SELECT(user_id,country_code,subdivision_code,source,updated_at)',
  'UPDATE public.sf_ip_region_policy SET enabled=true'
 ])assert.ok(sql.includes(str),'missing privacy gate '+str);
 assert.ok(sql.includes('CREATE POLICY sf_public_ip_region_read'));
 assert.ok(!sql.includes('CREATE POLICY sf_public_ip_region_read ON public.sf_public_ip_region FOR ALL'));
});

test('only trusted server records Cloudflare country and province, never raw IP or GPS',()=>{
 for(const str of [
 "getCloudflareContext()",
 "context.cf?.country",
 "context.cf?.regionCode",
 "viewer.auth.getUser(bearer[1])",
 "sf_ip_region_policy",
 "sf_record_auto_ip_region",
 "SUPABASE_SERVICE_ROLE_KEY",
 "sanitizeCountry",
 "sanitizeSubdivision"
 ])assert.ok(api.includes(str),'missing server protection '+str);
 for(const forbidden of [
  "request.json(", "cf-connecting-ip","x-forwarded-for","NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
  "request.headers.get('cf-ipcountry')", "navigator.geolocation"
 ])assert.ok(!api.includes(forbidden),'untrusted location/IP access '+forbidden);
 assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.sf_record_auto_ip_region(uuid,text,text) TO service_role'));
 assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.sf_record_auto_ip_region(uuid,text,text) FROM PUBLIC,anon,authenticated'));
});

test('admin correction is founder or super-admin only, recorded and not spoofed as automatic',()=>{
 for(const str of [
 "role_name NOT IN ('founder','super_admin')",
 "sf_admin_activity",
 "'ip_region.correct'",
 "'ip_region.reset'",
 "source='reviewed'",
 "WHERE public.sf_public_ip_region.source='auto'",
 "p_reason",
 "REVOKE ALL ON FUNCTION public.sf_admin_correct_ip_region(uuid,text,text,text) FROM PUBLIC,anon"
 ])assert.ok(sql.includes(str),'missing privileged audit protection '+str);
 for(const str of [
 "role||''",
 "sf_admin_correct_ip_region",
 "sf_admin_clear_ip_region_override",
 "人工更正",
 "更正理由（10–500字）"
 ])assert.ok(admin.includes(str),'missing admin control '+str);
});

test('site displays only coarse regions with honest corrections and unknown fallback',()=>{
 for(const str of [
 "AH:'安徽'","BJ:'北京'","GD:'广东'",
 "CN_PROVINCES", "中国（省份未知）","未知",
 "Intl.DisplayNames(['zh-CN']"
 ])assert.ok(utility.includes(str));
 for(const str of [
  "sf_public_ip_region","sf_ip_region_policy",
  "coarseRegionName(", "平台人工更正", "forcedRegion",
  "不包含完整 IP 地址"
 ])assert.ok(about.includes(str));
 assert.ok(!about.includes('真实 IP:'));
 assert.ok(about.includes('!info.forcedRegion'));
});

test('session sync is authenticated and throttled, no client-supplied location',()=>{
 for(const str of [
  "auth.getSession()","auth.onAuthStateChange(",
  "sessionStorage.getItem(", "12*60*60*1000",
  "fetch('/api/account/ip-region'","Bearer "
 ])assert.ok(sync.includes(str));
 for(const prohibited of ["country_code:","subdivision_code:","ip_address:","navigator.geolocation"]){
  assert.ok(!sync.includes(prohibited),'client must not supply '+prohibited);
 }
 assert.ok(layout.includes('<StarflowIPRegionSync/>'));
});
