-- 037: remembers when each person last looked at the chat, tasks and questions of a project,
-- group or team, so the menu can show a coloured mark for what is new until it is opened.

create table public.seen_marks (
  user_id uuid not null default auth.uid(),
  place_id uuid not null,            -- a project id, or a group or team id
  kind text not null check (kind in ('chat', 'tasks', 'questions')),
  seen_at timestamptz not null default now(),
  primary key (user_id, place_id, kind)
);
alter table public.seen_marks enable row level security;
create policy seen_marks_select on public.seen_marks for select to authenticated using (user_id = (select auth.uid()));
create policy seen_marks_insert on public.seen_marks for insert to authenticated with check (user_id = (select auth.uid()));
create policy seen_marks_update on public.seen_marks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.seen_marks from anon, public;
grant select, insert, update on public.seen_marks to authenticated;

create or replace function public.mark_seen(place uuid, what text)
returns void
language sql
set search_path to ''
as $$
  insert into public.seen_marks (user_id, place_id, kind) values (auth.uid(), place, what)
  on conflict (user_id, place_id, kind) do update set seen_at = now()
$$;

-- What is new for me, per place. Runs with my own rights, so only things I may see are counted.
-- Without a mark, the last 3 days count as new; nothing older than 30 days is looked at.
create or replace function public.my_unseen()
returns table(project_id uuid, subgroup_id uuid, kind text, n integer)
language sql
stable
set search_path to ''
as $$
  with items as (
    select c.project_id as pid, c.subgroup_id as sid, 'chat'::text as kind, m.created_at
      from public.messages m join public.conversations c on c.id = m.conversation_id
     where c.kind in ('project', 'subgroup') and m.deleted_at is null
       and m.sender_id <> auth.uid() and m.created_at > now() - interval '30 days'
    union all
    select t.project_id, t.subgroup_id, 'tasks', t.created_at
      from public.tasks t
     where t.created_by is distinct from auth.uid() and t.created_at > now() - interval '30 days'
    union all
    select q.project_id, q.subgroup_id, 'questions', q.created_at
      from public.questions q
     where q.asked_by is distinct from auth.uid() and q.created_at > now() - interval '30 days'
  ), placed as (
    select coalesce(i.pid, g.project_id) as pid, i.sid, i.kind, i.created_at
      from items i left join public.subgroups g on g.id = i.sid
  )
  select p.pid, p.sid, p.kind, count(*)::integer
    from placed p
    left join public.seen_marks s
      on s.user_id = auth.uid() and s.place_id = coalesce(p.sid, p.pid) and s.kind = p.kind
   where p.pid is not null and p.created_at > coalesce(s.seen_at, now() - interval '3 days')
   group by 1, 2, 3
$$;

revoke all on function public.mark_seen(uuid, text) from public, anon;
revoke all on function public.my_unseen() from public, anon;
grant execute on function public.mark_seen(uuid, text) to authenticated;
grant execute on function public.my_unseen() to authenticated;
