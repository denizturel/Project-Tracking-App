-- Workroom: managers are "mini admins" of the one group or team they are in,
-- and meetings get notes and decisions. Safe to run twice.

-- Meeting notes and decisions taken.
alter table public.milestones add column if not exists notes text;
alter table public.milestones add column if not exists decisions text;

-- The full admins of a group or team: project admins, and the own admin of it or of its parent group.
create or replace function public.is_subgroup_full_admin(s uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select exists (
    select 1 from public.subgroups g
    where g.id = s and (
      public.is_project_admin(g.project_id)
      or exists (select 1 from public.subgroup_members m
                 where m.user_id = auth.uid() and m.role = 'admin'
                   and (m.subgroup_id = g.id or m.subgroup_id = g.parent_id))))
$$;
revoke execute on function public.is_subgroup_full_admin(uuid) from public, anon;
grant execute on function public.is_subgroup_full_admin(uuid) to authenticated;

-- Managers manage tasks, schedule, questions, training and people, but only in the group or team they are in.
create or replace function public.is_subgroup_admin(s uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select public.is_subgroup_full_admin(s)
      or exists (select 1 from public.subgroup_members m
                 where m.user_id = auth.uid() and m.role = 'manager' and m.subgroup_id = s)
$$;

-- Managers add and remove staff and other managers, but only admins make or remove admins.
alter policy subgroup_members_insert on public.subgroup_members
  with check (public.is_subgroup_admin(subgroup_id)
              and (role <> 'admin' or public.is_subgroup_full_admin(subgroup_id))
              and exists (select 1 from public.project_members pm
                          where pm.project_id = public.subgroup_project(subgroup_members.subgroup_id)
                            and pm.user_id = subgroup_members.user_id));
alter policy subgroup_members_update on public.subgroup_members
  using (public.is_subgroup_full_admin(subgroup_id) or (public.is_subgroup_admin(subgroup_id) and role <> 'admin'))
  with check (public.is_subgroup_full_admin(subgroup_id) or (public.is_subgroup_admin(subgroup_id) and role <> 'admin'));
alter policy subgroup_members_delete on public.subgroup_members
  using (public.is_subgroup_full_admin(subgroup_id)
         or (public.is_subgroup_admin(subgroup_id) and role <> 'admin')
         or user_id = (select auth.uid()));

-- Creating and deleting teams stays with admins; a manager edits the name and description of their own group or team.
alter policy subgroups_insert on public.subgroups
  with check (public.is_project_admin(project_id)
              or (parent_id is not null and public.is_subgroup_full_admin(parent_id)
                  and public.subgroup_project(parent_id) = project_id));
alter policy subgroups_delete on public.subgroups
  using (public.is_project_admin(project_id) or (parent_id is not null and public.is_subgroup_full_admin(parent_id)));
-- Only project admins can move a team to another group.
create or replace function public.subgroup_parent(s uuid)
 returns uuid language sql stable security definer set search_path to ''
as $$ select parent_id from public.subgroups where id = s $$;
revoke execute on function public.subgroup_parent(uuid) from public, anon;
grant execute on function public.subgroup_parent(uuid) to authenticated;

alter policy subgroups_update on public.subgroups
  using (public.is_subgroup_admin(id))
  with check (public.is_project_admin(project_id)
              or (public.is_subgroup_admin(id) and parent_id is not distinct from public.subgroup_parent(id)));
