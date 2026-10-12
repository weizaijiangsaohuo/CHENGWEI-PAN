import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const about=read('components/StarflowAccountAbout.tsx');
const css=read('app/starflow-account-about.css');
const location=read('app/api/account/location/route.ts');

test('Country preview is labeled distinctly and cannot masquerade as a saved public region',()=>{
 assert.match(about,/className="sf-about-preview-tag">本次预览，未保存/);
 assert.match(about,/countryPreview&&!country\?\.country_code&&isOwner/);
 assert.match(about,/country\?\.country_code \? regionName\(country.country_code\)/);
 assert.match(about,/只有开启公开并成功保存后，其他用户才会看到国家／地区/);
 assert.match(about,/服务器安全写入功能需要管理员配置/);
 assert.match(about,/当前地区仅供预览，尚未保存到个人资料/);
 assert.match(css,/\.sf-about-preview-tag/);
 assert.match(css,/\.sf-about-region-warning/);
});

test('Never pretend that Cloudflare IP region is saved without secure server write',()=>{
 assert.match(about,/if\(data.saved\)/);
 assert.match(about,/setCountryPreview\(data.country_code\|\|null\)/);
 assert.match(about,/setNotice\(data.message\|\|/);
 assert.match(location,/\.SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(location,/if\(!secret\)return reply\(\{/);
 assert.match(location,/saved:false/);
 assert.match(location,/saved:true/);
 assert.match(location,/viewer\.auth\.getUser\(match\[1\]\)/);
 assert.match(location,/if\(!settings\?\.is_public\)return reply\(/);
 assert.doesNotMatch(location,/request\.json\(/);
 assert.doesNotMatch(location,/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});
