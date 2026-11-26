-- Doneva: a message can be edited or deleted by its writer for 24 hours,
-- and only until someone else writes after it. Project admins can still moderate. Safe to run twice.
create or replace function public.guard_message_change()
 returns trigger language plpgsql security definer set search_path to ''
as $$
begin
  if auth.uid() is null then return new; end if;
  if new.body is not distinct from old.body and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;
  if coalesce(public.is_project_admin(public.conversation_project(old.conversation_id)), false) then
    return new;
  end if;
  if old.created_at < now() - interval '24 hours' then
    raise exception 'Messages can be edited or deleted for 24 hours only';
  end if;
  if exists (select 1 from public.messages m
              where m.conversation_id = old.conversation_id and m.created_at > old.created_at
                and m.sender_id <> old.sender_id) then
    raise exception 'This message can no longer be changed because someone has written after it';
  end if;
  return new;
end $$;
revoke execute on function public.guard_message_change() from public, anon, authenticated;

create or replace trigger messages_change_window before update on public.messages
  for each row execute function public.guard_message_change();
