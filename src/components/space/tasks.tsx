import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Tag } from '@/components/space/questions';
import { inScope, personName, placeName } from '@/components/space/scope';
import { type SpaceInfo } from '@/components/space/space';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Choices, EditedLabel, ErrorText, Field, Icon, TextButton } from '@/components/ui';
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

const FILTERS = ['Open', 'Done', 'All'] as const;
const PRIORITY = { high: 0, medium: 1, low: 2 };
const shortDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function Tasks({ info }: { info: SpaceInfo }) {
  const theme = useTheme();
  const { subgroups } = useWorkspace();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Open');
  const [adding, setAdding] = useState(false);
  const twoColumns = useWindowDimensions().width >= 1240 && !info.simple;

  const { rows, loading, error, reload } = useRows<Task>(info.project.id, () =>
    supabase
      .from('tasks')
      .select(SELECT)
      .eq('project_id', info.project.id)
      .order('created_at', { ascending: false })
      .returns<Task[]>(),
  );

  const mine = rows.filter((t) => inScope(info, subgroups, t.subgroup_id));
  const shown = mine
    .filter((t) => filter === 'All' || (filter === 'Done' ? !!t.completed_at : !t.completed_at))
    .sort(
      (a, b) => Number(!!a.completed_at) - Number(!!b.completed_at) || PRIORITY[a.priority] - PRIORITY[b.priority],
    );

  // One bar for tasks of this page itself, then one for each group or team inside it.
  const inside =
    info.level === 'project'
      ? subgroups.filter((s) => s.project_id === info.project.id && !s.parent_id)
      : subgroups.filter((s) => s.parent_id === info.subgroup?.id);
  const own = info.subgroup?.id ?? null;
  const bars = [
    { name: info.level === 'project' ? 'Whole project' : (info.subgroup?.name ?? ''), list: mine.filter((t) => t.subgroup_id === own) },
    ...inside.map((place) => {
      const ids = [place.id, ...subgroups.filter((s) => s.parent_id === place.id).map((s) => s.id)];
      return { name: place.name, list: mine.filter((t) => ids.includes(t.subgroup_id ?? '')) };
    }),
  ].filter((bar) => bar.list.length > 0);
  const upcoming = mine
    .filter((t) => !t.completed_at && t.due_date)
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))
    .slice(0, 4);

  const side = (
    <>
      <Card>
        <ThemedText type="label">Progress by {info.level === 'project' ? 'group' : 'team'}</ThemedText>
        {bars.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No tasks yet.
          </ThemedText>
        )}
        {bars.map((bar) => {
          const done = bar.list.filter((t) => t.completed_at).length;
          return (
            <View key={bar.name} style={{ gap: 6 }}>
              <View style={styles.between}>
                <ThemedText type="bold" numberOfLines={1} style={styles.grow}>
                  {bar.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {done}/{bar.list.length} done
                </ThemedText>
              </View>
              <View style={[styles.bar, { backgroundColor: theme.backgroundElement }]}>
                <View
                  style={[
                    styles.barFill,
                    { backgroundColor: theme.primary, width: `${Math.max((done / bar.list.length) * 100, 3)}%` },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </Card>
      <Card>
        <ThemedText type="label">Coming up</ThemedText>
        {upcoming.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No open tasks with a due date.
          </ThemedText>
        )}
        <View>
          {upcoming.map((task, index) => (
            <View key={task.id} style={[styles.upcoming, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
              <Chip text={shortDate(task.due_date as string)} tone="sky" />
              <View style={styles.grow}>
                <ThemedText type="bold" numberOfLines={1}>
                  {task.title}
                </ThemedText>
                {placeName(info, subgroups, task.subgroup_id) && (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {placeName(info, subgroups, task.subgroup_id)}
                  </ThemedText>
                )}
              </View>
            </View>
          ))}
        </View>
      </Card>
    </>
  );

  return (
    <View style={twoColumns ? styles.columns : styles.stack}>
      <View style={[styles.stack, twoColumns && styles.grow]}>
        <View style={styles.between}>
          <Choices options={FILTERS} value={filter} onChange={setFilter} />
          {info.isAdmin && <Button title="New task" icon="plus" small onPress={() => setAdding(true)} />}
        </View>
        {!info.isAdmin && (
          <ThemedText type="small" themeColor="textSecondary">
            Admins create tasks and tick them off. Everyone can add notes.
          </ThemedText>
        )}
        {adding && <NewTask info={info} onSaved={reload} onClose={() => setAdding(false)} />}
        <ErrorText>{error}</ErrorText>

        <Card style={styles.list}>
          {!loading && shown.length === 0 && (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              No tasks here.
            </ThemedText>
          )}
          {shown.map((task, index) => (
            <View key={task.id} style={index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }}>
              <TaskCard
                task={task}
                info={info}
                place={task.subgroup_id === own ? null : (placeName(info, subgroups, task.subgroup_id) ?? null)}
                onChanged={reload}
              />
            </View>
          ))}
        </Card>
        {!twoColumns && !info.simple && side}
      </View>
      {twoColumns && <View style={[styles.stack, styles.sideColumn]}>{side}</View>}
    </View>
  );
}

function NewTask({ info, onSaved, onClose }: { info: SpaceInfo; onSaved: () => void; onClose: () => void }) {
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      priority,
    });
    setBusy(false);
    if (failed) return setError(failed.message);
    onSaved();
    onClose();
  }

  return (
    <Card>
      <ThemedText type="heading">New task</ThemedText>
      <Field label="Task" required value={title} onChangeText={setTitle} />
      <Field label="Detailed description" value={description} onChangeText={setDescription} multiline />
      <Field label="Due date (day.month.year)" value={due} onChangeText={setDue} placeholder="03.12.2026" />
      <Choices options={PRIORITIES} value={priority} onChange={setPriority} />
      <ErrorText>{error}</ErrorText>
      <View style={styles.row}>
        <Button title="Add task" small onPress={save} loading={busy} disabled={!title.trim()} />
        <Button title="Cancel" variant="plain" small onPress={onClose} disabled={busy} />
      </View>
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
    <View style={styles.task}>
      <View style={styles.head}>
        <Tick checked={done} enabled={isAdmin && !busy} label={task.title} onPress={() => tick('tasks', task.id, !done)} />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={[styles.grow, { gap: 6 }]}
          onPress={() => setOpen(!open)}>
          <ThemedText type="bold" style={done ? styles.struck : undefined}>
            {task.title}
          </ThemedText>
          <View style={styles.tags}>
            {task.priority === 'high' && !done && <Tag text="High priority" tone="warn" />}
            {task.priority === 'low' && <Tag text="Low" tone="sky" />}
            {place && <Tag text={place} tone={place === 'Whole project' ? 'accent' : 'lavender'} />}
            {task.due_date && (
              <ThemedText type="small" themeColor="textSecondary">
                Due {shortDate(task.due_date)}
              </ThemedText>
            )}
            {items.length > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                · ☰ {ticked}/{items.length}
              </ThemedText>
            )}
            {notes.length > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                · {notes.length} note{notes.length === 1 ? '' : 's'}
              </ThemedText>
            )}
            {done && <Tag text={`Ticked off by ${personName(task.ticker)}`} tone="ok" icon="check" />}
          </View>
          <EditedLabel name={task.edited_at ? personName(task.editor) : null} at={task.edited_at} />
        </Pressable>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} />
      </View>

      {open && !editing && (
        <>
          <ThemedText type="label">Detailed description</ThemedText>
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
          <ThemedText type="label">Checklist</ThemedText>
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

          <ThemedText type="label">Notes</ThemedText>
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
    </View>
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
        {
          borderColor: props.checked ? theme.ok : theme.textSecondary,
          backgroundColor: props.checked ? theme.ok : 'transparent',
          opacity: props.enabled || props.checked ? 1 : 0.55,
        },
      ]}>
      {props.checked && <Feather name="check" size={18} color={theme.card} />}
    </Pressable>
  );
}

const PRIORITIES = [
  { value: 'high', label: 'High priority' },
  { value: 'medium', label: 'Normal' },
  { value: 'low', label: 'Low' },
] as const;

const styles = StyleSheet.create({
  stack: { gap: 18, minWidth: 0 },
  columns: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  sideColumn: { width: 340 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  bar: { height: 8, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 999 },
  upcoming: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  list: { paddingVertical: 4, paddingHorizontal: 14, gap: 0 },
  empty: { paddingVertical: 18, textAlign: 'center' },
  task: { paddingVertical: 14, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  grow: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  tags: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  struck: { textDecorationLine: 'line-through', opacity: 0.7 },
  note: { gap: Spacing.half, paddingVertical: Spacing.one },
  tick: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
