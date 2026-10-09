-- 在完成 001_initial.sql 后执行此文件。
-- 保存欢迎邮件发送状态；不对浏览器用户公开任何记录或写操作。
create table if not exists public.welcome_email_deliveries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null check (state in ('sending', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text
);
alter table public.welcome_email_deliveries enable row level security;
revoke all on public.welcome_email_deliveries from public, anon, authenticated;

-- 原子认领发送任务：重复登录、多个标签页不会同时发送相同邮件。
create or replace function public.claim_welcome_email(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  insert into public.welcome_email_deliveries as d (user_id, state, attempt_count, claimed_at)
  values (p_user_id, 'sending', 1, now())
  on conflict (user_id) do update
    set state = 'sending',
        attempt_count = d.attempt_count + 1,
        claimed_at = now()
    where d.attempt_count < 5 and
      (d.state = 'failed' or
        (d.state = 'sending' and d.claimed_at < now() - interval '3 minutes'))
  returning user_id into v_user;
  return v_user is not null;
end; $$;

create or replace function public.complete_welcome_email(p_user_id uuid, p_message_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.welcome_email_deliveries
  set state = 'sent', sent_at = now(), provider_message_id = p_message_id
  where user_id = p_user_id and state = 'sending';
end; $$;

create or replace function public.fail_welcome_email(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.welcome_email_deliveries set state = 'failed'
  where user_id = p_user_id and state = 'sending';
end; $$;

revoke all on function public.claim_welcome_email(uuid) from public, anon, authenticated;
revoke all on function public.complete_welcome_email(uuid,text) from public, anon, authenticated;
revoke all on function public.fail_welcome_email(uuid) from public, anon, authenticated;
grant execute on function public.claim_welcome_email(uuid) to service_role;
grant execute on function public.complete_welcome_email(uuid,text) to service_role;
grant execute on function public.fail_welcome_email(uuid) to service_role;
