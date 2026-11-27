-- Suggestions while typing a username: up to 6 people whose username starts with the typed letters.
-- Needs at least 2 letters. Never shows people on either side of a block.
-- Counted apart from the exact "Find" searches: 300 suggestion lookups an hour per person.
alter table public.lookup_log add column if not exists kind text not null default 'find';

create or replace function public.find_person_by_username(name text)
 returns table (user_id uuid, username text, full_name text, "position" text, company_name text)
 language plpgsql volatile security definer set search_path to ''
as $$
begin
  if auth.uid() is null then return; end if;
  if (select count(*) from public.lookup_log l
       where l.user_id = auth.uid() and l.kind = 'find' and l.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many searches in a short time. Please try again later.';
  end if;
  insert into public.lookup_log (user_id) values (auth.uid());
  return query
    select p.id, p.username, p.full_name, p.position, p.company_name
      from public.profiles p
     where p.id <> auth.uid() and lower(p.username) = lower(trim(leading '@' from trim(name)))
     limit 1;
end $$;

create or replace function public.suggest_people(q text)
 returns table (user_id uuid, username text, full_name text, "position" text, company_name text)
 language plpgsql volatile security definer set search_path to ''
as $$
declare typed text := lower(trim(leading '@' from trim(coalesce(q, ''))));
begin
  if auth.uid() is null or length(typed) < 2 or typed !~ '^[a-z0-9._]+$' then return; end if;
  if (select count(*) from public.lookup_log l
       where l.user_id = auth.uid() and l.kind = 'suggest' and l.created_at > now() - interval '1 hour') >= 300 then
    return;
  end if;
  insert into public.lookup_log (user_id, kind) values (auth.uid(), 'suggest');
  return query
    select p.id, p.username, p.full_name, p.position, p.company_name
      from public.profiles p
     where p.id <> auth.uid()
       and p.username is not null
       and left(lower(p.username), length(typed)) = typed
       and not public.blocked_between(p.id)
     order by (lower(p.username) = typed) desc, p.username
     limit 6;
end $$;
revoke execute on function public.suggest_people(text) from public, anon;
grant execute on function public.suggest_people(text) to authenticated;
