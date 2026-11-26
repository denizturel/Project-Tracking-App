import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Tag } from '@/components/space/questions';
import { inScope, personName, placeName } from '@/components/space/scope';
import { type SpaceInfo } from '@/components/space/space';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EditedLabel, ErrorText, Field, TextButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatDate, parseDate, useRows } from '@/lib/use-rows';
import { useWorkspace } from '@/lib/workspace';

type ChecklistItem = {
  id: string;
  body: string;
  sort_order: number;
  completed_at: string | null;
  edited_at: string | null;
  ticker: unknown;
  editor: unknown;
};

type Note = {
  id: string;
  body: string;
  author_id: string;
  created_at: string;
  edited_at: string | null;
  author: unknown;
  editor: unknown;
};

type Task = {
  id: string;
  subgroup_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high';
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  edited_at: string | null;
  ticker: unknown;
  editor: unknown;
  items: ChecklistItem[];
  notes: Note[];
};

const SELECT =
  'id, subgroup_id, title, description, due_date, priority, completed_at, created_by, created_at, edited_at, ' +
  'ticker:profiles!completed_by(full_name), editor:profiles!edited_by(full_name), ' +
  'items:task_checklist_items(id, body, sort_order, completed_at, edited_at, ' +
  'ticker:profiles!completed_by(full_name), editor:profiles!edited_by(full_name)), ' +
  'notes:task_notes(id, body, author_id, created_at, edited_at, ' +
  'author:profiles!author_id(full_name), editor:profiles!edited_by(full_name))';

type Action = PromiseLike<{ error: { message: string } | null }>;

export function Tasks({ info }: { info: SpaceInfo }) {
  const { subgroups } = useWorkspace();
  const [showDone, setShowDone] = useState(false);

  const { rows, loading, error, reload } = useRows<Task>(info.project.id, () =>
    supabase
      .from('tasks')
      .select(SELECT)
      .eq('project_id', info.project.id)
      .order('created_at', { ascending: false })
      .returns<Task[]>(),
  );

  const mine = rows.filter((t) => inScope(info, subgroups, t.subgroup_id));
  const open = mine.filter((t) => !t.completed_at);
  const done = mine.filter((t) => t.completed_at);

  return (
    <>
      <ThemedText type="subtitle">Tasks</ThemedText>
      {!info.isAdmin && (
        <ThemedText type="small" themeColor="textSecondary">
          Admins create tasks and tick them off. Everyone can add notes.
        </ThemedText>
      )}
      {info.isAdmin && <NewTask info={info} onSaved={reload} />}
      <ErrorText>{error}</ErrorText>

      {!loading && open.length === 0 && <ThemedText themeColor="textSecondary">No open tasks.</ThemedText>}
      {open.map((task) => (
        <TaskCard key={task.id} task={task} info={info} place={placeName(info, subgroups, task.subgroup_id)} onChanged={reload} />
      ))}

      {done.length > 0 && (
        <TextButton
          title={showDone ? `Hide finished tasks (${done.length})` : `Show finished tasks (${done.length})`}
          onPress={() => setShowDone(!showDone)}
        />
      )}
      {showDone &&
        done.map((task) => (
          <TaskCard key={task.id} task={task} info={info} place={placeName(info, subgroups, task.subgroup_id)} onChanged={reload} />
        ))}
    </>
  );
}

