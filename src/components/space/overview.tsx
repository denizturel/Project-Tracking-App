import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';

import { ScheduleCard, type ScheduleView, dateText, statusOf, useMilestones } from '@/components/space/schedule';
import { inScope, placeName } from '@/components/space/scope';
import { type SpaceInfo } from '@/components/space/space';
import { Link } from '@/components/go';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, Chip, EditedLabel, ErrorText, Field, Icon, TextButton, MoreMenu } from '@/components/ui';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';
import { type SubgroupNode, useWorkspace } from '@/lib/workspace';
import { locale } from '@/lib/i18n';

export const MARKS: ThemeColor[] = ['primary', 'lavenderInk', 'ok', 'skyInk', 'warn'];

type TaskRow = { id: string; subgroup_id: string | null; title: string; due_date: string | null; completed_at: string | null };
type QuestionRow = { id: string; subgroup_id: string | null; title: string; status: string; created_at: string };
type TrainingRow = { id: string; subgroup_id: string | null };
type PersonRow = {
  user_id: string;
  role?: string;
  subgroup_id?: string;
  profile: { full_name: string; position: string | null; company_name: string | null } | null;
};

const shortDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
const daysUntil = (value: string) =>
  Math.round((new Date(`${value}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A soft colour fading into the card, as on the prototype's "About" cards. */
export function fade(from: string, to: string): ViewStyle {
  const image = `linear-gradient(135deg, ${from}, ${to} 70%)`;
  return (Platform.OS === 'web' ? { backgroundImage: image } : { experimental_backgroundImage: image }) as ViewStyle;
}

/** Colour mark of a group (by its place among the project's groups) or of a team (among its group's teams). */
export function markOf(subgroups: SubgroupNode[], item: SubgroupNode): ThemeColor {
  const siblings = subgroups.filter((s) => s.project_id === item.project_id && s.parent_id === item.parent_id);
  return MARKS[Math.max(siblings.indexOf(item), 0) % MARKS.length];
}

export function Overview({ info }: { info: SpaceInfo }) {
  const theme = useTheme();
  const router = useRouter();
  const { subgroups } = useWorkspace();
  const { project, subgroup, level, isAdmin } = info;
  const width = useWindowDimensions().width;
  const twoColumns = width >= 1240;
  // Three tiles in a row, two on phones, as in the prototype.
  const tileWidth = width < 700 ? '47.8%' : '31.7%';
  const go = (tab: string) => router.setParams({ tab });
  const [view, setView] = useState<ScheduleView>('List');

  const key = project.id;
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
  const milestones = useMilestones(project.id);
  const training = useRows<TrainingRow>(key, () =>
    supabase.from('training_items').select('id, subgroup_id').eq('project_id', project.id).returns<TrainingRow[]>(),
  );
  const members = useRows<PersonRow>(key, () =>
    supabase
      .from('project_members')
      .select('user_id, role, profile:profiles!user_id(full_name, position, company_name)')
      .eq('project_id', project.id)
      .returns<PersonRow[]>(),
  );
  const placed = useRows<PersonRow>(`${key}:${subgroups.length}`, () =>
    supabase
      .from('subgroup_members')
      .select('user_id, subgroup_id, profile:profiles!user_id(full_name, position, company_name)')
      .in('subgroup_id', subgroups.filter((s) => s.project_id === project.id).map((s) => s.id))
      .returns<PersonRow[]>(),
  );

  const here = <T extends { subgroup_id: string | null }>(rows: T[]) =>
    rows.filter((row) => inScope(info, subgroups, row.subgroup_id));
  const placeOf = (id: string | null) => placeName(info, subgroups, id);

  const myTasks = here(tasks.rows);
  const openTasks = myTasks.filter((t) => !t.completed_at);
  const dueTasks = [...openTasks].sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'));
  const allQuestions = here(questions.rows);
  const openQuestions = allQuestions.filter((q) => q.status !== 'solved');
  const solved = allQuestions.filter((q) => q.status === 'solved');
  const ownSchedule = milestones.rows.filter((m) => m.subgroup_id === (subgroup?.id ?? null));
  const next = ownSchedule.find((m) => statusOf(m) === 'now') ?? ownSchedule.find((m) => !m.done);
  const nextIn = next?.due_date ? daysUntil(next.due_date) : null;
  const trainingCount = here(training.rows).length;

  const children =
    level === 'project'
      ? subgroups.filter((s) => s.project_id === project.id && !s.parent_id)
      : level === 'group'
        ? subgroups.filter((s) => s.parent_id === subgroup?.id)
        : [];
  const tree = subgroup ? [subgroup.id, ...children.map((c) => c.id)] : [];
  const peopleHere = subgroup
    ? placed.rows.filter((p, i, all) => tree.includes(p.subgroup_id ?? '') && all.findIndex((x) => x.user_id === p.user_id && tree.includes(x.subgroup_id ?? '')) === i)
    : members.rows;

  const taskList = (title: string, withButton: boolean) => (
    <Card>
      <View style={styles.between}>
        <ThemedText type="label">{title}</ThemedText>
        {withButton && isAdmin && (
          <Button title="New task" icon="plus" variant="secondary" small onPress={() => go('Tasks')} />
        )}
      </View>
      {dueTasks.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          No open tasks.
        </ThemedText>
      )}
      <View>
        {dueTasks.slice(0, 4).map((task, index) => (
          <Pressable
            key={task.id}
            accessibilityRole="button"
            onPress={() => go('Tasks')}
            style={[styles.line, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
            <View style={styles.dateChip}>
              <Chip
                text={task.due_date ? shortDate(task.due_date) : 'No date'}
                tone={task.due_date && daysUntil(task.due_date) < 0 ? 'warn' : 'sky'}
              />
            </View>
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
      </View>
    </Card>
  );

  const side =
    level === 'project' ? (
      <>
        {taskList('Coming up', false)}
        <Card>
          <ThemedText type="label">Latest solutions</ThemedText>
          {solved.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Solved questions will be listed here.
            </ThemedText>
          )}
          <View>
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
          </View>
        </Card>
        <Card>
          <View style={styles.between}>
            <ThemedText type="label">Team</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {count(members.rows.length, 'person', 'people')}
            </ThemedText>
          </View>
          <View>
            {members.rows.slice(0, 6).map((person) => (
              <View key={person.user_id} style={styles.line}>
                <Avatar name={person.profile?.full_name} size={36} />
                <View style={styles.grow}>
                  <ThemedText type="bold" numberOfLines={1}>
                    {person.profile?.full_name ?? 'Unknown'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {[person.profile?.position, person.profile?.company_name].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
                {person.role === 'admin' && <Chip text="Admin" />}
              </View>
            ))}
          </View>
          <Button title="See who is in which group" variant="secondary" small onPress={() => go('People')} />
        </Card>
      </>
    ) : (
      <>
        {level === 'group' && !info.simple && (
          <Card>
            <View style={styles.between}>
              <ThemedText type="label">Teams in this group</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {children.length}
              </ThemedText>
            </View>
            <View>
              {children.map((child, index) => {
                const open = tasks.rows.filter((t) => t.subgroup_id === child.id && !t.completed_at).length;
                const people = placed.rows.filter((p) => p.subgroup_id === child.id).length;
                const waiting = questions.rows.filter((q) => q.subgroup_id === child.id && q.status !== 'solved').length;
                return (
                  <Link key={child.id} href={{ pathname: '/group/[id]', params: { id: child.id } }} asChild>
                    <Pressable accessibilityRole="link">
                      <View style={[styles.line, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                        <View style={[styles.mark, { backgroundColor: theme[markOf(subgroups, child)] }]} />
                        <View style={styles.grow}>
                          <ThemedText type="bold" numberOfLines={1}>
                            {child.name}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {count(open, 'open task')} · {count(people, 'person', 'people')}
                          </ThemedText>
                        </View>
                        {waiting > 0 ? <Chip text={`${waiting} open`} tone="warn" /> : <Icon name="chevron-right" size={18} />}
                      </View>
                    </Pressable>
                  </Link>
                );
              })}
            </View>
            {info.isFullAdmin && <NewChild word="team" projectId={project.id} parentId={subgroup?.id ?? null} />}
          </Card>
        )}
        {taskList('Open tasks', true)}
        <Card>
          <ThemedText type="label">Questions & solutions</ThemedText>
          {allQuestions.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              No questions yet.
            </ThemedText>
          )}
          <View>
            {allQuestions.slice(0, 4).map((question, index) => (
              <Pressable
                key={question.id}
                accessibilityRole="button"
                onPress={() => go('Questions & solutions')}
                style={[styles.line, styles.top, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                <Icon
                  name={question.status === 'solved' ? 'check' : 'help-circle'}
                  color={question.status === 'solved' ? 'ok' : 'warn'}
                />
                <View style={styles.grow}>
                  <ThemedText type="bold">{question.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {question.status === 'solved' ? 'Solved' : 'Waiting for a solution'}
                  </ThemedText>
                </View>
              </Pressable>
            ))}
          </View>
        </Card>
        <Card>
          <View style={styles.between}>
            <ThemedText type="label">People</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {peopleHere.length}
            </ThemedText>
          </View>
          <View style={styles.faces}>
            {peopleHere.map((person) => (
              <Avatar key={person.user_id} name={person.profile?.full_name} size={36} />
            ))}
          </View>
          <Button title="See everyone" variant="secondary" small onPress={() => go('People')} />
        </Card>
      </>
    );

  return (
    <View style={twoColumns ? styles.columns : styles.stack}>
      <View style={[styles.stack, twoColumns && styles.grow]}>
        <Details
          info={info}
          groupNames={level === 'project' ? children.map((c) => c.name) : []}
          note={
            level === 'group' && children.length > 0
              ? `Numbers below include all ${count(children.length, 'team')} inside.`
              : null
          }
        />

        <View style={styles.tiles}>
          <Tile
            width={tileWidth}
            label="Open tasks"
            value={String(openTasks.length)}
            hint={
              level === 'project'
                ? dueTasks[0]?.due_date
                  ? `Next due ${shortDate(dueTasks[0].due_date)}`
                  : 'Nothing due'
                : `${myTasks.length - openTasks.length} done`
            }
            onPress={() => go('Tasks')}
          />
          <Tile
            width={tileWidth}
            label="Open questions"
            value={String(openQuestions.length)}
            hint={level === 'project' ? `${solved.length} solved, searchable` : `${solved.length} solved`}
            tint="butter"
            ink="warn"
            onPress={() => go('Questions & solutions')}
          />
          <Tile
            width={tileWidth}
            label="Next milestone"
            value={
              !next
                ? 'None'
                : level === 'project' && nextIn !== null && nextIn > 0
                  ? count(nextIn, 'day')
                  : dateText(next) || 'No date'
            }
            hint={
              next
                ? level === 'project' && nextIn !== null && nextIn > 0
                  ? `${dateText(next)}, ${next.title}`
                  : next.title
                : isAdmin
                  ? 'Add one in the schedule below'
                  : 'Nothing planned yet'
            }
            tint="mint"
            onPress={() => go(level === 'project' ? 'Overview' : 'Schedule')}
          />
          <Tile
            width={tileWidth}
            label="Training"
            value={String(trainingCount)}
            hint="Links and documents"
            tint="lavender"
            onPress={() => go('Training')}
          />
        </View>

        <ScheduleCard
          info={info}
          place={subgroup}
          rows={milestones.rows}
          view={view}
          onView={setView}
          onChanged={milestones.reload}
        />

        {!twoColumns && side}
      </View>
      {twoColumns && <View style={[styles.stack, styles.sideColumn]}>{side}</View>}
    </View>
  );
}

/** One group or team as a card: colour mark, name, what is open, and who is in it. */
function PlaceCard({ item, big, people, openQuestions, teams }: {
  item: SubgroupNode;
  big?: boolean;
  people: PersonRow[];
  openQuestions: number;
  teams?: number;
}) {
  const theme = useTheme();
  const { subgroups } = useWorkspace();
  const mark = theme[markOf(subgroups, item)];
  return (
    <Link href={{ pathname: '/group/[id]', params: { id: item.id } }} asChild>
      <Pressable accessibilityRole="link" style={big ? undefined : styles.teamLink}>
        <View
          style={[
            styles.place,
            { backgroundColor: theme.card, borderColor: theme.border },
            big && fade(`${mark}40`, theme.card),
          ]}>
          <View style={styles.between}>
            <View style={[styles.nameRow, styles.grow]}>
              <View style={[styles.mark, { backgroundColor: mark }, big && { width: 14, height: 14 }]} />
              <ThemedText type="heading" style={[styles.grow, big && { fontSize: 21, lineHeight: 28 }]} numberOfLines={2}>
                {item.name}
              </ThemedText>
            </View>
            {openQuestions > 0 && <Chip text={`${openQuestions} open`} tone="warn" />}
          </View>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {[item.description, teams !== undefined ? count(teams, 'team') : null].filter(Boolean).join(' · ') ||
              'No description yet.'}
          </ThemedText>
          <View style={styles.faceRow}>
            {people.slice(0, 7).map((person) => (
              <View key={person.user_id} style={styles.overlap}>
                <Avatar name={person.profile?.full_name} size={32} />
              </View>
            ))}
            <ThemedText type="small" themeColor="textSecondary" style={{ marginLeft: people.length ? 14 : 0 }}>
              {count(people.length, 'person', 'people')}
            </ThemedText>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

/** "Groups" tab of a project and "Teams" tab of a group: every group as a big card with its teams under it. */
export function Places({ info }: { info: SpaceInfo }) {
  const { subgroups } = useWorkspace();
  const { project, subgroup, level } = info;
  const isAdmin = info.isFullAdmin;
  const ids = subgroups.filter((s) => s.project_id === project.id).map((s) => s.id);
  const placed = useRows<PersonRow>(`${project.id}:${ids.length}`, () =>
    supabase
      .from('subgroup_members')
      .select('user_id, subgroup_id, profile:profiles!user_id(full_name, position, company_name)')
      .in('subgroup_id', ids)
      .returns<PersonRow[]>(),
  );
  const questions = useRows<{ subgroup_id: string | null }>(project.id, () =>
    supabase
      .from('questions')
      .select('subgroup_id')
      .eq('project_id', project.id)
      .neq('status', 'solved')
      .returns<{ subgroup_id: string | null }[]>(),
  );

  const kids = (id: string) => subgroups.filter((s) => s.parent_id === id);
  const peopleIn = (list: string[]) =>
    placed.rows.filter((p, i, all) => list.includes(p.subgroup_id ?? '') && all.findIndex((x) => x.user_id === p.user_id && list.includes(x.subgroup_id ?? '')) === i);
  const openIn = (list: string[]) => questions.rows.filter((q) => list.includes(q.subgroup_id ?? '')).length;

  const teamGrid = (groupId: string) => (
    <View style={styles.teamGrid}>
      {kids(groupId).map((team) => (
        <PlaceCard key={team.id} item={team} people={peopleIn([team.id])} openQuestions={openIn([team.id])} />
      ))}
      {isAdmin && (
        <View style={styles.teamLink}>
          <NewChild word="team" projectId={project.id} parentId={groupId} card />
        </View>
      )}
    </View>
  );

  if (level === 'group' && subgroup) {
    return (
      <>
        <ThemedText themeColor="textSecondary">Every team inside {subgroup.name}. Its managers see all of them.</ThemedText>
        {teamGrid(subgroup.id)}
      </>
    );
  }

  const groups = subgroups.filter((s) => s.project_id === project.id && !s.parent_id);
  return (
    <>
      <ThemedText themeColor="textSecondary">
        {isAdmin
          ? 'Each group can have smaller teams inside it. Admins see everything, a group manager sees every team in their group, and staff see their own team.'
          : 'You see the groups and teams you were added to.'}
      </ThemedText>
      {groups.map((group) => {
        const tree = [group.id, ...kids(group.id).map((k) => k.id)];
        return (
          <View key={group.id} style={styles.stack}>
            <PlaceCard item={group} big people={peopleIn(tree)} openQuestions={openIn(tree)} teams={kids(group.id).length} />
            {teamGrid(group.id)}
          </View>
        );
      })}
      {isAdmin && <NewChild word="group" projectId={project.id} parentId={null} primary />}
    </>
  );
}

type TileProps = {
  label: string;
  value: string;
  hint: string;
  tint?: ThemeColor;
  ink?: ThemeColor;
  onPress: () => void;
  width: `${number}%`;
};

/** One number at a glance; pressing it opens that section. */
function Tile({ label, value, hint, tint, ink, onPress, width }: TileProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. ${hint}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { width, backgroundColor: theme[tint ?? 'card'], borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
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
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  tile: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 2,
    boxShadow: '0 2px 10px rgba(150, 80, 40, 0.05)',
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  top: { alignItems: 'flex-start' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dateChip: { minWidth: 68, alignItems: 'center' },
  mark: { width: 12, height: 12, borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', gap: Spacing.three, flexWrap: 'wrap', alignItems: 'center' },
  faces: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  place: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 6,
    boxShadow: '0 2px 10px rgba(150, 80, 40, 0.05)',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  faceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  overlap: { marginRight: -6 },
  teamGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  teamLink: { flexGrow: 1, flexBasis: 240, maxWidth: 420 },
  addCard: {
    flex: 1,
    minHeight: 110,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
});

/** Name and description, editable by admins, with the "Edited by" label. */
function Details({ info, groupNames, note }: { info: SpaceInfo; groupNames: string[]; note: string | null }) {
  const router = useRouter();
  const theme = useTheme();
  const { subgroups } = useWorkspace();
  // The page header's "Edit group" button opens the form through the address.
  const params = useLocalSearchParams<{ edit?: string }>();
  const { reload, companies } = useWorkspace();
  const { project, subgroup, parent, level, isAdmin, isProjectAdmin } = info;
  const companyRole = companies.find((c) => c.id === project.company_id)?.role;
  // A manager deletes teams but not their own group. Projects are deleted by the owner and company admins.
  const canDelete = subgroup
    ? info.isFullAdmin && (level === 'team' || isProjectAdmin)
    : companyRole === 'owner' || companyRole === 'admin';
  const item = subgroup ?? project;
  const table = subgroup ? 'subgroups' : 'projects';

  const [editingHere, setEditingHere] = useState(false);
  const editing = editingHere || params.edit === '1';
  const setEditing = (value: boolean) => {
    setEditingHere(value);
    if (!value && params.edit) router.setParams({ edit: undefined });
  };
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
    setBusy(true);
    const { error: failed } = await supabase.from(table).delete().eq('id', item.id);
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    reload();
    if (!subgroup) router.dismissTo('/');
    else
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

  const soft = subgroup ? `${theme[markOf(subgroups, subgroup)]}33` : theme.backgroundSelected;

  return (
    <Card style={fade(soft, theme.card)}>
      <ThemedText type="label">About this {level}</ThemedText>
      <ThemedText themeColor={item.description ? 'text' : 'textSecondary'} style={{ fontSize: 18, lineHeight: 27 }}>
        {item.description || 'No description yet.'}
      </ThemedText>
      {note && (
        <ThemedText type="small" themeColor="textSecondary">
          {note}
        </ThemedText>
      )}
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
          {!confirmDelete && (
            <MoreMenu
              actions={[
                { title: `Edit ${level}`, onPress: () => setEditing(true) },
                canDelete && { title: `Delete this ${level}`, danger: true, onPress: () => setConfirmDelete(true) },
              ]}
            />
          )}
          {canDelete && confirmDelete && (
            <>
              <TextButton
                title={`Yes, delete it with its chat${level === 'group' ? ' and teams' : level === 'project' ? ', groups and teams' : ''}`}
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

type NewChildProps = {
  word: 'group' | 'team';
  projectId: string;
  parentId: string | null;
  /** Shown as a dashed card in a grid of teams. */
  card?: boolean;
  primary?: boolean;
};

export function NewChild({ word, projectId, parentId, card, primary }: NewChildProps) {
  const theme = useTheme();
  const { reload } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    if (card) {
      return (
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={[styles.addCard, { borderColor: theme.border }]}>
          <Icon name="plus" size={20} />
          <ThemedText type="bold" themeColor="textSecondary">
            New {word}
          </ThemedText>
        </Pressable>
      );
    }
    return (
      <Button
        title={`New ${word}`}
        icon="plus"
        small={!primary}
        inline
        variant={primary ? 'primary' : 'secondary'}
        onPress={() => setOpen(true)}
      />
    );
  }

  async function create() {
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase
      .from('subgroups')
      .insert({ project_id: projectId, parent_id: parentId, name: name.trim(), description: description.trim() || null });
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    setName('');
    setDescription('');
    setOpen(false);
    reload();
  }

  return (
    <View style={[styles.place, { backgroundColor: theme.card, borderColor: theme.border, gap: 12 }]}>
      <ThemedText type="bold">New {word}</ThemedText>
      <Field label="Name" required value={name} onChangeText={setName} />
      <Field label="Description" value={description} onChangeText={setDescription} />
      <ErrorText>{error}</ErrorText>
      <View style={styles.actions}>
        <Button title={`Create ${word}`} small onPress={create} loading={busy} disabled={!name.trim()} />
        <Button title="Cancel" variant="plain" small onPress={() => setOpen(false)} disabled={busy} />
      </View>
    </View>
  );
}
