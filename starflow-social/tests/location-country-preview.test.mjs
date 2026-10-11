import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const route=readFileSync(new URL('../app/api/account/location/route.ts',import.meta.url),'utf8');
const about=readFileSync(new URL('../components/StarflowAccountAbout.tsx',import.meta.url),'utf8');
test('Authenticated Cloudflare country preview works without service role key, but cannot persist',()=>{
 assert.match(route,/viewer\.auth\.getUser\(match\[1\]\)/);
 assert.match(route,/\.select\('is_public'\)\.eq\('user_id',identity\.user\.id\)/);
 assert.match(route,/if\(!settings\?\.is_public\)return reply\(/);
 assert.match(route,/context\.cf\?\.country/);
 assert.match(route,/if\(!secret\)return reply\(\{/);
 assert.match(route,/saved:false/);
 assert.match(route,/\.eq\('user_id',identity\.user\.id\)\.eq\('is_public',true\)/);
 assert.match(route,/saved:true/);
 assert.doesNotMatch(route,/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
 assert.doesNotMatch(route,/request\.json\(/);
});
test('Account info accurately distinguishes preview from permanent saved location',()=>{
 assert.match(about,/const \[countryPreview,setCountryPreview\]/);
 assert.match(about,/if\(data\.saved\)/);
 assert.match(about,/本次预览，未保存/);
 assert.match(about,/尚未保存/);
 assert.match(about,/不记录原始 IP/);
});
