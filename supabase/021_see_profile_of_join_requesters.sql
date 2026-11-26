-- Doneva: the owner and company admins can see who is asking to join, and people see their own requests.
-- Safe to run twice.

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
$$;

-- My own requests with the company's name (the company itself is still closed to me).
create or replace function public.my_join_requests()
 returns table (id uuid, company_id uuid, name text, status text) language sql stable security definer set search_path to ''
as $$
  select r.id, r.company_id, c.name, r.status
    from public.company_join_requests r join public.companies c on c.id = r.company_id
   where r.user_id = auth.uid() and r.status <> 'approved'
   order by r.created_at desc
$$;
revoke execute on function public.my_join_requests() from public, anon;
grant execute on function public.my_join_requests() to authenticated;
