import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const messages = read('../components/StarflowMessages.tsx');
const notifications = read('../components/StarflowNotificationCenter.tsx');
const social = read('../components/SocialApp.tsx');
const migration = read('../supabase/migrations/20261012_dm_notification_realtime.sql');

test('Realtime publishes only the four private conversation and notification tables',()=>{
 for(const table of ['dm_conversations','dm_messages','dm_read_state','notifications']){
   assert.match(migration,new RegExp("'"+table+"'"));
 }
 assert.match(migration,/pg_publication_tables/);
 assert.match(migration,/ALTER PUBLICATION supabase_realtime ADD TABLE public\.%I/);
 assert.doesNotMatch(migration,/DISABLE ROW LEVEL SECURITY|DROP POLICY|DROP TABLE/i);
});

test('Private inbox changes follow participant IDs; open messages follow conversation ID',()=>{
 assert.match(messages,/table: 'dm_conversations',[\s\S]*?filter: 'user_low=eq\.' \+ user\.id/);
 assert.match(messages,/table: 'dm_conversations',[\s\S]*?filter: 'user_high=eq\.' \+ user\.id/);
 assert.match(messages,/table: 'dm_messages',[\s\S]*?filter: 'conversation_id=eq\.' \+ activeId/);
 assert.match(messages,/table: 'dm_read_state',[\s\S]*?filter: 'conversation_id=eq\.' \+ activeId/);
 assert.match(messages,/removeChannel\(inboxChannel\)/);
 assert.match(messages,/removeChannel\(threadChannel\)/);
 assert.match(messages,/visibilitychange/);
 assert.match(messages,/setInterval\(/);
});

test('Notification timeline and badge receive authenticated filtered inserts/updates',()=>{
 assert.match(notifications,/table: 'notifications',[\s\S]*?filter: 'recipient_id=eq\.' \+ data\.user\.id/);
 assert.match(notifications,/removeChannel\(channel\)/);
 assert.match(notifications,/sf-notifications-updated/);
 assert.match(social,/table:'notifications',filter:'recipient_id=eq\.'\+user\.id/);
 assert.match(social,/table:'dm_read_state',filter:'user_id=eq\.'\+user\.id/);
 assert.match(social,/removeChannel\(channel\)/);
 assert.match(notifications,/setInterval\(/);
});
