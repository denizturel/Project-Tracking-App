-- Doneva: connections between people, and private messages.
-- Two people can message each other privately when they share a project (and so its groups)
-- or when they are connected. Safe to run twice.

-- 1. Connections: one person asks, the other accepts. Either one can remove it.
create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index if not exists connections_pair
  on public.connections (least(requester, addressee), greatest(requester, addressee));
create index if not exists connections_addressee on public.connections (addressee);
alter table public.connections enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'connections' and policyname = 'connections_select') then
    create policy connections_select on public.connections for select to authenticated
      using (requester = (select auth.uid()) or addressee = (select auth.uid()));
    create policy connections_insert on public.connections for insert to authenticated
      with check (requester = (select auth.uid()) and status = 'pending');
    -- Only the person who was asked can accept.
    create policy connections_update on public.connections for update to authenticated
      using (addressee = (select auth.uid()) and status = 'pending')
      with check (addressee = (select auth.uid()) and status = 'accepted');
    create policy connections_delete on public.connections for delete to authenticated
      using (requester = (select auth.uid()) or addressee = (select auth.uid()));
  end if;
end $$;
revoke update on public.connections from authenticated;
grant update (status) on public.connections to authenticated;

-- People who are connected, or who asked each other, see each other's profile.
create or replace function public.can_see_profile(other uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select other = auth.uid()
    or exists (select 1 from public.company_members a join public.company_members b using (company_id)
               where a.user_id = auth.uid() and a.role <> 'guest' and b.user_id = other)
    or exists (select 1 from public.project_members a join public.project_members b using (project_id)
               where a.user_id = auth.uid() and b.user_id = other)
    or exists (select 1 from public.conversation_participants a
               join public.conversation_participants b using (conversation_id)
               where a.user_id = auth.uid() and b.user_id = other)
    or exists (select 1 from public.company_join_requests r
               where r.user_id = other and r.status = 'pending' and public.is_company_admin(r.company_id))
    or exists (select 1 from public.connections c
               where (c.requester = auth.uid() and c.addressee = other)
                  or (c.requester = other and c.addressee = auth.uid()))
$$;

-- 2. Who may I message privately?
create or replace function public.can_message(other uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select auth.uid() is not null and other <> auth.uid() and (
    exists (select 1 from public.connections c
             where c.status = 'accepted'
               and ((c.requester = auth.uid() and c.addressee = other)
                 or (c.requester = other and c.addressee = auth.uid())))
    or exists (select 1 from public.project_members a join public.project_members b using (project_id)
                where a.user_id = auth.uid() and b.user_id = other))
$$;
revoke execute on function public.can_message(uuid) from public, anon;
grant execute on function public.can_message(uuid) to authenticated;

-- Opens the private chat with a person, creating it the first time.
create or replace function public.start_direct_chat(other_user uuid)
 returns uuid language plpgsql security definer set search_path to ''
as $$
declare c uuid;
begin
  select a.conversation_id into c
    from public.conversation_participants a
    join public.conversation_participants b using (conversation_id)
    join public.conversations v on v.id = a.conversation_id
   where v.kind = 'direct' and a.user_id = auth.uid() and b.user_id = other_user
   limit 1;
  if c is null then
    if not public.can_message(other_user) then
      raise exception 'You can message people in your projects and your connections';
    end if;
    insert into public.conversations (kind) values ('direct') returning id into c;
    insert into public.conversation_participants (conversation_id, user_id)
    values (c, auth.uid()), (c, other_user);
  end if;
  return c;
end $$;

-- A private message only goes through while the two can still message each other.
create or replace function public.can_post_direct(c uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select coalesce((
    select v.kind <> 'direct' or exists (
      select 1 from public.conversation_participants o
       where o.conversation_id = c and o.user_id <> auth.uid() and public.can_message(o.user_id))
    from public.conversations v where v.id = c), false)
$$;
revoke execute on function public.can_post_direct(uuid) from public, anon;
grant execute on function public.can_post_direct(uuid) to authenticated;

alter policy messages_insert on public.messages
  with check (sender_id = (select auth.uid()) and public.can_see_conversation(conversation_id)
              and public.can_post_direct(conversation_id) and pinned_at is null and deleted_at is null);

-- My private chats, newest first, with the other person and how many messages I have not read.
create or replace function public.my_direct_chats()
 returns table (conversation_id uuid, user_id uuid, full_name text, "position" text,
                last_body text, last_at timestamptz, last_mine boolean, last_deleted boolean, unread int)
 language sql stable security definer set search_path to ''
as $$
  select c.id, o.user_id, p.full_name, p.position,
         lm.body, coalesce(lm.created_at, c.created_at), lm.sender_id = auth.uid(), lm.deleted_at is not null,
         (select count(*)::int from public.messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.deleted_at is null
             and m.created_at > coalesce(me.last_read_at, '-infinity'))
    from public.conversation_participants me
    join public.conversations c on c.id = me.conversation_id and c.kind = 'direct'
    join public.conversation_participants o on o.conversation_id = c.id and o.user_id <> me.user_id
    join public.profiles p on p.id = o.user_id
    left join lateral (select m.body, m.created_at, m.deleted_at, m.sender_id from public.messages m
                        where m.conversation_id = c.id order by m.created_at desc limit 1) lm on true
   where me.user_id = auth.uid()
   order by coalesce(lm.created_at, c.created_at) desc
$$;
revoke execute on function public.my_direct_chats() from public, anon;
grant execute on function public.my_direct_chats() to authenticated;

-- Everyone I can message or have a connection (or request) with.
-- connection: 'connected', 'sent' (I asked), 'received' (they asked) or null.
create or replace function public.my_people()
 returns table (user_id uuid, full_name text, "position" text, company_name text,
                shares_project boolean, connection text, connection_id uuid)
 language sql stable security definer set search_path to ''
as $$
  with mates as (
    select distinct b.user_id from public.project_members a join public.project_members b using (project_id)
     where a.user_id = auth.uid() and b.user_id <> auth.uid()
  ), links as (
    select case when c.requester = auth.uid() then c.addressee else c.requester end as user_id, c.id,
           case when c.status = 'accepted' then 'connected' when c.requester = auth.uid() then 'sent' else 'received' end as state
      from public.connections c where auth.uid() in (c.requester, c.addressee)
  )
  select p.id, p.full_name, p.position, p.company_name, m.user_id is not null, l.state, l.id
    from (select user_id from mates union select user_id from links) x
    join public.profiles p on p.id = x.user_id
    left join mates m on m.user_id = x.user_id
    left join links l on l.user_id = x.user_id
   order by p.full_name
$$;
revoke execute on function public.my_people() from public, anon;
grant execute on function public.my_people() to authenticated;

-- Find someone to connect with by their exact email address.
create or replace function public.find_person_by_email(mail text)
 returns table (user_id uuid, full_name text, "position" text, company_name text)
 language sql stable security definer set search_path to ''
as $$
  select p.id, p.full_name, p.position, p.company_name
    from auth.users u join public.profiles p on p.id = u.id
   where auth.uid() is not null and u.id <> auth.uid() and length(trim(mail)) > 3
     and lower(u.email) = lower(trim(mail))
   limit 1
$$;
revoke execute on function public.find_person_by_email(text) from public, anon;
grant execute on function public.find_person_by_email(text) to authenticated;

-- Chat lists refresh live when a connection changes.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'connections') then
    alter publication supabase_realtime add table public.connections;
  end if;
end $$;
