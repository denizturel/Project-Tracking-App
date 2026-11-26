import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Tag } from '@/components/space/questions';
import { inScope, personName, placeName } from '@/components/space/scope';
import { type SpaceInfo } from '@/components/space/space';
import { Tick } from '@/components/space/tasks';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EditedLabel, ErrorText, Field, TextButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { formatDate, parseDate, useRows } from '@/lib/use-rows';
import { useWorkspace } from '@/lib/workspace';

type Milestone = {
  id: string;
  subgroup_id: string | null;
  title: string;
  start_date: string | null;
  due_date: string | null;
  done: boolean;
  edited_at: string | null;
  editor: unknown;
};

const VIEWS = ['List', 'Timeline', 'Calendar'] as const;
type ViewName = (typeof VIEWS)[number];

const day = (value: string) => new Date(`${value}T00:00:00`).getTime();

export function Schedule({ info }: { info: SpaceInfo }) {
  const { subgroups } = useWorkspace();
  const [view, setView] = useState<ViewName>('List');

  const { rows, loading, error, reload } = useRows<Milestone>(info.project.id, () =>
    supabase
      .from('milestones')
      .select('id, subgroup_id, title, start_date, due_date, done, edited_at, editor:profiles!edited_by(full_name)')
      .eq('project_id', info.project.id)
      .order('due_date', { ascending: true, nullsFirst: false })
      .returns<Milestone[]>(),
  );
  const shown = rows.filter((m) => inScope(info, subgroups, m.subgroup_id));

  return (
    <>
      <ThemedText type="subtitle">Schedule</ThemedText>
      <View style={styles.row}>
        {VIEWS.map((name) => (
          <TextButton key={name} title={(view === name ? '● ' : '○ ') + name} onPress={() => setView(name)} />
        ))}
      </View>

      {info.isAdmin && <NewMilestone info={info} onSaved={reload} />}
      <ErrorText>{error}</ErrorText>
      {!loading && shown.length === 0 && (
        <ThemedText themeColor="textSecondary">Nothing on the schedule yet.</ThemedText>
      )}

      {view === 'List' &&
        shown.map((m) => (
          <MilestoneCard
            key={m.id}
            milestone={m}
            place={placeName(info, subgroups, m.subgroup_id)}
            isAdmin={info.isAdmin}
            onChanged={reload}
          />
        ))}
      {view === 'Timeline' && shown.length > 0 && <Timeline items={shown} />}
      {view === 'Calendar' && shown.length > 0 && <Calendar items={shown} />}
    </>
  );
}

