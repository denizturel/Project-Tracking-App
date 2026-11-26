-- Release check finding: a note's writer could re-attribute a note or move it to another visible task,
-- because the update rule did not check the changed row. Only the text of a note may change now.
revoke update on public.task_notes from authenticated, anon;
grant update (body) on public.task_notes to authenticated;
alter policy notes_update on public.task_notes
  with check ((author_id = (select auth.uid())) or public.can_manage_task(task_id));
