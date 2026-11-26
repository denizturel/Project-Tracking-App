-- Doneva: two fixes found by the permission tests. Safe to run twice. (Already applied.)
-- 1. A question can only be asked in a group or team the person can see.
alter policy questions_insert on public.questions
  with check (public.is_project_member(project_id) and asked_by = (select auth.uid()) and status = 'open' and solved_at is null
              and (subgroup_id is null or (public.subgroup_project(subgroup_id) = project_id and public.can_see_subgroup(subgroup_id))));

-- 2. The empty profile of a deleted account can be read, so old messages show "Deleted user".
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
    or (auth.uid() is not null and exists (select 1 from public.profiles p
               where p.id = other and p.full_name = 'Deleted user' and p.company_name is null and p.position is null))
$$;
