-- 036: notifications when someone adds you to a company, project, group or team,
-- and when someone asks to connect with you or accepts your request.

create or replace function public.notify_added()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  actor uuid := auth.uid();
  actor_name text;
  what text;
  body jsonb;
begin
  -- Joining by yourself (an invite link, creating a company) is not news to you.
  if actor is null or actor = new.user_id then return new; end if;
  select full_name into actor_name from public.profiles where id = actor;

  if tg_table_name = 'company_members' then
    what := 'added_company';
    select jsonb_build_object('company_id', c.id, 'name', c.name) into body from public.companies c where c.id = new.company_id;
  elsif tg_table_name = 'project_members' then
    what := 'added_project';
    select jsonb_build_object('project_id', p.id, 'name', p.name) into body from public.projects p where p.id = new.project_id;
  else
    what := 'added_group';
    select jsonb_build_object('subgroup_id', g.id, 'name', g.name, 'project_id', g.project_id, 'team', g.parent_id is not null)
      into body from public.subgroups g where g.id = new.subgroup_id;
  end if;

  insert into public.notifications (user_id, kind, payload)
  values (new.user_id, what, coalesce(body, '{}'::jsonb) || jsonb_build_object('by', actor, 'by_name', actor_name));
  return new;
end $$;

create trigger notify_added_company after insert on public.company_members
  for each row execute function public.notify_added();
create trigger notify_added_project after insert on public.project_members
  for each row execute function public.notify_added();
create trigger notify_added_group after insert on public.subgroup_members
  for each row execute function public.notify_added();

create or replace function public.notify_connection()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    insert into public.notifications (user_id, kind, payload)
    select new.addressee, 'connection_request',
           jsonb_build_object('connection_id', new.id, 'by', new.requester, 'by_name', p.full_name)
      from public.profiles p where p.id = new.requester;
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status is distinct from 'accepted' then
    insert into public.notifications (user_id, kind, payload)
    select new.requester, 'connection_accepted',
           jsonb_build_object('connection_id', new.id, 'by', new.addressee, 'by_name', p.full_name)
      from public.profiles p where p.id = new.addressee;
  end if;
  return new;
end $$;

create trigger notify_connection after insert or update on public.connections
  for each row execute function public.notify_connection();

revoke all on function public.notify_added() from public, anon, authenticated;
revoke all on function public.notify_connection() from public, anon, authenticated;
