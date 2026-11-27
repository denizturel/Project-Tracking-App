-- No duplicate companies (Deniz, 2026-11-27): before a company is created, the app shows the
-- existing ones with a similar name, and the same name (also with a number after it) is refused.
-- company_key: small letters, Turkish letters made plain, only letters and digits.
create or replace function public.company_key(t text)
 returns text language sql immutable parallel safe set search_path to ''
as $$ select pg_catalog.regexp_replace(public.normalize_tr(t), '[^a-z0-9]', '', 'g') $$;

-- The same without a number at the end, so "Eptera 2" counts as "Eptera".
create or replace function public.company_base(t text)
 returns text language sql immutable parallel safe set search_path to ''
as $$ select pg_catalog.regexp_replace(public.company_key(t), '[0-9]+$', '') $$;

create or replace function public.similar_companies(q text)
 returns table (id uuid, name text, mine boolean)
 language sql stable security definer set search_path to ''
as $$
  select c.id, c.name,
         exists (select 1 from public.company_members m where m.company_id = c.id and m.user_id = auth.uid())
    from public.companies c
   where auth.uid() is not null
     and length(public.company_base(q)) >= 2
     and (public.company_base(c.name) = public.company_base(q)
          or (length(public.company_base(q)) >= 3 and public.company_key(c.name) like '%' || public.company_base(q) || '%')
          or (length(public.company_base(c.name)) >= 3 and public.company_key(q) like '%' || public.company_base(c.name) || '%'))
   order by (public.company_base(c.name) = public.company_base(q)) desc, c.name
   limit 6
$$;
revoke execute on function public.similar_companies(text) from public, anon;
grant execute on function public.similar_companies(text) to authenticated;

create or replace function public.guard_company_name()
 returns trigger language plpgsql security definer set search_path to ''
as $$
begin
  if length(public.company_base(new.name)) < 2 then
    raise exception 'Please write the company name.';
  end if;
  if exists (select 1 from public.companies c
              where c.id <> new.id and public.company_base(c.name) = public.company_base(new.name)) then
    raise exception 'A company with this name already exists. Ask its owner to invite you, or use a different name.';
  end if;
  return new;
end $$;
revoke execute on function public.guard_company_name() from public, anon, authenticated;

create or replace trigger company_name_guard before insert or update of name on public.companies
  for each row execute function public.guard_company_name();
