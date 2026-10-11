import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const center=read('../components/StarflowNotificationCenter.tsx');
const details=read('../components/StarflowNoticeDetail.tsx');
const css=read('../app/starflow-official-notifications.css');

test('Official notices use short trusted sender branding throughout the UI',()=>{
 assert.match(center,/system \? 'Starflow 官方' : actor\?\.display_name/);
 assert.match(details,/Starflow 官方'\}/);
 assert.doesNotMatch(center,/Starflow 官方系统/);
 assert.doesNotMatch(details,/Starflow 官方系统/);
});

test('Pinned official notifications display first including already-read notices',()=>{
 assert.match(center,/Number\(SYSTEM_KINDS\.has\(b\.kind\)\) - Number\(SYSTEM_KINDS\.has\(a\.kind\)\)/);
 assert.match(center,/Date\.parse\(b\.created_at\) - Date\.parse\(a\.created_at\)/);
 assert.match(center,/\.sort\(pinnedFirst\)/);
 assert.match(center,/system \? ' sf3-notification-pinned'/);
 assert.match(center,/system && <span className="sf3-official-pin"/);
 assert.match(css,/\.sf3-notification\.sf3-notification-pinned/);
 assert.match(css,/\.sf3-official-pin/);
});

test('Pinned official notices remain visible after many new activity notices',()=>{
 assert.match(center,/\.order\('created_at', \{ ascending: false \}\)\.limit\(100\)/);
 assert.match(center,/\.in\('kind', \[\.\.\.SYSTEM_KINDS\]\)\.order\('created_at', \{ ascending: false \}\)\.limit\(25\)/);
 assert.match(center,/\.map\(notice => \[notice\.id, notice\] as const\)/);
 assert.match(center,/\.eq\('recipient_id', userId\)/);
});
