-- Joining a company is by invitation that the person accepts (Deniz, 2026-11-27).
-- Nobody can be put into a company directly any more.
-- No foreign keys on purpose (as in 039): rows of a company or person that no longer exists are simply never shown.
create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  role public.company_role not null default 'member',
  invited_by uuid not null default auth.uid(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create unique index if not exists company_invites_one_pending on public.company_invites (company_id, user_id) where status = 'pending';
create index if not exists company_invites_user on public.company_invites (user_id) where status = 'pending';

alter table public.company_invites enable row level security;
-- Reading only: the invited person, and the owner and admins of the company. All changes go through the functions below.
create policy company_invites_select on public.company_invites for select to authenticated
  using (user_id = (select auth.uid()) or public.is_company_admin(company_id));
revoke all on public.company_invites from anon;
revoke insert, update, truncate, references, trigger on public.company_invites from authenticated;

create or replace trigger limit_company_invites before insert on public.company_invites
  for each row execute function public.rate_limit('invited_by', '50', '1 day', 'company invitations');

-- Direct adding is closed. Members are only created by accepting an invitation,
-- by opening a project's invite link or code, or by creating the company.
alter policy company_members_insert on public.company_members with check (false);

create or replace function public.invite_to_company(company uuid, person uuid, as_role text default 'member')
 returns uuid language plpgsql volatile security definer set search_path to ''
as $$
declare
  mine public.company_role := public.company_role_of(company);
  made uuid;
  actor_name text;
  company_name text;
begin
  if auth.uid() is null or mine is null or mine not in ('owner', 'admin') then
    raise exception 'Only the owner or a company admin can invite people to the company.';
  end if;
  if as_role not in ('admin', 'manager', 'member', 'guest') or (mine = 'admin' and as_role not in ('member', 'guest')) then
    raise exception 'You cannot invite someone with this status.';
  end if;
  if person = auth.uid() or not exists (select 1 from public.profiles p where p.id = person) or public.blocked_between(person) then
    raise exception 'This person cannot be invited.';
  end if;
  if exists (select 1 from public.company_members m where m.company_id = company and m.user_id = person) then
    raise exception 'This person is already in the company.';
  end if;
  select i.id into made from public.company_invites i
   where i.company_id = company and i.user_id = person and i.status = 'pending';
  if made is not null then return made; end if;

  insert into public.company_invites (company_id, user_id, role, invited_by)
  values (company, person, as_role::public.company_role, auth.uid())
  returning id into made;

  select full_name into actor_name from public.profiles where id = auth.uid();
  select c.name into company_name from public.companies c where c.id = company;
  insert into public.notifications (user_id, kind, payload)
  values (person, 'company_invite', jsonb_build_object('company_id', company, 'name', company_name, 'invite_id', made, 'by', auth.uid(), 'by_name', actor_name));
  return made;
end $$;

create or replace function public.respond_company_invite(invite uuid, accept boolean)
 returns uuid language plpgsql volatile security definer set search_path to ''
as $$
declare
  i public.company_invites;
  my_name text;
  company_name text;
begin
  select * into i from public.company_invites where id = invite and user_id = auth.uid() and status = 'pending';
  if i.id is null then raise exception 'This invitation is not open any more.'; end if;
  select c.name into company_name from public.companies c where c.id = i.company_id;
  if company_name is null then raise exception 'This invitation is not open any more.'; end if;

  if accept then
    insert into public.company_members (company_id, user_id, role) values (i.company_id, auth.uid(), i.role)
      on conflict do nothing;
    select full_name into my_name from public.profiles where id = auth.uid();
    insert into public.notifications (user_id, kind, payload)
    values (i.invited_by, 'company_invite_accepted', jsonb_build_object('company_id', i.company_id, 'name', company_name, 'by', auth.uid(), 'by_name', my_name));
  end if;
  update public.company_invites set status = case when accept then 'accepted' else 'declined' end, answered_at = now() where id = i.id;
  return i.company_id;
end $$;

create or replace function public.cancel_company_invite(invite uuid)
 returns void language plpgsql volatile security definer set search_path to ''
as $$
begin
  update public.company_invites set status = 'cancelled', answered_at = now()
   where id = invite and status = 'pending' and public.is_company_admin(company_id);
  if not found then raise exception 'This invitation is not open any more.'; end if;
end $$;

-- The open invitations of the signed-in person, with the company's name (which they cannot read yet).
create or replace function public.my_company_invites()
 returns table (id uuid, company_id uuid, company_name text, role text, by_name text, created_at timestamptz)
 language sql stable security definer set search_path to ''
as $$
  select i.id, i.company_id, c.name, i.role::text, p.full_name, i.created_at
    from public.company_invites i
    join public.companies c on c.id = i.company_id
    left join public.profiles p on p.id = i.invited_by
   where i.user_id = auth.uid() and i.status = 'pending'
   order by i.created_at desc
$$;

-- The open invitations of a company, for its owner and admins.
create or replace function public.company_open_invites(company uuid)
 returns table (id uuid, user_id uuid, username text, full_name text, "position" text, role text, created_at timestamptz)
 language sql stable security definer set search_path to ''
as $$
  select i.id, i.user_id, p.username, p.full_name, p.position, i.role::text, i.created_at
    from public.company_invites i
    join public.profiles p on p.id = i.user_id
   where i.company_id = company and i.status = 'pending' and public.is_company_admin(company)
   order by i.created_at desc
$$;

revoke execute on function public.invite_to_company(uuid, uuid, text), public.respond_company_invite(uuid, boolean),
  public.cancel_company_invite(uuid), public.my_company_invites(), public.company_open_invites(uuid) from public, anon;
grant execute on function public.invite_to_company(uuid, uuid, text), public.respond_company_invite(uuid, boolean),
  public.cancel_company_invite(uuid), public.my_company_invites(), public.company_open_invites(uuid) to authenticated;
