-- Doneva: every person has a unique username. People connect by username, not by email address.
-- Safe to run twice.

alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username on public.profiles (lower(username));
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    -- 3 to 20 characters: small letters, digits, dot and underscore.
    alter table public.profiles add constraint profiles_username_format
      check (username ~ '^[a-z0-9_.]{3,20}$');
  end if;
end $$;

-- Is this username still free? Used while typing, also on the sign-up form.
create or replace function public.username_available(name text)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select lower(trim(name)) ~ '^[a-z0-9_.]{3,20}$'
     and not exists (select 1 from public.profiles p
                      where lower(p.username) = lower(trim(name)) and p.id is distinct from auth.uid())
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- New accounts take the username typed on the sign-up form, when it is valid and free.
create or replace function public.handle_new_user()
 returns trigger language plpgsql security definer set search_path to ''
as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
        wanted text := lower(trim(coalesce(m->>'username', '')));
begin
  if wanted !~ '^[a-z0-9_.]{3,20}$'
     or exists (select 1 from public.profiles p where lower(p.username) = wanted) then
    wanted := null;  -- the app asks again before the person can continue
  end if;
  insert into public.profiles (id, full_name, avatar_url, company_name, position, department, phone, username)
  values (new.id,
          coalesce(nullif(m->>'full_name', ''), nullif(m->>'name', ''),
                   split_part(coalesce(new.email, ''), '@', 1)),
          coalesce(m->>'avatar_url', m->>'picture'),
          nullif(left(m->>'company_name', 200), ''),
          nullif(left(m->>'position', 200), ''),
          nullif(left(m->>'department', 200), ''),
          nullif(left(m->>'phone', 50), ''),
          wanted);
  return new;
end $$;

-- Find someone to connect with by their exact username. Limited to 20 searches an hour.
create or replace function public.find_person_by_username(name text)
 returns table (user_id uuid, username text, full_name text, "position" text, company_name text)
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
    select p.id, p.username, p.full_name, p.position, p.company_name
      from public.profiles p
     where p.id <> auth.uid() and lower(p.username) = lower(trim(leading '@' from trim(name)))
     limit 1;
end $$;
revoke execute on function public.find_person_by_username(text) from public, anon;
grant execute on function public.find_person_by_username(text) to authenticated;

-- Searching by email address is switched off.
revoke execute on function public.find_person_by_email(text) from public, anon, authenticated;
