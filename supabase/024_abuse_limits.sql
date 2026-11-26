-- Doneva: fail-safes against bots and abuse. Safe to run twice.
-- Each signed-in person can only create so many things in a period of time.
-- The limits are far above normal use; change the numbers in the triggers below if needed.

-- One shared check: rate_limit('<owner column>', '<max>', '<period>', '<what>')
create or replace function public.rate_limit()
 returns trigger language plpgsql security definer set search_path to ''
as $$
declare made int;
begin
  -- Work done by the system itself (no signed-in person) is not limited.
  if auth.uid() is null then return new; end if;
  execute format('select count(*) from %I.%I where %I = $1 and created_at > now() - $2::interval',
                 tg_table_schema, tg_table_name, tg_argv[0])
     into made using auth.uid(), tg_argv[2];
  if made >= tg_argv[1]::int then
    raise exception 'Too many % in a short time. Please try again later.', tg_argv[3]
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.rate_limit() from public, anon, authenticated;

create or replace trigger limit_companies before insert on public.companies
  for each row execute function public.rate_limit('created_by', '3', '1 day', 'new company spaces');
create or replace trigger limit_projects before insert on public.projects
  for each row execute function public.rate_limit('created_by', '20', '1 day', 'new projects');
create or replace trigger limit_join_requests before insert on public.company_join_requests
  for each row execute function public.rate_limit('user_id', '5', '1 day', 'requests to join');
create or replace trigger limit_connections before insert on public.connections
  for each row execute function public.rate_limit('requester', '30', '1 day', 'connection requests');
create or replace trigger limit_messages before insert on public.messages
  for each row execute function public.rate_limit('sender_id', '30', '1 minute', 'messages');
create or replace trigger limit_questions before insert on public.questions
  for each row execute function public.rate_limit('asked_by', '30', '1 hour', 'questions');
create or replace trigger limit_solutions before insert on public.solutions
  for each row execute function public.rate_limit('solved_by', '60', '1 hour', 'solutions');
create or replace trigger limit_tasks before insert on public.tasks
  for each row execute function public.rate_limit('created_by', '100', '1 hour', 'tasks');
create or replace trigger limit_task_notes before insert on public.task_notes
  for each row execute function public.rate_limit('author_id', '100', '1 hour', 'notes');
create or replace trigger limit_training_items before insert on public.training_items
  for each row execute function public.rate_limit('created_by', '60', '1 hour', 'training items');

-- Nobody can store huge texts.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'messages_body_length') then
    alter table public.messages add constraint messages_body_length check (char_length(body) <= 8000) not valid;
    alter table public.companies add constraint companies_name_length check (char_length(name) <= 120) not valid;
    alter table public.projects add constraint projects_name_length check (char_length(name) <= 160) not valid;
  end if;
end $$;

-- Looking people up by email is limited, so nobody can try long lists of addresses.
create table if not exists public.lookup_log (
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists lookup_log_user on public.lookup_log (user_id, created_at);
alter table public.lookup_log enable row level security;  -- no policies: only the function below uses it

create or replace function public.find_person_by_email(mail text)
 returns table (user_id uuid, full_name text, "position" text, company_name text)
 language plpgsql volatile security definer set search_path to ''
as $$
begin
  if auth.uid() is null then return; end if;
  if (select count(*) from public.lookup_log l
       where l.user_id = auth.uid() and l.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many searches in a short time. Please try again later.';
  end if;
  insert into public.lookup_log (user_id) values (auth.uid());
  return query
    select p.id, p.full_name, p.position, p.company_name
      from auth.users u join public.profiles p on p.id = u.id
     where u.id <> auth.uid() and length(trim(mail)) > 3 and lower(u.email) = lower(trim(mail))
     limit 1;
end $$;
revoke execute on function public.find_person_by_email(text) from public, anon;
grant execute on function public.find_person_by_email(text) to authenticated;