function NewTask({ info, onSaved }: { info: SpaceInfo; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return <Button title="Add a task" onPress={() => setOpen(true)} />;

  async function save() {
    const dueDate = due.trim() ? parseDate(due) : null;
    if (due.trim() && !dueDate) return setError('Write the date like 03.12.2026.');
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase.from('tasks').insert({
      project_id: info.project.id,
      subgroup_id: info.subgroup?.id ?? null,
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate,
    });
    setBusy(false);
    if (failed) return setError(failed.message);
    setTitle('');
    setDescription('');
    setDue('');
    setOpen(false);
    onSaved();
  }

  return (
    <Card>
      <Field label="Task" required value={title} onChangeText={setTitle} />
      <Field label="Detailed description" value={description} onChangeText={setDescription} multiline />
      <Field label="Due date (day.month.year)" value={due} onChangeText={setDue} placeholder="03.12.2026" />
      <ErrorText>{error}</ErrorText>
      <Button title="Add task" onPress={save} loading={busy} disabled={!title.trim()} />
      <Button title="Cancel" variant="plain" onPress={() => setOpen(false)} disabled={busy} />
    </Card>
  );
}

type CardProps = { task: Task; info: SpaceInfo; place: string | null; onChanged: () => void };

function TaskCard({ task, info, place, onChanged }: CardProps) {
  const { session } = useAuth();
  const me = session?.user.id;
  const { isAdmin } = info;
  const canEdit = isAdmin || task.created_by === me;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [due, setDue] = useState(task.due_date ?? '');
  const [item, setItem] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = [...task.items].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const notes = [...task.notes].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ticked = items.filter((i) => i.completed_at).length;
  const done = !!task.completed_at;

  async function run(action: Action) {
    setBusy(true);
    setError(null);
    const { error: failed } = await action;
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return false;
    }
    onChanged();
    return true;
  }

  const tick = (table: 'tasks' | 'task_checklist_items', id: string, value: boolean) =>
    run(
      supabase
        .from(table)
        .update({ completed_at: value ? new Date().toISOString() : null, completed_by: value ? me : null })
        .eq('id', id),
    );

  async function saveEdit() {
    const dueDate = due.trim() ? parseDate(due) : null;
    if (due.trim() && !dueDate) return setError('Write the date like 03.12.2026.');
    const saved = await run(
      supabase
        .from('tasks')
        .update({ title: title.trim(), description: description.trim() || null, due_date: dueDate })
        .eq('id', task.id),
    );
    if (saved) setEditing(false);
  }

  async function addItem() {
    const saved = await run(
      supabase.from('task_checklist_items').insert({ task_id: task.id, body: item.trim(), sort_order: items.length }),
    );
    if (saved) setItem('');
  }

  async function addNote() {
    const saved = await run(supabase.from('task_notes').insert({ task_id: task.id, body: note.trim() }));
    if (saved) setNote('');
  }

  return (
    <Card tint={done ? 'mint' : 'card'}>
      <View style={styles.head}>
        <Tick checked={done} enabled={isAdmin && !busy} label={task.title} onPress={() => tick('tasks', task.id, !done)} />
        <Pressable accessibilityRole="button" style={styles.grow} onPress={() => setOpen(!open)}>
          <ThemedText type="bold" style={done ? styles.struck : undefined}>
            {task.title}
          </ThemedText>
        </Pressable>
        <TextButton title={open ? 'Close' : 'Open'} onPress={() => setOpen(!open)} />
      </View>

      <View style={styles.tags}>
        {place && <Tag text={place} />}
        {task.due_date && <Tag text={`Due ${formatDate(task.due_date)}`} />}
        {items.length > 0 && <Tag text={`${ticked} of ${items.length} steps`} />}
        {notes.length > 0 && <Tag text={`${notes.length} note${notes.length === 1 ? '' : 's'}`} />}
        {done && <Tag text={`✓ Ticked off by ${personName(task.ticker)}`} />}
      </View>
      <EditedLabel name={task.edited_at ? personName(task.editor) : null} at={task.edited_at} />

      {open && !editing && (
        <>
          <ThemedText themeColor={task.description ? 'text' : 'textSecondary'}>
            {task.description || 'No detailed description.'}
          </ThemedText>
          {canEdit && (
            <View style={styles.row}>
              <TextButton title="Edit" onPress={() => setEditing(true)} />
              {isAdmin && (
                <TextButton
                  title="Delete"
                  danger
                  disabled={busy}
                  onPress={() => run(supabase.from('tasks').delete().eq('id', task.id))}
                />
              )}
            </View>
          )}
        </>
      )}

      {open && editing && (
        <>
          <Field label="Task" required value={title} onChangeText={setTitle} />
          <Field label="Detailed description" value={description} onChangeText={setDescription} multiline />
          <Field label="Due date (day.month.year)" value={due} onChangeText={setDue} />
          <Button title="Save" onPress={saveEdit} loading={busy} disabled={!title.trim()} />
          <Button title="Cancel" variant="plain" onPress={() => setEditing(false)} disabled={busy} />
        </>
      )}

      {open && (
        <>
          <ThemedText type="smallBold" themeColor="textSecondary">
            STEPS
          </ThemedText>
          {items.map((step) => (
            <View key={step.id} style={styles.head}>
              <Tick
                checked={!!step.completed_at}
                enabled={isAdmin && !busy}
                label={step.body}
                onPress={() => tick('task_checklist_items', step.id, !step.completed_at)}
              />
              <View style={styles.grow}>
                <ThemedText style={step.completed_at ? styles.struck : undefined}>{step.body}</ThemedText>
                {step.completed_at && (
                  <ThemedText type="small" themeColor="textSecondary">
                    Ticked off by {personName(step.ticker)}
                  </ThemedText>
                )}
              </View>
              {isAdmin && (
                <TextButton
                  title="Remove"
                  danger
                  disabled={busy}
                  onPress={() => run(supabase.from('task_checklist_items').delete().eq('id', step.id))}
                />
              )}
            </View>
          ))}
          {isAdmin && (
            <>
              <Field label="New step" value={item} onChangeText={setItem} onSubmitEditing={() => item.trim() && addItem()} />
              {!!item.trim() && <Button title="Add step" variant="secondary" onPress={addItem} loading={busy} />}
            </>
          )}

          <ThemedText type="smallBold" themeColor="textSecondary">
            NOTES
          </ThemedText>
          {notes.map((entry) => (
            <View key={entry.id} style={styles.note}>
              <ThemedText type="smallBold">
                {personName(entry.author)} · {formatDate(entry.created_at)}
              </ThemedText>
              <ThemedText>{entry.body}</ThemedText>
              <EditedLabel name={entry.edited_at ? personName(entry.editor) : null} at={entry.edited_at} />
              {(isAdmin || entry.author_id === me) && (
                <TextButton
                  title="Delete note"
                  danger
                  disabled={busy}
                  onPress={() => run(supabase.from('task_notes').delete().eq('id', entry.id))}
                />
              )}
            </View>
          ))}
          <Field label="Add a note" value={note} onChangeText={setNote} multiline />
          {!!note.trim() && <Button title="Save note" variant="secondary" onPress={addNote} loading={busy} />}
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

/** A large tick box. Only admins can press it (decided by Deniz). */
export function Tick(props: { checked: boolean; enabled: boolean; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: props.checked, disabled: !props.enabled }}
      accessibilityLabel={props.label}
      disabled={!props.enabled}
      onPress={props.onPress}
      hitSlop={8}
      style={[
        styles.tick,
        { borderColor: theme.primary, backgroundColor: props.checked ? theme.primary : 'transparent' },
      ]}>
      {props.checked && <ThemedText style={{ color: theme.onPrimary, fontWeight: 700 }}>✓</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  tags: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  struck: { textDecorationLine: 'line-through', opacity: 0.7 },
  note: { gap: Spacing.half, paddingVertical: Spacing.one },
  tick: { width: 30, height: 30, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
