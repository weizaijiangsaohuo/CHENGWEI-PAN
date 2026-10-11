import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const locale=read('lib/site-language.ts');
const page=read('app/page.tsx');
const motion=read('components/StarflowMotionShowcase.tsx');
const assembly=read('components/StarflowAssemblyHero.tsx');
const provider=read('components/LanguageProvider.tsx');
const ui=read('lib/i18n.ts');
test('nine language options retain country/region and script',()=>{
 for(const code of ['zh','en','zh-HK','ko-KR','ja-JP','en-SG','en-GB','de-DE','fr-FR'])assert.ok(ui.includes("code:'"+code+"'"));
 assert.match(provider,/sf-language/);
 assert.match(provider,/role="menuitemradio"/);
 assert.match(provider,/aria-checked/);
});
test('marketing text is localized for requested locales and honors region choice',()=>{
 for(const code of ['zh-HK','ko-KR','ja-JP','de-DE','fr-FR'])assert.ok(locale.includes('"'+code+'"'));
 assert.match(page,/siteText\(lang,english,chinese\)/);
 assert.match(page,/locale=\{lang\}/);
 assert.match(assembly,/siteText\(locale/);
 assert.match(motion,/siteText\(locale/);
 assert.doesNotMatch(page,/const en=lang==='en'/);
});
test('auth uses the selected English regional family',()=>{
 const auth=read('components/AuthPortal.tsx');
 assert.match(auth,/isEnglishLocale\(lang\)/);
});
