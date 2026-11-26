import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chat } from '@/components/space/chat';
import { Overview } from '@/components/space/overview';
import { People } from '@/components/space/people';
import { Questions } from '@/components/space/questions';
import { Schedule } from '@/components/space/schedule';
import { Tasks } from '@/components/space/tasks';
import { Training } from '@/components/space/training';
import { ThemedText } from '@/components/themed-text';
import { ComingNext, ErrorText } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type ProjectNode, type SubgroupNode, useWorkspace } from '@/lib/workspace';

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
};

const FULL_TABS = ['Overview', 'Chat', 'Tasks', 'Schedule', 'Questions & solutions', 'Training', 'Media, links, docs', 'People'];
// Teams are kept simple: media, people and schedule live inside Chat (decided by Deniz).
const TEAM_TABS = ['Overview', 'Chat', 'Questions & solutions', 'Training'];
const TEAM_CHAT_TABS = ['Messages', 'Media, links, docs', 'People', 'Schedule'];

export function Space(props: { projectId: string } | { subgroupId: string }) {
  const theme = useTheme();
  const { projects, subgroups, adminSubgroups, loading, error } = useWorkspace();
  const [tab, setTab] = useState('Overview');
  const [chatTab, setChatTab] = useState('Messages');

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
  const info: SpaceInfo = {
    level: !subgroup ? 'project' : subgroup.parent_id ? 'team' : 'group',
    project,
    subgroup,
    parent,
    isAdmin:
      project.myRole === 'admin' ||
      (!!subgroup && (adminSubgroups.includes(subgroup.id) || adminSubgroups.includes(subgroup.parent_id ?? ''))),
    isProjectAdmin: project.myRole === 'admin',
  };
  const name = subgroup?.name ?? project.name;
  // A project that has groups but no teams anywhere (for example one single hotel
  // and its departments) uses the simple layout for its groups (decided by Deniz).
  const projectHasTeams = subgroups.some((s) => s.project_id === project.id && s.parent_id);
  const simple = info.level === 'team' || (info.level === 'group' && !projectHasTeams);
  const tabs = simple ? TEAM_TABS : FULL_TABS;
  const shownTab = tabs.includes(tab) ? tab : 'Overview';
  const inner = shownTab === 'Chat' && simple ? chatTab : shownTab === 'Chat' ? 'Messages' : shownTab;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: name }} />

      <View style={styles.top}>
        <View style={styles.crumbs}>
          <Crumb label={project.name} href={{ pathname: '/project/[id]', params: { id: project.id } }} last={!subgroup} />
          {parent && <Crumb label={parent.name} href={{ pathname: '/group/[id]', params: { id: parent.id } }} />}
          {subgroup && <Crumb label={subgroup.name} last />}
        </View>
        <TabBar tabs={tabs} value={shownTab} onChange={setTab} />
        {shownTab === 'Chat' && simple && (
          <TabBar tabs={TEAM_CHAT_TABS} value={chatTab} onChange={setChatTab} small />
        )}
      </View>

      {inner === 'Messages' ? (
        <Chat info={info} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            {inner === 'Overview' && <Overview info={info} />}
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

function Crumb(props: { label: string; href?: React.ComponentProps<typeof Link>['href']; last?: boolean }) {
  return (
    <View style={styles.crumb}>
      {props.href && !props.last ? (
        <Link href={props.href}>
          <ThemedText type="link">{props.label}</ThemedText>
        </Link>
      ) : (
        <ThemedText type="bold">{props.label}</ThemedText>
      )}
      {!props.last && <ThemedText themeColor="textSecondary">›</ThemedText>}
    </View>
  );
}

function TabBar(props: { tabs: string[]; value: string; onChange: (tab: string) => void; small?: boolean }) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {props.tabs.map((tab) => {
        const active = tab === props.value;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => props.onChange(tab)}
            style={[
              styles.tab,
              props.small && styles.tabSmall,
              { backgroundColor: active ? theme.primary : theme.backgroundElement },
            ]}>
            <ThemedText type={props.small ? 'smallBold' : 'bold'} style={{ color: active ? theme.onPrimary : theme.text }}>
              {tab}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  top: { paddingTop: Spacing.three, gap: Spacing.two },
  crumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, paddingHorizontal: Spacing.three },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tabs: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  tab: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 999 },
  tabSmall: { paddingVertical: Spacing.one },
  scroll: { padding: Spacing.three, alignItems: 'center' },
  column: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
});
