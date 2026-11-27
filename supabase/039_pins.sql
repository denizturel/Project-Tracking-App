-- 039: each person can pin up to 2 companies and 2 projects to the top of their lists
-- (decided by Deniz, 2026-11-27). One row per person, readable and writable only by that person.
-- The ids are plain lists with no link to the other tables: a pin of something that no longer
-- exists is simply ignored by the app.

create table if not exists public.user_pins (
  user_id uuid primary key default auth.uid(),
  companies uuid[] not null default '{}',
  projects uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint user_pins_two_companies check (cardinality(companies) <= 2),
  constraint user_pins_two_projects check (cardinality(projects) <= 2)
);

alter table public.user_pins enable row level security;

create policy user_pins_own on public.user_pins
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.user_pins from anon;
grant select, insert, update on public.user_pins to authenticated;
