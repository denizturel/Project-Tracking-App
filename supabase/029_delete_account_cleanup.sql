-- Doneva: deleting an account now also frees the username and removes the person's
-- connections, blocks and requests to join. Paste this into the Supabase SQL Editor and press Run.
-- Safe to run twice.
create or replace function public.delete_my_account()
 returns void language plpgsql security definer set search_path to ''
as $$
declare
  me uuid := auth.uid();
  stuck text;
begin
  if me is null then raise exception 'Not signed in'; end if;

  -- Do not leave other people in a company that has no admin.
  select c.name into stuck
    from public.company_members m join public.companies c on c.id = m.company_id
   where m.user_id = me and m.role in ('owner', 'admin')
     and exists (select 1 from public.company_members o where o.company_id = m.company_id and o.user_id <> me)
     and not exists (select 1 from public.company_members o
                      where o.company_id = m.company_id and o.user_id <> me and o.role in ('owner', 'admin'))
   limit 1;
  if stuck is not null then
    raise exception 'You are the only admin of %. Make someone else a company admin first.', stuck;
  end if;

  select p.name into stuck
    from public.project_members m join public.projects p on p.id = m.project_id
   where m.user_id = me and m.role = 'admin'
     and exists (select 1 from public.project_members o where o.project_id = m.project_id and o.user_id <> me)
     and not exists (select 1 from public.project_members o
                      where o.project_id = m.project_id and o.user_id <> me and o.role = 'admin')
   limit 1;
  if stuck is not null then
    raise exception 'You are the only admin of the project %. Make someone else an admin first.', stuck;
  end if;

  delete from public.subgroup_members where user_id = me;
  -- The "keep one admin" guard is for normal removals; here only projects with nobody else are left without one.
  perform set_config('app.deleting_account', '1', true);
  delete from public.project_members where user_id = me;
  perform set_config('app.deleting_account', '', true);
  delete from public.company_members where user_id = me;
  delete from public.devices where user_id = me;
  delete from public.notifications where user_id = me;
  delete from public.connections where requester = me or addressee = me;
  delete from public.user_blocks where blocker = me or blocked = me;
  delete from public.company_join_requests where user_id = me;
  delete from public.lookup_log where user_id = me;

  update public.profiles
     set full_name = 'Deleted user', avatar_url = null, company_name = null, position = null,
         department = null, phone = null, username = null
   where id = me;

  delete from auth.sessions where user_id = me;
  delete from auth.identities where user_id = me;
  update auth.users
     set email = 'deleted-' || me || '@deleted.invalid', phone = null, encrypted_password = null,
         raw_user_meta_data = '{}'::jsonb, banned_until = 'infinity'
   where id = me;
end
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
