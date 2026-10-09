-- 在 Supabase SQL Editor 上以项目管理员身份执行以下只读检查：
-- 1) 检查社交业务表 RLS 是否启用，必须全部为 true。
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
('profiles','posts','likes','follows','reposts','bookmarks','notifications','reports')
order by table_name;

-- 2) 检查关键触发器是否存在。
select tgname as trigger_name, tgrelid::regclass as on_table
from pg_trigger
where not tgisinternal and tgname in
('on_auth_user_created','posts_limit','notify_follow','notify_like','notify_repost','notify_reply')
order by tgname;

-- 3) 检查通知表 UPDATE 是否只授权 read_at 列。
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema='public' and table_name='notifications' and grantee='authenticated'
order by privilege_type, column_name;
