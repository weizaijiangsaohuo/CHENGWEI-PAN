import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../app/starflow-discovery-phase2.css',import.meta.url),'utf8');
const search=readFileSync(new URL('../components/StarflowDiscoveryPhase2.tsx',import.meta.url),'utf8');
test('Explore retains global Starflow branding without duplicate in-content logo',()=>{
 assert.match(search,/sf2-ai-title/);
 assert.match(css,/sf2-ai-search-slot \.sf-ai-heading\{display:none\}/);
});
