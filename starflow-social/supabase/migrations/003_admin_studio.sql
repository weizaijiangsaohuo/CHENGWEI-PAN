-- Starflow v3: optional secure moderation studio.
-- Run AFTER 001_initial.sql and 002_welcome_email.sql in Supabase SQL Editor.
-- The owner must insert their own auth.users UUID into public.platform_admins from the SQL Editor.
-- NEVER give users a button that can grant themselves this role.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;
grant select on public.platform_admins to authenticated;
create policy "only inspect own admin membership" on public.platform_admins
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.platform_admins where user_id = (select auth.uid())) $$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

alter table public.reports add column if not exists reviewed_at timestamptz;
alter table public.reports add column if not exists reviewed_by uuid references public.profiles(id);
create index if not exists reports_review_queue_idx on public.reports(reviewed_at,created_at desc);

create policy "admins can inspect reports" on public.reports for select to authenticated
  using ((select public.is_platform_admin()));
create policy "admins can review reports" on public.reports for update to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

-- Keep report contents, reporter and post immutable from the browser.
revoke update, delete on public.reports from anon, authenticated;
grant update (reviewed_at) on public.reports to authenticated;
create or replace function public.record_report_review()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.reviewed_at is distinct from old.reviewed_at then
    new.reviewed_at := now();
    new.reviewed_by := (select auth.uid());
  end if;
  return new;
end; $$;
create trigger report_review_audit before update on public.reports
  for each row execute procedure public.record_report_review();
-- Example administrator grant (run manually, replacing UUID with YOUR auth.users id):
-- insert into public.platform_admins(user_id) values ('YOUR-UUID-HERE');
