import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const social=read('components/SocialApp.tsx');
const helper=read('lib/notification-experience.ts');
const styles=read('app/starflow-2.css');

test('search defers expensive Supabase fan-out until input settles, with stale reply guards',()=>{
 assert.match(social,/const \[settledSearch,setSettledSearch\]=useState\(''\)/);
 assert.match(social,/window\.setTimeout\(\(\)=>setSettledSearch\(search\.trim\(\)\),350\)/);
 assert.match(social,/window\.clearTimeout\(timer\)/);
 assert.match(social,/const epoch=\+\+loadEpoch\.current/);
 assert.match(social,/if\(epoch!==loadEpoch\.current\)return/);
 assert.match(social,/finally\{if\(epoch===loadEpoch\.current\)setLoading\(false\)\}/);
 assert.match(social,/const term=settledSearch\.trim\(\)/);
 assert.match(social,/view,target,settledSearch,tab,loadBadges/);
});
test('explore category tabs and clear/retry state map to actual posted results and profiles',()=>{
 assert.match(social,/role="search"/);
 assert.match(social,/type="search"/);
 assert.match(social,/aria-pressed=\{searchFilter===group\}/);
 assert.match(social,/setSearchFilter\(group\)/);
 assert.match(social,/setSettledSearch\(''\)/);
 assert.match(social,/view==='explore'&&searchFilter==='people'\?null/);
 assert.match(social,/setAccounts\(\(u\|\|\[\]\) as Profile\[\]\)/);
 assert.match(social,/!searchPending&&!loading/);
 assert.match(styles,/\.sf2-explore-filters/);
});
test('notification category and route decisions come from persisted kinds',()=>{
 for(const kind of ['follow','like','reply','repost','mention','direct_message',
  'verification_approved','verification_rejected','verification_revoked',
  'account_warning','system_announcement','affiliation_invite','appeal_result']){
  assert.ok(helper.includes(kind),'missing kind: '+kind);
 }
 assert.match(helper,/export function visibleNotifications/);
 assert.match(helper,/export function notificationTarget/);
 assert.match(helper,/if\(note\.kind==='direct_message'\)return '\/messages'/);
 assert.match(helper,/if\(INTERACTION\.has\(note\.kind\)\&\&note\.post_id\)/);
 assert.match(helper,/return '\/notifications\/'\+encodeURIComponent\(note\.id\)/);
 assert.match(social,/notificationLabel\(note\.kind,isEnglishLocale\(lang\)\)/);
 assert.match(social,/notificationTarget\(note,actor\)/);
 assert.match(social,/aria-pressed=\{notificationFilter===group\}/);
 assert.match(social,/visibleNotifications\(notifs,notificationFilter\)/);
 assert.match(styles,/\.sf2-notification-tabs/);
});
test('no backend privileges, secrets or invented notification payloads introduced',()=>{
 assert.doesNotMatch(helper,/service_role|supabaseAdmin|private[_-]key|fake_count/);
 assert.match(social,/\.eq\('recipient_id',user\.id\)/);
 assert.match(social,/\.is\('read_at',null\)/);
});
