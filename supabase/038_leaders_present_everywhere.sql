-- 038: admins are present in everything below them (decided by Deniz, 2026-11-27).
-- A company owner or company admin counts as an admin in every project, group and team of the
-- company. A project admin counts as present in every group and team of the project. The manager
-- of a group counts as present in every team of that group. Their rights already worked this way;
-- this adds one list the app reads, so they also show up in People lists and counts.
-- Nothing is copied into the membership tables: when a status is taken away, the person
-- disappears from the lists again by itself.

create or replace function public.project_people(p uuid)
returns table (
  user_id uuid,
  subgroup_id uuid,
  role text,
  inherited boolean,
  full_name text,
  "position" text,
  company_name text,
  username text
)
language sql
stable
security definer
set search_path to ''
as $$
  with allowed as (
    select public.is_project_member(p) as ok
  ),
  company_leaders as (
    select cm.user_id
    from public.projects j
    join public.company_members cm on cm.company_id = j.company_id and cm.role in ('owner', 'admin')
    where j.id = p
  ),
  project_rows as (
    -- People added to the project themselves.
    select m.user_id,
           case when m.user_id in (select l.user_id from company_leaders l) then 'admin' else m.role::text end as role,
           (m.role::text <> 'admin' and m.user_id in (select l.user_id from company_leaders l)) as inherited
    from public.project_members m
    where m.project_id = p
    union all
    -- Company owners and admins who were never added to the project by hand.
    select l.user_id, 'admin', true
    from company_leaders l
    where not exists (select 1 from public.project_members m where m.project_id = p and m.user_id = l.user_id)
  ),
  places as (
    select g.id, g.parent_id
    from public.subgroups g
    where g.project_id = p and public.can_see_subgroup(g.id)
  ),
  direct as (
    select m.user_id, m.subgroup_id, m.role::text as role, false as inherited
    from public.subgroup_members m
    join places g on g.id = m.subgroup_id
  ),
  from_project as (
    -- Project admins are present in every group and team.
    select r.user_id, g.id as subgroup_id, 'member'::text as role, true as inherited
    from project_rows r
    cross join places g
    where r.role = 'admin'
      and not exists (select 1 from public.subgroup_members m where m.subgroup_id = g.id and m.user_id = r.user_id)
  ),
  from_group as (
    -- The managers of a group are present in every team of that group.
    select m.user_id, g.id as subgroup_id, 'member'::text as role, true as inherited
    from places g
    join public.subgroup_members m on m.subgroup_id = g.parent_id and m.role::text in ('admin', 'manager')
    where g.parent_id is not null
      and not exists (select 1 from public.subgroup_members d where d.subgroup_id = g.id and d.user_id = m.user_id)
      and not exists (select 1 from project_rows r where r.user_id = m.user_id and r.role = 'admin')
  ),
  everyone as (
    select r.user_id, null::uuid as subgroup_id, r.role, r.inherited from project_rows r
    union all select d.user_id, d.subgroup_id, d.role, d.inherited from direct d
    union all select f.user_id, f.subgroup_id, f.role, f.inherited from from_project f
    union all select f.user_id, f.subgroup_id, f.role, f.inherited from from_group f
  )
  select e.user_id, e.subgroup_id, e.role, e.inherited,
         pr.full_name, pr.position, pr.company_name, pr.username
  from everyone e
  join allowed a on a.ok
  left join public.profiles pr on pr.id = e.user_id
  order by pr.full_name
$$;

revoke all on function public.project_people(uuid) from public, anon;
grant execute on function public.project_people(uuid) to authenticated;

-- Private messages: "in the same project" now also counts company owners and admins,
-- who are in every project of their company without being added by hand.
create or replace function public.in_project(p uuid, u uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (select 1 from public.project_members m where m.project_id = p and m.user_id = u)
      or exists (select 1 from public.projects j
                 join public.company_members cm on cm.company_id = j.company_id
                 where j.id = p and cm.user_id = u and cm.role in ('owner', 'admin'))
$$;

revoke all on function public.in_project(uuid, uuid) from public, anon, authenticated;

create or replace function public.can_message(other uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select auth.uid() is not null and other <> auth.uid()
    and not public.blocked_between(other)
    and (
    exists (select 1 from public.connections c
             where c.status = 'accepted'
               and ((c.requester = auth.uid() and c.addressee = other)
                 or (c.requester = other and c.addressee = auth.uid())))
    or exists (select 1 from public.projects j
                where public.in_project(j.id, auth.uid()) and public.in_project(j.id, other)))
$$;
