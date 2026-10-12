import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('retired video workspaces and language dropdown are not public',()=>{
 assert.equal(existsSync(new URL('../app/ai-studio/page.tsx',import.meta.url)),false);
 assert.equal(existsSync(new URL('../public/starflow-video-editor.html',import.meta.url)),false);
 assert.equal(existsSync(new URL('../components/LanguageSwitch.css',import.meta.url)),false);
 const menu=read('components/StarflowHomeMenu.tsx');
 const social=read('components/SocialApp.tsx');
 const landing=read('app/page.tsx');
 const provider=read('components/LanguageProvider.tsx');
 const layout=read('app/layout.tsx');
 for(const source of [menu,social,landing])assert.doesNotMatch(source,/LanguageSwitch|\/ai-studio|\/starflow-video-editor\.html/);
 assert.doesNotMatch(menu,/星流 AI 图片与视频创作|免费视频创作工作台/);
 assert.match(provider,/fixedLanguage:Lang='zh'/);
 assert.match(layout,/starflow-clean-nav\.css/);
 assert.match(menu,/sf-clean-drawer/);
 assert.match(social,/sf-home-quiet-mark/);
});
test('social essentials remain reachable',()=>{
 const menu=read('components/StarflowHomeMenu.tsx');
 for(const path of ['\/explore','\/hub','\/creator','\/messages','\/support','\/bookmarks']){
  assert.match(menu,new RegExp("to:'"+path+"'"));
 }
});
