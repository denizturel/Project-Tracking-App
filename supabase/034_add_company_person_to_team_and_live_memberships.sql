-- 034: add a company person straight into a group or team, and tell open apps about membership changes.

-- Whoever may add people to a group or team (project admins, the group's manager) can add
-- anyone from the company in one step. The person joins the project as staff if they were not in it yet.
create or replace function public.add_to_place(place uuid, person uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  project uuid := public.subgroup_project(place);
begin
  if auth.uid() is null or project is null or not public.is_subgroup_admin(place) then
    raise exception 'Only an admin or the manager of this group can add people here.';
  end if;
  if not public.user_in_project_company(project, person) then
    raise exception 'This person is not in the company yet. Add them to the company first.';
  end if;
  insert into public.project_members (project_id, user_id) values (project, person)
    on conflict (project_id, user_id) do nothing;
  insert into public.subgroup_members (subgroup_id, user_id) values (place, person)
    on conflict (subgroup_id, user_id) do nothing;
end;
$$;

revoke all on function public.add_to_place(uuid, uuid) from public, anon;
grant execute on function public.add_to_place(uuid, uuid) to authenticated;

-- Open apps hear about new or changed memberships, projects, groups and teams.
-- Each person only receives the rows the reading rules let them see.
alter publication supabase_realtime add table
  public.company_members, public.project_members, public.subgroup_members, public.projects, public.subgroups;
