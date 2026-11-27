-- 035: the owner and company admins see who wrote this company's name when signing up
-- and is not in the company yet, so they can add them with one press. Nobody joins by
-- typing a name alone: an owner or company admin still presses Add.
create or replace function public.company_candidates(company uuid)
returns table(user_id uuid, username text, full_name text, "position" text)
language sql
stable
security definer
set search_path to ''
as $$
  select p.id, p.username, p.full_name, p.position
    from public.profiles p
    join public.companies c on c.id = company
   where exists (select 1 from public.company_members me
                  where me.company_id = company and me.user_id = auth.uid() and me.role in ('owner', 'admin'))
     and p.username is not null
     and lower(btrim(p.company_name)) = lower(btrim(c.name))
     and not exists (select 1 from public.company_members m where m.company_id = company and m.user_id = p.id)
   order by p.created_at desc
   limit 50
$$;

revoke all on function public.company_candidates(uuid) from public, anon;
grant execute on function public.company_candidates(uuid) to authenticated;
