-- Doneva: one simple set of statuses. Safe to run twice.
--   Admin   (project admin): manages every group, team and person in the project.
--   Manager (of a group):    manages that one group, the teams inside it and their staff.
--   Staff:                   sees their own team and their group's own pages, not other teams.

-- A manager manages their group and every team inside it.
create or replace function public.is_subgroup_full_admin(s uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select exists (
    select 1 from public.subgroups g
    where g.id = s and (
      public.is_project_admin(g.project_id)
      or exists (select 1 from public.subgroup_members m
                 where m.user_id = auth.uid() and m.role in ('admin', 'manager')
                   and (m.subgroup_id = g.id or m.subgroup_id = g.parent_id))))
$$;

create or replace function public.is_subgroup_admin(s uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$ select public.is_subgroup_full_admin(s) $$;

-- Staff see the group or team they are in, and the group above their team. Managers also see every team in their group.
create or replace function public.can_see_subgroup(s uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select exists (
    select 1 from public.subgroups g
    where g.id = s and public.is_project_member(g.project_id) and (
      public.sees_whole_project(g.project_id)
      or exists (select 1 from public.subgroup_members m
                 where m.user_id = auth.uid()
                   and (m.subgroup_id = g.id
                        or (m.subgroup_id = g.parent_id and m.role in ('admin', 'manager'))))
      or exists (select 1 from public.subgroups t join public.subgroup_members m on m.subgroup_id = t.id
                 where t.parent_id = g.id and m.user_id = auth.uid())))
$$;

-- Managers add and remove staff in their group and its teams. Only project admins give or take the Manager status.
alter policy subgroup_members_insert on public.subgroup_members
  with check (public.is_subgroup_admin(subgroup_id)
              and (role = 'member' or public.is_project_admin(public.subgroup_project(subgroup_id)))
              and exists (select 1 from public.project_members pm
                          where pm.project_id = public.subgroup_project(subgroup_members.subgroup_id)
                            and pm.user_id = subgroup_members.user_id));
alter policy subgroup_members_update on public.subgroup_members
  using (public.is_project_admin(public.subgroup_project(subgroup_id)))
  with check (public.is_project_admin(public.subgroup_project(subgroup_id)));
alter policy subgroup_members_delete on public.subgroup_members
  using (public.is_project_admin(public.subgroup_project(subgroup_id))
         or (public.is_subgroup_admin(subgroup_id) and role = 'member')
         or user_id = (select auth.uid()));
