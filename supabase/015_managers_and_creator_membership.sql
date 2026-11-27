-- Workroom: managers, and creators join their new group automatically.
-- Paste all of this into the Supabase SQL Editor and press Run. It is safe to run twice.

-- A group or team can have managers of its own.
alter table public.subgroup_members drop constraint if exists subgroup_members_role_check;
alter table public.subgroup_members add constraint subgroup_members_role_check
  check (role = any (array['admin'::text, 'manager'::text, 'member'::text]));

-- Company managers see every project, group and team of their company, without admin rights.
create or replace function public.sees_whole_project(p uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select public.is_project_admin(p)
      or exists (select 1 from public.projects pr join public.company_members cm on cm.company_id = pr.company_id
                 where pr.id = p and cm.user_id = auth.uid() and cm.role = 'manager')
$$;
revoke execute on function public.sees_whole_project(uuid) from public, anon;
grant execute on function public.sees_whole_project(uuid) to authenticated;

create or replace function public.is_project_member(p uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select exists (select 1 from public.project_members where project_id = p and user_id = auth.uid())
      or exists (select 1 from public.projects pr join public.company_members cm on cm.company_id = pr.company_id
                 where pr.id = p and cm.user_id = auth.uid() and cm.role in ('owner', 'admin', 'manager'))
$$;

create or replace function public.can_see_subgroup(s uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select exists (
    select 1 from public.subgroups g join public.projects p on p.id = g.project_id
    where g.id = s and public.is_project_member(p.id) and (
      not p.restrict_to_subgroups
      or public.sees_whole_project(p.id)
      or exists (select 1 from public.subgroup_members m
                 where m.user_id = auth.uid()
                   and (m.subgroup_id = g.id or m.subgroup_id = g.parent_id))))
$$;

-- Company managers can see who else is in the company, like other colleagues.
drop policy if exists company_members_select on public.company_members;
create policy company_members_select on public.company_members for select to authenticated
  using (user_id = (select auth.uid())
         or public.company_role_of(company_id) = any (array['owner','admin','manager','member']::public.company_role[]));

-- Whoever creates a group or team is put in it straight away, and may leave again.
create or replace function public.on_subgroup_created()
 returns trigger language plpgsql security definer set search_path to ''
as $$
begin
  insert into public.conversations (kind, project_id, subgroup_id) values ('subgroup', new.project_id, new.id);
  if auth.uid() is not null then
    insert into public.subgroup_members (subgroup_id, user_id, role)
    values (new.id, auth.uid(), 'member') on conflict do nothing;
  end if;
  return new;
end $$;

drop policy if exists subgroup_members_delete on public.subgroup_members;
create policy subgroup_members_delete on public.subgroup_members for delete to authenticated
  using (public.is_subgroup_admin(subgroup_id) or user_id = (select auth.uid()));

-- Meetings in the schedule: a schedule item is a milestone or a meeting with a time and a place or link.
alter table public.milestones add column if not exists kind text not null default 'milestone';
alter table public.milestones add column if not exists starts_at time;
alter table public.milestones add column if not exists ends_at time;
alter table public.milestones add column if not exists location text;
alter table public.milestones drop constraint if exists milestones_kind_check;
alter table public.milestones add constraint milestones_kind_check check (kind in ('milestone', 'meeting'));
