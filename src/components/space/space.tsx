import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chat } from '@/components/space/chat';
import { Overview } from '@/components/space/overview';
import { People } from '@/components/space/people';
import { Questions } from '@/components/space/questions';
import { Schedule } from '@/components/space/schedule';
import { Tasks } from '@/components/space/tasks';
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
  isAdmin: boolean;
};

const FULL_TABS = ['Overview', 'Chat', 'Tasks', 'Schedule', 'Questions & solutions', 'Media, links, docs', 'People'];
// Teams are kept simple: media, people and schedule live inside Chat (decided by Deniz).
const TEAM_TABS = ['Overview', 'Chat', 'Questions & solutions'];
const TEAM_CHAT_TABS = ['Messages', 'Media, links, docs', 'People', 'Schedule'];

export function Space(props: { projectId: string } | { subgroupId: string }) {
  const theme = useTheme();
  const { projects, subgroups, loading, error } = useWorkspace();
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
    isAdmin: project.myRole === 'admin',
  };
  const name = subgroup?.name ?? project.name;
  const tabs = info.level === 'team' ? TEAM_TABS : FULL_TABS;
  const inner = tab === 'Chat' && info.level === 'team' ? chatTab : tab === 'Chat' ? 'Messages' : tab;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: name }} />

      <View style={styles.top}>
        <View style={styles.crumbs}>
          <Crumb label={project.name} href={{ pathname: '/project/[id]', params: { id: project.id } }} last={!subgroup} />
          {parent && <Crumb label={parent.name} href={{ pathname: '/group/[id]', params: { id: parent.id } }} />}
          {subgroup && <Crumb label={subgroup.name} last />}
        </View>
        <TabBar tabs={tabs} value={tab} onChange={setTab} />
        {tab === 'Chat' && info.level === 'team' && (
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
