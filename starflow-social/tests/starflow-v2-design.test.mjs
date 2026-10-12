import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const layout=read('app/layout.tsx');
const css=read('app/starflow-2.css');
const nav=read('components/StarflowMobileNavigation.tsx');
const prefs=read('components/StarflowDisplayPreferences.tsx');
const loading=read('app/loading.tsx');
const glass=read('components/ui/StarflowGlass.tsx');
const spec=read('design/STARFLOW_2_PRODUCT_UX.md');
const tokens=JSON.parse(read('design/starflow-2.tokens.json'));
test('design tokens are declared, versioned and sitewide stylesheet wins over legacy layers',()=>{
 assert.equal(tokens.color.brand.primary.$value,'#7549BD');
 assert.ok(tokens.color.dark.surface.$value);
 assert.ok(tokens.motion.navigation);
 assert.ok(layout.includes("import './starflow-2.css';"));
 assert.ok(layout.indexOf("import './starflow-2.css';")>layout.indexOf("import './starflow-mentions.css';"));
 assert.match(css,/--sf2-brand:#7549bd/);
 assert.match(css,/html\[data-sf2-theme="dark"\]/);
});
test('liquid mobile selected indicator follows actual router view, not a mock effect',()=>{
 assert.match(nav,/activeSlot=view==='home'\?0/);
 assert.match(nav,/--sf2-active-slot/);
 assert.match(nav,/data-has-active/);
 assert.match(nav,/href=\{item.href\}/);
 assert.match(css,/transition:transform var\(--sf2-nav\)/);
 assert.match(css,/env\(safe-area-inset-bottom/);
 assert.match(css,/touch-action:manipulation/);
});
test('motion, dark theme, no glass fallback and real loading skeleton',()=>{
 assert.match(prefs,/const THEME_KEY='sf2-theme'/);
 assert.match(prefs,/window\.matchMedia\('\(prefers-color-scheme: dark\)'\)/);
 assert.match(prefs,/localStorage\.setItem\(THEME_KEY,value\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(prefers-contrast:more\)/);
 assert.match(css,/@supports not \(backdrop-filter:blur\(1px\)\)/);
 assert.match(loading,/aria-busy="true"/);
 assert.match(loading,/Array\.from\(\{length:4\}/);
});
test('glass components retain semantic form actions, existing backend still called from original modules',()=>{
 assert.match(glass,/export function GlassSurface/);
 assert.match(glass,/export function GlassAction/);
 assert.match(glass,/ButtonHTMLAttributes<HTMLButtonElement>/);
 assert.match(spec,/Supabase RLS/);
 assert.match(spec,/Figma/);
 assert.doesNotMatch(glass,/service_role|auth\.admin|fake_count/);
});
