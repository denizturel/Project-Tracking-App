import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Chat } from '@/components/space/chat';
import { Overview, Places } from '@/components/space/overview';
import { People } from '@/components/space/people';
import { Questions } from '@/components/space/questions';
import { Schedule } from '@/components/space/schedule';
import { Tasks } from '@/components/space/tasks';
import { Training } from '@/components/space/training';
import { ThemedText } from '@/components/themed-text';
import { Button, ComingNext, ErrorText, Icon, type IconName, Pill, type Tone } from '@/components/ui';
import { MaxContentWidth, Spacing, WideContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';
import { type ProjectNode, type SubgroupNode, useWorkspace, WIDE_SCREEN } from '@/lib/workspace';

/** What a tab needs to know about where it is. */
export type SpaceInfo = {
  level: 'project' | 'group' | 'team';
  project: ProjectNode;
  /** The group or team itself; null at project level. */
  subgroup: SubgroupNode | null;
  /** The group a team sits in. */
  parent: SubgroupNode | null;
  /** May manage this page: a project admin, or the own admin of this group or team (or of its group). */
  isAdmin: boolean;
  /** Admin of the whole project (includes company owners and admins). */
  isProjectAdmin: boolean;
  /** Simple layout: a team, or a group in a project that has no teams. */
  simple: boolean;
};

// As in the prototype: a project lists its groups, a group lists its teams, and
// teams are kept simple, with media, people and schedule inside Chat (decided by Deniz).
export const PROJECT_TABS = ['Overview', 'Chat', 'Groups', 'Tasks', 'Questions & solutions', 'Training', 'Media, links, docs', 'People'];
export const GROUP_TABS = ['Overview', 'Teams', 'Chat', 'Tasks', 'Schedule', 'Questions & solutions', 'Training', 'Media, links, docs', 'People'];
export const TEAM_TABS = ['Overview', 'Chat', 'Questions & solutions', 'Training'];
const TEAM_CHAT_TABS: { tab: string; label: string; icon: IconName }[] = [
  { tab: 'Chat', label: 'Messages', icon: 'message-square' },
  { tab: 'Media, links, docs', label: 'Media, links, docs', icon: 'image' },
  { tab: 'People', label: 'People', icon: 'users' },
  { tab: 'Schedule', label: 'Schedule', icon: 'calendar' },
];
const EVERY_TAB = [...GROUP_TABS, 'Groups'];

type OpenRow = { subgroup_id: string | null };

export function Space(props: { projectId: string } | { subgroupId: string }) {
  const theme = useTheme();
  const { companies, projects, subgroups, adminSubgroups, loading, error } = useWorkspace();
  const router = useRouter();
  const wide = useWindowDimensions().width >= WIDE_SCREEN;
  // The open section is part of the address, so the side menu can link straight to it.
  const params = useLocalSearchParams<{ tab?: string }>();
  const tab = typeof params.tab === 'string' && EVERY_TAB.includes(params.tab) ? params.tab : 'Overview';
  const setTab = (next: string) => router.setParams({ tab: next, edit: undefined });

  const subgroup = 'subgroupId' in props ? (subgroups.find((s) => s.id === props.subgroupId) ?? null) : null;
  const projectId = 'projectId' in props ? props.projectId : subgroup?.project_id;
  const project = projects.find((p) => p.id === projectId);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  if (!project || ('subgroupId' in props && !subgroup)) {
    return (
      <View style={styles.centered}>
        <ErrorText>{error ?? 'This does not exist, or you have not been added to it.'}</ErrorText>
      </View>
    );
  }

  const parent = subgroup?.parent_id ? (subgroups.find((s) => s.id === subgroup.parent_id) ?? null) : null;
  const level = !subgroup ? 'project' : subgroup.parent_id ? 'team' : 'group';
  // A project that has groups but no teams anywhere (for example one single hotel
  // and its departments) uses the simple layout for its groups (decided by Deniz).
  const projectHasTeams = subgroups.some((s) => s.project_id === project.id && s.parent_id);
  const simple = level === 'team' || (level === 'group' && !projectHasTeams);
  const info: SpaceInfo = {
    level,
    project,
    subgroup,
    parent,
    isAdmin:
      project.myRole === 'admin' ||
      (!!subgroup && (adminSubgroups.includes(subgroup.id) || adminSubgroups.includes(subgroup.parent_id ?? ''))),
    isProjectAdmin: project.myRole === 'admin',
    simple,
  };
  const name = subgroup?.name ?? project.name;
  const tabs = level === 'project' ? PROJECT_TABS : simple ? TEAM_TABS : GROUP_TABS;
  // In the simple layout Tasks opens from Overview, and media, people and schedule sit inside Chat.
  const inChat = simple && TEAM_CHAT_TABS.some((t) => t.tab === tab);
  const inner =
    tab === 'Schedule' && level === 'project' ? 'Overview' : !simple && !tabs.includes(tab) ? 'Overview' : tab;
  const shownTab = inChat ? 'Chat' : simple && inner === 'Tasks' ? 'Overview' : inner;

  return (
    <SpaceBody
      info={info}
      name={name}
      company={companies.find((c) => c.id === project.company_id)?.name ?? 'Projects'}
      tabs={tabs}
      shownTab={shownTab}
      inner={inner}
      inChat={inChat}
      setTab={setTab}
      wide={wide}
    />
  );
}

type BodyProps = {
  info: SpaceInfo;
  name: string;
  company: string;
  tabs: string[];
  shownTab: string;
  inner: string;
  inChat: boolean;
  setTab: (tab: string) => void;
  wide: boolean;
};

function SpaceBody({ info, name, company, tabs, shownTab, inner, inChat, setTab, wide }: BodyProps) {
  const theme = useTheme();
  const router = useRouter();
  const { subgroups } = useWorkspace();
  const { project, subgroup, parent, level, isAdmin } = info;

  const children =
    level === 'project'
      ? subgroups.filter((s) => s.project_id === project.id && !s.parent_id)
      : subgroups.filter((s) => s.parent_id === subgroup?.id);
  const tree = subgroup ? [subgroup.id, ...children.map((c) => c.id)] : null;
  const within = (rows: OpenRow[]) => rows.filter((r) => !tree || tree.includes(r.subgroup_id ?? '')).length;

  const openTasks = useRows<OpenRow>(project.id, () =>
    supabase.from('tasks').select('subgroup_id').eq('project_id', project.id).is('completed_at', null).returns<OpenRow[]>(),
  );
  const openQuestions = useRows<OpenRow>(project.id, () =>
    supabase.from('questions').select('subgroup_id').eq('project_id', project.id).neq('status', 'solved').returns<OpenRow[]>(),
  );
  const people = useRows<{ user_id: string; subgroup_id?: string }>(`${project.id}:${subgroup?.id ?? ''}:${children.length}`, () =>
    tree
      ? supabase.from('subgroup_members').select('user_id, subgroup_id').in('subgroup_id', tree).returns<{ user_id: string }[]>()
      : supabase.from('project_members').select('user_id').eq('project_id', project.id).returns<{ user_id: string }[]>(),
  );
  const peopleCount = new Set(people.rows.map((p) => p.user_id)).size;
  const taskCount = within(openTasks.rows);
  const questionCount = within(openQuestions.rows);

  const pills: Record<string, { text: string; tone?: Tone } | undefined> = {
    Groups: { text: String(children.length) },
    Teams: { text: String(children.length) },
    Tasks: taskCount ? { text: String(taskCount) } : undefined,
    'Questions & solutions': questionCount ? { text: `${questionCount} open`, tone: 'warn' } : undefined,
  };
  const labels: Record<string, string> = level === 'project' ? { Chat: 'Group chat' } : {};
  const word = level === 'team' ? 'team' : 'group';
  const subtitle =
    level === 'project'
      ? `${count(children.length, 'group')} · ${count(peopleCount, 'person', 'people')}`
      : level === 'group'
        ? `${count(children.length, 'team')} · ${count(peopleCount, 'person', 'people')}`
        : `Part of ${parent?.name ?? project.name} · ${count(peopleCount, 'person', 'people')}`;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: name }} />

      <View style={[styles.top, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={styles.headRow}>
          <View style={styles.grow}>
            <View style={styles.crumbs}>
              <Crumb label="Projects" href="/" />
              {level === 'project' && inner === 'Overview' ? (
                <Crumb label={`${company} · ${subtitle}`} last />
              ) : (
                <Crumb
                  label={project.name}
                  href={{ pathname: '/project/[id]', params: { id: project.id } }}
                                  />
              )}
              {parent && <Crumb label={parent.name} href={{ pathname: '/group/[id]', params: { id: parent.id } }} />}
              {subgroup && (wide ? <Crumb label={parent ? 'Team' : 'Group'} last /> : <Crumb label={subtitle} last />)}
              {!subgroup && inner !== 'Overview' && <Crumb label={labels[inner] ?? inner} last />}
            </View>
            {wide && (
              <ThemedText type="subtitle" style={styles.title} numberOfLines={2}>
                {level === 'project' && inner !== 'Overview' ? (labels[inner] ?? inner) : name}
              </ThemedText>
            )}
          </View>
          {subgroup && wide && (
            <View style={styles.headButtons}>
              <Button
                title={count(peopleCount, 'person', 'people')}
                icon="users"
                variant="secondary"
                small
                onPress={() => setTab('People')}
              />
              {isAdmin && (
                <Button
                  title={`Edit ${word}`}
                  icon="edit-2"
                  variant="secondary"
                  small
                  onPress={() => router.setParams({ tab: 'Overview', edit: '1' })}
                />
              )}
              {isAdmin && <Button title="Add people" icon="plus" small onPress={() => setTab('People')} />}
            </View>
          )}
        </View>
        {/* On wide screens the side menu already lists the project's sections. */}
        {!(wide && level === 'project') && (
          <TabBar tabs={tabs} labels={labels} pills={pills} value={shownTab} onChange={setTab} />
        )}
      </View>

      {inChat && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.chatNav}>
          {TEAM_CHAT_TABS.map((item) => {
            const active = item.tab === inner;
            return (
              <Pressable
                key={item.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setTab(item.tab)}
                style={[
                  styles.chatChip,
                  {
                    backgroundColor: active ? theme.backgroundSelected : theme.card,
                    borderColor: active ? theme.primary : theme.border,
                  },
                ]}>
                <Icon name={item.icon} size={16} color={active ? 'primary' : 'textSecondary'} />
                <ThemedText type="smallBold" themeColor={active ? 'primary' : 'textSecondary'}>
                  {item.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {inner === 'Chat' ? (
        <Chat info={info} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.column, WIDE_TABS.includes(inner) && wide && { maxWidth: WideContentWidth }]}>
            {inner === 'Overview' && <Overview info={info} />}
            {(inner === 'Groups' || inner === 'Teams') && <Places info={info} />}
            {inner === 'People' && <People info={info} />}
            {inner === 'Tasks' && <Tasks info={info} />}
            {inner === 'Schedule' && <Schedule info={info} />}
            {inner === 'Questions & solutions' && <Questions info={info} />}
            {inner === 'Training' && <Training info={info} />}
            {inner === 'Media, links, docs' && <ComingNext what={inner} />}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const WIDE_TABS = ['Overview', 'Groups', 'Teams', 'Schedule', 'Tasks', 'Questions & solutions', 'People'];
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Crumb(props: { label: string; href?: React.ComponentProps<typeof Link>['href']; last?: boolean }) {
  return (
    <View style={styles.crumb}>
      {props.href && !props.last ? (
        <Link href={props.href}>
          <ThemedText type="smallBold" themeColor="primary">
            {props.label}
          </ThemedText>
        </Link>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {props.label}
        </ThemedText>
      )}
      {!props.last && (
        <ThemedText type="small" themeColor="textSecondary">
          ›
        </ThemedText>
      )}
    </View>
  );
}

type TabBarProps = {
  tabs: string[];
  labels: Record<string, string>;
  pills: Record<string, { text: string; tone?: Tone } | undefined>;
  value: string;
  onChange: (tab: string) => void;
};

/** Underlined tabs with small counts, as in the prototype. */
function TabBar(props: TabBarProps) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabScroll}
      contentContainerStyle={styles.tabs}>
      {props.tabs.map((tab) => {
        const active = tab === props.value;
        const pill = props.pills[tab];
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => props.onChange(tab)}
            style={[styles.tab, { borderBottomColor: active ? theme.primary : 'transparent' }]}>
            <ThemedText type="bold" themeColor={active ? 'text' : 'textSecondary'}>
              {props.labels[tab] ?? tab}
            </ThemedText>
            {pill && <Pill text={pill.text} tone={pill.tone} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  top: { paddingTop: 12, borderBottomWidth: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: Spacing.three, paddingBottom: 8 },
  headButtons: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
  grow: { flex: 1, minWidth: 0 },
  chatNav: { gap: 8, paddingHorizontal: Spacing.three, paddingVertical: 10 },
  chatChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  crumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: Spacing.three },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { paddingHorizontal: Spacing.three, marginTop: 2 },
  tabScroll: { flexGrow: 0 },
  tabs: { gap: 4, paddingHorizontal: 10 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 3 },
  scroll: { padding: Spacing.three, alignItems: 'center' },
  column: { width: '100%', maxWidth: MaxContentWidth, gap: 18 },
});