function NewMilestone({ info, onSaved }: { info: SpaceInfo; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return <Button title="Add to the schedule" icon="plus" inline onPress={() => setOpen(true)} />;

  async function save() {
    const startDate = start.trim() ? parseDate(start) : null;
    const dueDate = due.trim() ? parseDate(due) : null;
    if ((start.trim() && !startDate) || (due.trim() && !dueDate)) return setError('Write dates like 03.12.2026.');
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase.from('milestones').insert({
      project_id: info.project.id,
      subgroup_id: info.subgroup?.id ?? null,
      title: title.trim(),
      start_date: startDate,
      due_date: dueDate,
    });
    setBusy(false);
    if (failed) return setError(failed.message);
    setTitle('');
    setStart('');
    setDue('');
    setOpen(false);
    onSaved();
  }

  return (
    <Card>
      <Field label="What happens" required value={title} onChangeText={setTitle} />
      <Field label="Starts (day.month.year)" value={start} onChangeText={setStart} placeholder="01.12.2026" />
      <Field label="Ends or is due (day.month.year)" value={due} onChangeText={setDue} placeholder="15.12.2026" />
      <ErrorText>{error}</ErrorText>
      <Button title="Add" onPress={save} loading={busy} disabled={!title.trim()} />
      <Button title="Cancel" variant="plain" onPress={() => setOpen(false)} disabled={busy} />
    </Card>
  );
}

type CardProps = { milestone: Milestone; place: string | null; isAdmin: boolean; onChanged: () => void };

function MilestoneCard({ milestone, place, isAdmin, onChanged }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(milestone.title);
  const [start, setStart] = useState(milestone.start_date ?? '');
  const [due, setDue] = useState(milestone.due_date ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: PromiseLike<{ error: { message: string } | null }>) {
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

  async function save() {
    const startDate = start.trim() ? parseDate(start) : null;
    const dueDate = due.trim() ? parseDate(due) : null;
    if ((start.trim() && !startDate) || (due.trim() && !dueDate)) return setError('Write dates like 03.12.2026.');
    const saved = await run(
      supabase
        .from('milestones')
        .update({ title: title.trim(), start_date: startDate, due_date: dueDate })
        .eq('id', milestone.id),
    );
    if (saved) setEditing(false);
  }

  const dates = [formatDate(milestone.start_date), formatDate(milestone.due_date)].filter(Boolean).join(' to ');

  return (
    <Card>
      {editing ? (
        <>
          <Field label="What happens" required value={title} onChangeText={setTitle} />
          <Field label="Starts (day.month.year)" value={start} onChangeText={setStart} />
          <Field label="Ends or is due (day.month.year)" value={due} onChangeText={setDue} />
          <Button title="Save" onPress={save} loading={busy} disabled={!title.trim()} />
          <Button title="Cancel" variant="plain" onPress={() => setEditing(false)} disabled={busy} />
        </>
      ) : (
        <>
          <View style={styles.head}>
            <Tick
              checked={milestone.done}
              enabled={isAdmin && !busy}
              label={milestone.title}
              onPress={() => run(supabase.from('milestones').update({ done: !milestone.done }).eq('id', milestone.id))}
            />
            <View style={styles.grow}>
              <ThemedText type="bold">{milestone.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {dates || 'No dates yet'}
              </ThemedText>
            </View>
          </View>
          <View style={styles.row}>
            {place && <Tag text={place} tone="sky" />}
            {milestone.done && <Tag text="✓ Done" tone="ok" />}
          </View>
          <EditedLabel name={milestone.edited_at ? personName(milestone.editor) : null} at={milestone.edited_at} />
          {isAdmin && (
            <View style={styles.row}>
              <TextButton title="Edit" onPress={() => setEditing(true)} />
              <TextButton
                title="Delete"
                danger
                disabled={busy}
                onPress={() => run(supabase.from('milestones').delete().eq('id', milestone.id))}
              />
            </View>
          )}
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

/** Bars on a shared time axis, from the earliest start to the latest end. */
function Timeline({ items }: { items: Milestone[] }) {
  const theme = useTheme();
  const dated = items.filter((m) => m.start_date || m.due_date);
  if (dated.length === 0) return <ThemedText themeColor="textSecondary">Add dates to see the timeline.</ThemedText>;

  const spans = dated.map((m) => {
    const from = day((m.start_date ?? m.due_date) as string);
    const to = day((m.due_date ?? m.start_date) as string);
    return { m, from: Math.min(from, to), to: Math.max(from, to) };
  });
  const min = Math.min(...spans.map((s) => s.from));
  const max = Math.max(...spans.map((s) => s.to));
  const total = Math.max(max - min, 86_400_000);

  return (
    <Card>
      <View style={styles.axis}>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(new Date(min).toISOString())}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(new Date(max).toISOString())}
        </ThemedText>
      </View>
      {spans.map(({ m, from, to }) => (
        <View key={m.id} style={{ gap: Spacing.half }}>
          <ThemedText type="smallBold">{m.title}</ThemedText>
          <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
            <View
              style={[
                styles.bar,
                {
                  backgroundColor: m.done ? theme.ok : theme.primary,
                  borderColor: theme.border,
                  marginLeft: `${((from - min) / total) * 100}%`,
                  width: `${Math.max(((to - from) / total) * 100, 3)}%`,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </Card>
  );
}

/** Month by month, each item under the month it ends in. */
function Calendar({ items }: { items: Milestone[] }) {
  const months = new Map<string, Milestone[]>();
  for (const m of items) {
    const date = m.due_date ?? m.start_date;
    const key = date ? date.slice(0, 7) : 'No date';
    months.set(key, [...(months.get(key) ?? []), m]);
  }
  const keys = [...months.keys()].sort();

  return (
    <>
      {keys.map((key) => (
        <Card key={key} tint="backgroundElement">
          <ThemedText type="bold">
            {key === 'No date'
              ? key
              : new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </ThemedText>
          {(months.get(key) ?? []).map((m) => (
            <View key={m.id} style={styles.head}>
              <ThemedText type="smallBold" style={styles.dayNumber}>
                {(m.due_date ?? m.start_date)?.slice(8, 10) ?? ''}
              </ThemedText>
              <ThemedText style={styles.grow}>
                {m.done ? '✓ ' : ''}
                {m.title}
              </ThemedText>
            </View>
          ))}
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  grow: { flex: 1 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 18, borderRadius: 9, overflow: 'hidden' },
  bar: { height: 18, borderRadius: 9, borderWidth: 1 },
  dayNumber: { width: 28 },
});
