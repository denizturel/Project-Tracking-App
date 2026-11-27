-- A person who is removed from a company (or leaves it) also leaves that company's projects, groups and teams.
create or replace function public.company_member_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.subgroup_members sm
   using public.subgroups s, public.projects p
   where sm.user_id = old.user_id and s.id = sm.subgroup_id and p.id = s.project_id and p.company_id = old.company_id;
  -- The "keep one admin" guard is for normal removals inside a project.
  perform set_config('app.deleting_account', '1', true);
  delete from public.project_members pm
   using public.projects p
   where pm.user_id = old.user_id and p.id = pm.project_id and p.company_id = old.company_id;
  perform set_config('app.deleting_account', '', true);
  return old;
end $$;
revoke execute on function public.company_member_removed() from public, anon, authenticated;
create or replace trigger company_member_removed after delete on public.company_members
  for each row execute function public.company_member_removed();
