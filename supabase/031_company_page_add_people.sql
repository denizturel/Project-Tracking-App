-- Company page: the owner adds people with any status except owner;
-- company admins add people as staff or guest only.
alter policy company_members_insert on public.company_members
  with check (
    (public.company_role_of(company_id) = 'owner' and role <> 'owner')
    or (public.is_company_admin(company_id) and role in ('member', 'guest'))
  );
