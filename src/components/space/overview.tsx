import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';

import { inScope, placeName } from '@/components/space/scope';
import { type SpaceInfo } from '@/components/space/space';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, EditedLabel, ErrorText, Field, Icon, TextButton } from '@/components/ui';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';
import { useWorkspace } from '@/lib/workspace';

const MARKS: ThemeColor[] = ['primary', 'lavenderInk', 'ok', 'skyInk', 'warn'];

type TaskRow = { id: string; subgroup_id: string | null; title: string; due_date: string | null; completed_at: string | null };
type QuestionRow = { id: string; subgroup_id: string | null; title: string; status: string; created_at: string };
type MilestoneRow = { id: string; subgroup_id: string | null; title: string; due_date: string | null; done: boolean };
type TrainingRow = { id: string; subgroup_id: string | null };

const shortDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const daysUntil = (value: string) =>
  Math.round((new Date(`${value}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);

export function Overview({ info }: { info: SpaceInfo }) {
  const theme = useTheme();
  const router = useRouter();
  const { subgroups, reload } = useWorkspace();
  const { project, subgroup, level, isAdmin, simple } = info;
  const twoColumns = useWindowDimensions().width >= 1240 && !simple;
  const go = (tab: string) => router.setParams({ tab });

  const key = `${project.id}:${subgroup?.id ?? ''}`;
  const tasks = useRows<TaskRow>(key, () =>
    supabase.from('tasks').select('id, subgroup_id, title, due_date, completed_at').eq('project_id', project.id).returns<TaskRow[]>(),
  );
  const questions = useRows<QuestionRow>(key, () =>
    supabase
      .from('questions')
      .select('id, subgroup_id, title, status, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .returns<QuestionRow[]>(),
  );
  const milestones = useRows<MilestoneRow>(key, () =>
    supabase
      .from('milestones')
      .select('id, subgroup_id, title, due_date, done')
      .eq('project_id', project.id)
      .order('due_date', { ascending: true, nullsFirst: false })
      .returns<MilestoneRow[]>(),
  );
  const training = useRows<TrainingRow>(key, () =>
    supabase.from('training_items').select('id, subgroup_id').eq('project_id', project.id).returns<TrainingRow[]>(),
  );

  const here = <T extends { subgroup_id: string | null }>(rows: T[]) =>
    rows.filter((row) => inScope(info, subgroups, row.subgroup_id));
  const placeOf = (id: string | null) => placeName(info, subgroups, id);

  const openTasks = here(tasks.rows).filter((t) => !t.completed_at);
  const dueTasks = openTasks
    .filter((t) => t.due_date)
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string));
  const allQuestions = here(questions.rows);
  const openQuestions = allQuestions.filter((q) => q.status !== 'solved');
  const solved = allQuestions.filter((q) => q.status === 'solved');
  const schedule = here(milestones.rows);
  const doneCount = schedule.filter((m) => m.done).length;
  const next = schedule.find((m) => !m.done && m.due_date);
  const nextIn = next?.due_date ? daysUntil(next.due_date) : null;
  const trainingCount = here(training.rows).length;

  const children =
    level === 'project'
      ? subgroups.filter((s) => s.project_id === project.id && !s.parent_id)
      : level === 'group'
        ? subgroups.filter((s) => s.parent_id === subgroup?.id)
        : [];
  const childWord = level === 'project' ? 'group' : 'team';

  async function setRestricted(value: boolean) {
    await supabase.from('projects').update({ restrict_to_subgroups: value }).eq('id', project.id);
    reload();
  }

  const side = (
    <>
      {!simple && (
        <Card>
          <ThemedText type="label">Coming up</ThemedText>
          {dueTasks.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              No open tasks with a due date.
            </ThemedText>
          )}
          {dueTasks.slice(0, 4).map((task, index) => (
            <Pressable
              key={task.id}
              accessibilityRole="button"
              onPress={() => go('Tasks')}
              style={[styles.line, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
              <Chip text={shortDate(task.due_date as string)} tone={daysUntil(task.due_date as string) < 0 ? 'warn' : 'sky'} />
              <View style={styles.grow}>
                <ThemedText type="bold" numberOfLines={1}>
                  {task.title}
                </ThemedText>
                {placeOf(task.subgroup_id) && (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {placeOf(task.subgroup_id)}
                  </ThemedText>
                )}
              </View>
            </Pressable>
          ))}
        </Card>
      )}

      <Card>
        <ThemedText type="label">Latest solutions</ThemedText>
        {solved.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Solved questions will be listed here.
          </ThemedText>
        )}
        {solved.slice(0, 3).map((question, index) => (
          <Pressable
            key={question.id}
            accessibilityRole="button"
            onPress={() => go('Questions & solutions')}
            style={[styles.line, styles.top, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
            <Icon name="check-circle" color="ok" />
            <View style={styles.grow}>
              <ThemedText type="bold">{question.title}</ThemedText>
              {placeOf(question.subgroup_id) && (
                <ThemedText type="small" themeColor="textSecondary">
                  {placeOf(question.subgroup_id)}
                </ThemedText>
              )}
            </View>
          </Pressable>
        ))}
      </Card>
    </>
  );

  return (
    <View style={twoColumns ? styles.columns : styles.stack}>
      <View style={[styles.stack, twoColumns && styles.grow]}>
        <Details info={info} groupNames={level === 'project' ? children.map((c) => c.name) : []} />

        <View style={styles.tiles}>
          {!simple && (
            <Tile
              label="Open tasks"
              value={String(openTasks.length)}
              hint={dueTasks[0] ? `Next due ${shortDate(dueTasks[0].due_date as string)}` : 'Nothing due'}
              onPress={() => go('Tasks')}
            />
          )}
          <Tile
            label="Open questions"
            value={String(openQuestions.length)}
            hint={`${solved.length} solved, searchable`}
            tint="butter"
            ink="warn"
            onPress={() => go('Questions & solutions')}
          />
          {!simple && (
            <Tile
              label={next ? 'Next on the schedule' : 'Schedule'}
              value={nextIn === null ? '–' : nextIn < 0 ? 'Late' : nextIn === 0 ? 'Today' : `${nextIn} day${nextIn === 1 ? '' : 's'}`}
              hint={next ? `${shortDate(next.due_date as string)}, ${next.title}` : 'Nothing planned yet'}
              tint="mint"
              onPress={() => go('Schedule')}
            />
          )}
          <Tile
            label="Training"
            value={String(trainingCount)}
            hint="Links and documents"
            tint="lavender"
            onPress={() => go('Training')}
          />
        </View>

        {!simple && schedule.length > 0 && (
          <Card>
            <View style={styles.between}>
              <ThemedText type="label">Schedule</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {Math.round((doneCount / schedule.length) * 100)}% along
              </ThemedText>
            </View>
            <View style={[styles.bar, { backgroundColor: theme.backgroundElement }]}>
              <View
                style={[styles.barFill, { backgroundColor: theme.primary, width: `${(doneCount / schedule.length) * 100}%` }]}
              />
            </View>
            {schedule.slice(0, 5).map((m) => (
              <View key={m.id} style={styles.line}>
                <View
                  style={[
                    styles.dot,
                    { borderColor: m.done ? theme.ok : theme.border, backgroundColor: m.done ? theme.ok : theme.card },
                  ]}
                />
                <ThemedText type="small" themeColor="textSecondary" style={styles.date}>
                  {m.due_date ? shortDate(m.due_date) : ''}
                </ThemedText>
                <ThemedText style={styles.grow} numberOfLines={1}>
                  {m.title}
                </ThemedText>
              </View>
            ))}
            <TextButton title="Open the schedule" onPress={() => go('Schedule')} />
          </Card>
        )}

        {level === 'project' && isAdmin && (
          <Card>
            <View style={styles.line}>
              <View style={[styles.grow, { gap: Spacing.half }]}>
                <ThemedText type="bold">Members see only their own groups</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Everyone still sees the project chat and all questions and solutions.
                </ThemedText>
              </View>
              <Switch
                accessibilityLabel="Members see only their own groups"
                value={project.restrict_to_subgroups}
                onValueChange={setRestricted}
                trackColor={{ true: theme.primary, false: theme.border }}
              />
            </View>
          </Card>
        )}

        {level !== 'team' && (
          <Card>
            <ThemedText type="label">{level === 'project' ? 'Groups' : 'Teams'}</ThemedText>
            {children.length === 0 && (
              <ThemedText themeColor="textSecondary">
                {isAdmin ? `No ${childWord}s yet. Add the first one below.` : `No ${childWord}s for you here yet.`}
              </ThemedText>
            )}
            <View style={styles.tiles}>
              {children.map((child, index) => (
                <Link key={child.id} href={{ pathname: '/group/[id]', params: { id: child.id } }} asChild>
                  <Pressable accessibilityRole="link" style={styles.childLink}>
                    <View style={[styles.child, { borderColor: theme.border, backgroundColor: theme.background }]}>
                      <View style={[styles.mark, { backgroundColor: theme[MARKS[index % MARKS.length]] }]} />
                      <View style={styles.grow}>
                        <ThemedText type="bold" numberOfLines={1}>
                          {child.name}
                        </ThemedText>
                        {!!child.description && (
                          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                            {child.description}
                          </ThemedText>
                        )}
                      </View>
                      <Icon name="chevron-right" size={20} />
                    </View>
                  </Pressable>
                </Link>
              ))}
            </View>
            {isAdmin && (
              <NewChild
                word={childWord}
                projectId={project.id}
                parentId={level === 'group' ? (subgroup?.id ?? null) : null}
              />
            )}
          </Card>
        )}

        {!twoColumns && side}
      </View>
      {twoColumns && <View style={[styles.stack, styles.sideColumn]}>{side}</View>}
    </View>
  );
}

type TileProps = {
  label: string;
  value: string;
  hint: string;
  tint?: ThemeColor;
  ink?: ThemeColor;
  onPress: () => void;
};

/** One number at a glance; pressing it opens that section. */
function Tile({ label, value, hint, tint, ink, onPress }: TileProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. ${hint}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: theme[tint ?? 'card'], borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      <ThemedText type="label">{label}</ThemedText>
      <ThemedText type="number" themeColor={ink ?? 'text'}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
        {hint}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 18, minWidth: 0 },
  columns: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  sideColumn: { width: 340 },
  grow: { flex: 1, minWidth: 0 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    flexGrow: 1,
    flexBasis: 190,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 2,
    boxShadow: '0 2px 10px rgba(150, 80, 40, 0.05)',
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  top: { alignItems: 'flex-start' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bar: { height: 8, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 999 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  date: { width: 64 },
  childLink: { flexGrow: 1, flexBasis: 260 },
  child: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  mark: { width: 14, height: 14, borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', gap: Spacing.four, flexWrap: 'wrap', alignItems: 'center' },
});

/** Name and description, editable by admins, with the "Edited by" label. */
function Details({ info, groupNames }: { info: SpaceInfo; groupNames: string[] }) {
  const router = useRouter();
  const { reload } = useWorkspace();
  const { project, subgroup, parent, level, isAdmin, isProjectAdmin } = info;
  // A group's own admin manages its teams but cannot delete the group itself.
  const canDelete = !!subgroup && (level === 'team' || isProjectAdmin);
  const item = subgroup ?? project;
  const table = subgroup ? 'subgroups' : 'projects';

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase
      .from(table)
      .update({ name: name.trim(), description: description.trim() || null })
      .eq('id', item.id);
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    setEditing(false);
    reload();
  }

  async function remove() {
    if (!subgroup) return;
    setBusy(true);
    const { error: failed } = await supabase.from('subgroups').delete().eq('id', subgroup.id);
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    reload();
    router.replace(
      parent
        ? { pathname: '/group/[id]', params: { id: parent.id } }
        : { pathname: '/project/[id]', params: { id: project.id } },
    );
  }

  if (editing) {
    return (
      <Card>
        <Field label="Name" required value={name} onChangeText={setName} />
        <Field label="Description" value={description} onChangeText={setDescription} multiline />
        <ErrorText>{error}</ErrorText>
        <Button title="Save" onPress={save} loading={busy} disabled={!name.trim()} />
        <Button title="Cancel" variant="plain" onPress={() => setEditing(false)} disabled={busy} />
      </Card>
    );
  }

  return (
    <Card>
      <ThemedText type="label">About this {level}</ThemedText>
      <ThemedText themeColor={item.description ? 'text' : 'textSecondary'}>
        {item.description || 'No description yet.'}
      </ThemedText>
      {groupNames.length > 0 && (
        <View style={styles.chips}>
          {groupNames.map((groupName) => (
            <Chip key={groupName} text={groupName} tone="sky" />
          ))}
        </View>
      )}
      <EditedLabel name={item.editor} at={item.edited_at} />
      <ErrorText>{error}</ErrorText>
      {isAdmin && (
        <View style={styles.actions}>
          <Button title="Edit name and description" icon="edit-2" inline variant="secondary" onPress={() => setEditing(true)} />
          {canDelete && !confirmDelete && (
            <TextButton title={`Delete this ${level}`} danger onPress={() => setConfirmDelete(true)} />
          )}
          {canDelete && confirmDelete && (
            <>
              <TextButton
                title={`Yes, delete it with its chat${level === 'group' ? ' and teams' : ''}`}
                danger
                onPress={remove}
                disabled={busy}
              />
              <TextButton title="Keep it" onPress={() => setConfirmDelete(false)} />
            </>
          )}
        </View>
      )}
    </Card>
  );
}

function NewChild(props: { word: 'group' | 'team'; projectId: string; parentId: string | null }) {
  const { reload } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button title={`Add a ${props.word}`} icon="plus" inline variant="secondary" onPress={() => setOpen(true)} />
    );
  }

  async function create() {
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase
      .from('subgroups')
      .insert({ project_id: props.projectId, parent_id: props.parentId, name: name.trim() });
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    setName('');
    setOpen(false);
    reload();
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <Field label={`Name of the ${props.word}`} required value={name} onChangeText={setName} />
      <ErrorText>{error}</ErrorText>
      <Button title={`Create ${props.word}`} onPress={create} loading={busy} disabled={!name.trim()} />
      <Button title="Cancel" variant="plain" onPress={() => setOpen(false)} disabled={busy} />
    </View>
  );
}
