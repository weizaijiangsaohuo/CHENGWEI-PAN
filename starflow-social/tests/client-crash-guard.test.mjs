import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('recoverable UI errors show a real retry and return-home action',()=>{
 const error=read('app/error.tsx');
 assert.match(error,/reset\(\)/);
 assert.match(error,/window\.location\.reload\(\)/);
 assert.match(error,/加载遇到问题/);
});
test('root hydration failures get a readable standalone fallback',()=>{
 const error=read('app/global-error.tsx');
 assert.match(error,/<html lang="zh-CN">/);
 assert.match(error,/window\.location\.reload\(\)/);
 assert.match(error,/页面暂时无法显示/);
});
test('unstable new cinematic scripts are removed from production landing',()=>{
 const home=read('app/page.tsx');
 assert.doesNotMatch(home,/heroRef|portalStage|heroBackdrop|setProperty\('--sf-portal-/);
 assert.match(home,/sessionStorage\.getItem\('sf-entry-logo-seen'\)/);
 assert.match(home,/starflow-official-mark\.webp/);
});
