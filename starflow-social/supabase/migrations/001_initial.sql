-- 星流 Starflow：在全新 Supabase 项目的 SQL Editor 中一次性执行。
-- 对所有带用户内容的表启用 RLS；浏览器端只使用 anon key，绝不可泄露 service_role。
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default '新朋友' check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 160),
  avatar_url text check (avatar_url is null or (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  prefix text;
  nickname text;
begin
  prefix := lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(prefix) < 2 then prefix := 'user'; end if;
  nickname := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
                    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), '新朋友'), 60);
  insert into public.profiles(id, handle, display_name)
  values(new.id, left(prefix, 16) || '_' || left(replace(new.id::text, '-', ''), 7), nickname);
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 280),
  image_url text check (image_url is null or (char_length(image_url) <= 2048 and image_url ~ '^https://')),
  parent_id uuid references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint posts_nonempty check (char_length(btrim(content)) > 0 or image_url is not null),
  constraint posts_not_self_reply check (id is distinct from parent_id)
);
create index posts_created_idx on public.posts (created_at desc);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_parent_idx on public.posts (parent_id, created_at);

-- 基础限流：同一账号至少间隔 5 秒发布，以减轻垃圾消息影响。
create or replace function public.post_rate_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- 防止篡改客户端 created_at 绕过限流；同账户并行请求串行处理。
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.author_id::text, 52));
  new.created_at := now();
  if exists (select 1 from public.posts p where p.author_id = new.author_id
             and p.created_at > now() - interval '5 seconds') then
    raise exception '发布太频繁，请在 5 秒后重试';
  end if;
  return new;
end; $$;
create trigger posts_limit before insert on public.posts
for each row execute procedure public.post_rate_guard();

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);
create index follows_target_idx on public.follows(following_id);

create table public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index likes_post_idx on public.likes(post_id);

create table public.reposts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index reposts_post_idx on public.reposts(post_id);

create table public.bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('follow', 'like', 'repost', 'reply')),
  post_id uuid references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_recipient_idx on public.notifications(recipient_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  reason text not null check (char_length(reason) between 5 and 500),
  created_at timestamptz not null default now(),
  unique (reporter_id, post_id)
);

-- 用户自行授权操作，无法靠修改浏览器请求越权。
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.follows enable row level security;
alter table public.likes enable row level security;
alter table public.reposts enable row level security;
alter table public.bookmarks enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;

create policy "read profiles" on public.profiles for select to authenticated using (true);
create policy "edit own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from anon, authenticated;
grant update (handle, display_name, bio, avatar_url) on public.profiles to authenticated;
-- Do not permit clients to change created_at/id; restrict UPDATE to whitelisted columns.
revoke update on public.profiles from anon, authenticated;
grant update (handle, display_name, bio, avatar_url) on public.profiles to authenticated;

create policy "read posts" on public.posts for select to authenticated using (true);
create policy "publish own posts" on public.posts for insert to authenticated with check (author_id = (select auth.uid()) and (image_url is null or image_url like ('https://%.supabase.co/storage/v1/object/public/post-media/' || (select auth.uid())::text || '/%')));
create policy "delete own posts" on public.posts for delete to authenticated using (author_id = (select auth.uid()));

create policy "read follows" on public.follows for select to authenticated using (true);
create policy "follow as self" on public.follows for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "unfollow as self" on public.follows for delete to authenticated using (follower_id = (select auth.uid()));

create policy "read likes" on public.likes for select to authenticated using (true);
create policy "like as self" on public.likes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "unlike as self" on public.likes for delete to authenticated using (user_id = (select auth.uid()));

create policy "read reposts" on public.reposts for select to authenticated using (true);
create policy "repost as self" on public.reposts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "unrepost as self" on public.reposts for delete to authenticated using (user_id = (select auth.uid()));

create policy "read own bookmarks" on public.bookmarks for select to authenticated using (user_id = (select auth.uid()));
create policy "bookmark as self" on public.bookmarks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "remove own bookmark" on public.bookmarks for delete to authenticated using (user_id = (select auth.uid()));

create policy "read own notifications" on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy "mark own notifications" on public.notifications for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

create policy "read own reports" on public.reports for select to authenticated using (reporter_id = (select auth.uid()));
create policy "submit own reports" on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));

-- 只由可信 DB 触发器创建通知；前端用户无法伪造他人通知。
create or replace function public.send_activity_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid; actor uuid; target uuid; action_type text;
begin
  if tg_table_name = 'follows' then
    actor := new.follower_id; recipient := new.following_id; target := null; action_type := 'follow';
  elsif tg_table_name = 'likes' then
    actor := new.user_id; select author_id into recipient from public.posts where id = new.post_id;
    target := new.post_id; action_type := 'like';
  elsif tg_table_name = 'reposts' then
    actor := new.user_id; select author_id into recipient from public.posts where id = new.post_id;
    target := new.post_id; action_type := 'repost';
  elsif tg_table_name = 'posts' and new.parent_id is not null then
    actor := new.author_id; select author_id into recipient from public.posts where id = new.parent_id;
    target := new.parent_id; action_type := 'reply';
  end if;
  if recipient is not null and actor is not null and actor <> recipient then
    insert into public.notifications(recipient_id, actor_id, post_id, kind)
    values(recipient, actor, target, action_type);
  end if;
  return new;
end; $$;
create trigger notify_follow after insert on public.follows for each row execute procedure public.send_activity_notification();
create trigger notify_like after insert on public.likes for each row execute procedure public.send_activity_notification();
create trigger notify_repost after insert on public.reposts for each row execute procedure public.send_activity_notification();
create trigger notify_reply after insert on public.posts for each row execute procedure public.send_activity_notification();

-- 对通知列权限进一步收紧：登录用户只能标记 read_at，不能修改 actor/kind/recipient/post。
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
-- 浏览器无需创建通知的权限。
revoke insert, delete on public.notifications from anon, authenticated;

-- 图片存储；必须公开才能让动态中的图片可被直接访问。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media','post-media',true,5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
create policy "public post images" on storage.objects for select to public using (bucket_id = 'post-media');
create policy "upload own post images" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "remove own post images" on storage.objects for delete to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
