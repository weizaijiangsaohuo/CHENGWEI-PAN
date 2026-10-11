import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261011_staging_p0_private_direct_messages.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../components/StarflowMessages.tsx', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/messages/page.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../components/SocialApp.tsx', import.meta.url), 'utf8');

test('private conversations and messages are protected by explicit participant RLS', () => {
  for (const table of ['dm_conversations', 'dm_messages', 'dm_read_state']) {
    assert.match(sql, new RegExp('ALTER TABLE public\\.' + table + ' ENABLE ROW LEVEL SECURITY'));
    assert.match(sql, new RegExp('REVOKE ALL ON public\\.' + table + ' FROM anon, authenticated'));
  }
  assert.match(sql, /CREATE POLICY dm_participants_read_conversations/);
  assert.match(sql, /CREATE POLICY dm_members_read_messages/);
  assert.match(sql, /CREATE POLICY dm_members_send_messages/);
  assert.match(sql, /sender_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(sql, /CREATE POLICY dm_only_own_read_state/);
  assert.match(sql, /GRANT INSERT \(conversation_id, sender_id, body\)/);
  assert.doesNotMatch(sql, /GRANT (UPDATE|DELETE) ON public\.dm_messages TO authenticated/);
});

test('DMs use authenticated RPCs and a database-backed messaging screen', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.sf_dm_open/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.sf_dm_mark_read/);
  assert.match(sql, /ON CONFLICT \(user_low,\s*user_high\) DO NOTHING/);
  assert.match(ui, /\.rpc\('sf_dm_open'/);
  assert.match(ui, /\.rpc\('sf_dm_mark_read'/);
  assert.match(ui, /\.from\('dm_messages'\)\.insert/);
  assert.match(ui, /\.from\('dm_conversations'\)/);
  assert.match(ui, /\.from\('dm_read_state'\)/);
  assert.match(ui, /setInterval/);
  assert.match(route, /<StarflowMessages\s*\/>/);
  assert.doesNotMatch(route, /redirect\('\/support'\)/);
  assert.match(app, /href="\/messages"/);
  assert.match(app, /href=\{'\/messages\?to='/);
});


test('DM blocking is server-enforced, and receipts are participant-scoped', () => {
  const controls = readFileSync(new URL('../supabase/migrations/20261011_dm_blocks_and_read_receipts.sql', import.meta.url), 'utf8');
  assert.match(controls, /CREATE TABLE IF NOT EXISTS public\.dm_blocks/);
  assert.match(controls, /ALTER TABLE public\.dm_blocks ENABLE ROW LEVEL SECURITY/);
  assert.match(controls, /CREATE POLICY dm_own_blocks_insert/);
  assert.match(controls, /CREATE OR REPLACE FUNCTION public\.sf_dm_can_send/);
  assert.match(controls, /NOT EXISTS[\s\S]*FROM public\.dm_blocks/);
  assert.match(controls, /CREATE POLICY dm_members_send_messages/);
  assert.match(controls, /public\.sf_dm_can_send\(conversation_id\)/);
  assert.match(controls, /CREATE POLICY dm_participants_read_state/);
  assert.match(ui, /\.from\('dm_blocks'\)\.insert/);
  assert.match(ui, /\.from\('dm_blocks'\)\.delete/);
  assert.match(ui, /\.rpc\('sf_dm_can_send'/);
  assert.match(ui, /className="sf-dm-read-receipt"/);
  assert.match(app, /dmUnread>0/);
});
