import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../components/StarflowAiWidget.tsx',import.meta.url),'utf8');
test('iPhone AI panel measures visible viewport instead of extending behind keyboard',()=>{
 assert.match(src,/window\.visualViewport/);
 assert.match(src,/visualViewport\?\.addEventListener\('resize'/);
 assert.match(src,/visualViewport\?\.addEventListener\('scroll'/);
 assert.match(src,/style=\{mobilePanelStyle\}/);
 assert.match(src,/Math\.min\(560,visualWindow\.height-18\)/);
});
test('typing never triggers huge page zoom, hidden nav or doubled floating action',()=>{
 assert.match(src,/font-size:16px!important/);
 assert.match(src,/setTyping\(true\)/);
 assert.match(src,/sf-mobile-five-nav\{visibility:hidden/);
 assert.match(src,/\{!open && <button type="button" className="sfai-launcher"/);
 assert.match(src,/starflow-official-mark\.webp/);
});
