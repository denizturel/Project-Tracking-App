-- Doneva: block and report a person in private messages. Safe to run twice.

-- 1. Blocks: neither side can message the other or ask to connect while a block exists.
create table if not exists public.user_blocks (
  blocker uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists user_blocks_blocked on public.user_blocks (blocked);
alter table public.user_blocks enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'user_blocks' and policyname = 'user_blocks_select') then
    -- Only the person who blocked sees it. The blocked person is not told.
    create policy user_blocks_select on public.user_blocks for select to authenticated
      using (blocker = (select auth.uid()));
    create policy user_blocks_insert on public.user_blocks for insert to authenticated
      with check (blocker = (select auth.uid()));
    create policy user_blocks_delete on public.user_blocks for delete to authenticated
      using (blocker = (select auth.uid()));
  end if;
end $$;

create or replace function public.blocked_between(other uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select exists (select 1 from public.user_blocks b
                  where (b.blocker = auth.uid() and b.blocked = other)
                     or (b.blocker = other and b.blocked = auth.uid()))
$$;
revoke execute on function public.blocked_between(uuid) from public, anon;
grant execute on function public.blocked_between(uuid) to authenticated;

create or replace function public.can_message(other uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select auth.uid() is not null and other <> auth.uid()
    and not public.blocked_between(other)
    and (
    exists (select 1 from public.connections c
             where c.status = 'accepted'
               and ((c.requester = auth.uid() and c.addressee = other)
                 or (c.requester = other and c.addressee = auth.uid())))
    or exists (select 1 from public.project_members a join public.project_members b using (project_id)
                where a.user_id = auth.uid() and b.user_id = other))
$$;

alter policy connections_insert on public.connections
  with check (requester = (select auth.uid()) and status = 'pending' and not public.blocked_between(addressee));

-- 2. Reports: kept for the people who run Doneva. Nobody can read them from the app.
create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reported uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 1000),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.user_reports enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'user_reports' and policyname = 'user_reports_insert') then
    create policy user_reports_insert on public.user_reports for insert to authenticated
      with check (reporter = (select auth.uid()) and reported <> (select auth.uid()) and not handled
                  and (conversation_id is null or public.can_see_conversation(conversation_id)));
  end if;
end $$;

create or replace trigger limit_reports before insert on public.user_reports
  for each row execute function public.rate_limit('reporter', '10', '1 day', 'reports');
create or replace trigger limit_blocks before insert on public.user_blocks
  for each row execute function public.rate_limit('blocker', '50', '1 day', 'blocks');
