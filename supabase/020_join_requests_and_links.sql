-- Doneva: easier ways to join. Safe to run twice.
--   1. A person finds their company and asks to join; the owner or a company admin approves.
--   2. Each project can have one invite link (also shown as a QR code) that lets people in as guests.
--   3. Company admins add people of their company to a project without a code.

-- 1. Join requests
create table if not exists public.company_join_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);
alter table public.company_join_requests enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'company_join_requests' and policyname = 'join_requests_select') then
    create policy join_requests_select on public.company_join_requests for select to authenticated
      using (user_id = (select auth.uid()) or public.is_company_admin(company_id));
    create policy join_requests_insert on public.company_join_requests for insert to authenticated
      with check (user_id = (select auth.uid()) and status = 'pending');
  end if;
end $$;

-- Company names for the "find your company" box. Only names, and only from two letters on.
create or replace function public.search_companies(q text)
 returns table (id uuid, name text) language sql stable security definer set search_path to ''
as $$
  select c.id, c.name from public.companies c
   where auth.uid() is not null and length(trim(q)) >= 2
     and c.name ilike '%' || replace(replace(trim(q), '%', ''), '_', '') || '%'
     and not exists (select 1 from public.company_members m where m.company_id = c.id and m.user_id = auth.uid())
   order by c.name limit 8
$$;
revoke execute on function public.search_companies(text) from public, anon;
grant execute on function public.search_companies(text) to authenticated;

-- The owner or a company admin lets the person in as staff or guest, or declines.
create or replace function public.decide_join_request(request uuid, as_role text)
 returns void language plpgsql security definer set search_path to ''
as $$
declare r public.company_join_requests;
begin
  select * into r from public.company_join_requests where id = request;
  if r.id is null or not public.is_company_admin(r.company_id) then
    raise exception 'Only the owner or a company admin can do this';
  end if;
  if as_role in ('member', 'guest') then
    insert into public.company_members (company_id, user_id, role)
      values (r.company_id, r.user_id, as_role::public.company_role)
      on conflict do nothing;
    update public.company_join_requests set status = 'approved', decided_by = auth.uid() where id = request;
  elsif as_role = 'declined' then
    update public.company_join_requests set status = 'declined', decided_by = auth.uid() where id = request;
  else
    raise exception 'Unknown choice';
  end if;
end $$;
revoke execute on function public.decide_join_request(uuid, text) from public, anon;
grant execute on function public.decide_join_request(uuid, text) to authenticated;

-- 2. Project invite links
create table if not exists public.project_links (
  project_id uuid primary key references public.projects(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  enabled boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.project_links enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'project_links' and policyname = 'project_links_all') then
    create policy project_links_all on public.project_links for all to authenticated
      using (public.is_project_admin(project_id)) with check (public.is_project_admin(project_id));
  end if;
end $$;

-- Whoever opens a project's link joins that project as staff, and its company as a guest if they are new to it.
create or replace function public.join_project_by_link(link_token uuid)
 returns uuid language plpgsql security definer set search_path to ''
as $$
declare p public.projects;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select pr.* into p from public.project_links l join public.projects pr on pr.id = l.project_id
   where l.token = link_token and l.enabled;
  if p.id is null then raise exception 'This invite link is not active any more'; end if;
  insert into public.company_members (company_id, user_id, role) values (p.company_id, auth.uid(), 'guest')
    on conflict do nothing;
  insert into public.project_members (project_id, user_id, role) values (p.id, auth.uid(), 'member')
    on conflict do nothing;
  return p.id;
end $$;
revoke execute on function public.join_project_by_link(uuid) from public, anon;
grant execute on function public.join_project_by_link(uuid) to authenticated;
