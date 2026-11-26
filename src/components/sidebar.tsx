import { Link, useGlobalSearchParams, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { markOf } from '@/components/space/overview';
import { GROUP_TABS, PROJECT_TABS, TEAM_TABS } from '@/components/space/space';
import { Avatar, Icon, type IconName, TextButton } from '@/components/ui';
import { Spacing, type ThemeColor, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';

const ICONS: Record<string, IconName> = {
  Overview: 'grid',
  Chat: 'message-square',
  Tasks: 'list',
  Schedule: 'calendar',
  'Questions & solutions': 'help-circle',
  Training: 'book-open',
  'Media, links, docs': 'image',
  People: 'users',
};
// The list of groups and teams is the menu itself, so those two tabs are left out here.
const sections = (tabs: string[]) => tabs.filter((tab) => tab !== 'Groups' && tab !== 'Teams');
const CHAT_PARTS = ['Chat', 'Media, links, docs', 'People', 'Schedule'];

/** Folding tree: each company > its projects > their sections and groups > teams, then "You". */
export function Sidebar() {
  const theme = useTheme();
  const { profile, signOut } = useAuth();
  const { companies, projects, subgroups, adminSubgroups, loading } = useWorkspace();
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ tab?: string }>();

  const toggle = (id: string) => setFolded((f) => ({ ...f, [id]: !f[id] }));
  const foldable = [
    ...companies.map((c) => c.id),
    ...projects.map((p) => p.id),
    ...subgroups.filter((s) => !s.parent_id).map((s) => s.id),
  ];
  const setAll = (value: boolean) => setFolded(Object.fromEntries(foldable.map((id) => [id, value])));
  const anyOpen = foldable.some((id) => !folded[id]);

  // The project being looked at, also when a group or team inside it is open.
  const openGroup = subgroups.find((s) => pathname === `/group/${s.id}`);
  const activeProject = openGroup?.project_id ?? projects.find((p) => pathname === `/project/${p.id}`)?.id;
  const currentTab = typeof params.tab === 'string' ? params.tab : 'Overview';
  const projectHasTeams = (id: string) => subgroups.some((s) => s.project_id === id && s.parent_id);
  // In the simple layout Tasks opens from Overview, and media, people and schedule sit inside Chat.
  const leafActive = (tab: string, simple: boolean) =>
    simple
      ? tab === 'Chat'
        ? CHAT_PARTS.includes(currentTab)
        : tab === 'Overview'
          ? currentTab === 'Overview' || currentTab === 'Tasks'
          : currentTab === tab
      : currentTab === tab;

  return (
    <ScrollView style={{ backgroundColor: theme.rail }} contentContainerStyle={styles.content}>
      <Row href="/" label="All projects" icon="grid" depth={0} active={pathname === '/'} />

      <View style={styles.sectionHeader}>
        <ThemedText type="label">Projects</ThemedText>
        {foldable.length > 0 && (
          <TextButton title={anyOpen ? 'Collapse all' : 'Expand all'} onPress={() => setAll(anyOpen)} />
        )}
      </View>

      {!loading && companies.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          No projects yet. Create one from All projects.
        </ThemedText>
      )}

      {companies.map((company) => {
        const mine = projects.filter((p) => p.company_id === company.id);
        const closed = !!folded[company.id];
        return (
          <View key={company.id} style={styles.company}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closed ? `Expand ${company.name}` : `Collapse ${company.name}`}
              onPress={() => toggle(company.id)}
              style={({ pressed }) => [styles.companyHeader, { opacity: pressed ? 0.7 : 1 }]}>
              <View style={[styles.logo, { backgroundColor: theme.primary }]}>
                <ThemedText style={{ color: theme.onPrimary, fontFamily: Type.headBold, fontSize: 17 }}>
                  {company.name.trim()[0]?.toUpperCase() ?? '?'}
                </ThemedText>
              </View>
              <View style={styles.grow}>
                <ThemedText type="heading" numberOfLines={1}>
                  {company.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Company space
                </ThemedText>
              </View>
              <Icon name={closed ? 'chevron-right' : 'chevron-down'} size={20} />
            </Pressable>

            {!closed && mine.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                No projects here yet. Create one from All projects.
              </ThemedText>
            )}
            {(closed ? [] : mine).map((project) => {
              const groups = subgroups.filter((s) => s.project_id === project.id && !s.parent_id);
              const isActive = project.id === activeProject;
              const projectPath = `/project/${project.id}`;
              return (
                <View key={project.id}>
                  <Row
                    href={{ pathname: '/project/[id]', params: { id: project.id } }}
                    label={project.name}
                    icon="folder"
                    depth={0}
                    bold
                    active={false}
                    folded={!!folded[project.id]}
                    onToggle={() => toggle(project.id)}
                  />
                  {!folded[project.id] && (
                    <View style={[styles.branch, { borderLeftColor: theme.border }]}>
                      {isActive &&
                        sections(PROJECT_TABS).map((tab) => (
                          <Row
                            key={tab}
                            href={{ pathname: '/project/[id]', params: { id: project.id, tab } }}
                            label={tab === 'Chat' ? 'Group chat' : tab}
                            icon={ICONS[tab]}
                            depth={0}
                            active={pathname === projectPath && currentTab === tab}
                          />
                        ))}
                      {isActive && groups.length > 0 && <View style={styles.gap} />}
                      {groups.map((group) => {
                        const teams = subgroups.filter((s) => s.parent_id === group.id);
                        const groupHere = pathname === `/group/${group.id}`;
                        const teamHere = teams.some((t) => pathname === `/group/${t.id}`);
                        const groupSimple = !projectHasTeams(project.id);
                        const open = folded[group.id] === undefined ? groupHere || teamHere : !folded[group.id];
                        return (
                          <View key={group.id}>
                            <Row
                              href={{ pathname: '/group/[id]', params: { id: group.id } }}
                              label={group.name}
                              depth={0}
                              mark={markOf(subgroups, group)}
                              active={groupHere}
                              folded={!open}
                              onToggle={() => setFolded((f) => ({ ...f, [group.id]: open }))}
                            />
                            {open && (
                              <View style={[styles.branch, { borderLeftColor: theme.border }]}>
                                {groupHere &&
                                  sections(groupSimple ? TEAM_TABS : GROUP_TABS).map((tab) => (
                                    <Row
                                      key={tab}
                                      href={{ pathname: '/group/[id]', params: { id: group.id, tab } }}
                                      label={tab}
                                      icon={ICONS[tab]}
                                      depth={0}
                                      small
                                      active={leafActive(tab, groupSimple)}
                                    />
                                  ))}
                                {groupHere && teams.length > 0 && <View style={styles.gap} />}
                                {teams.map((team) => {
                                  const here = pathname === `/group/${team.id}`;
                                  return (
                                    <View key={team.id}>
                                      <Row
                                        href={{ pathname: '/group/[id]', params: { id: team.id } }}
                                        label={team.name}
                                        depth={0}
                                        small
                                        mark={markOf(subgroups, team)}
                                        active={here}
                                      />
                                      {here && (
                                        <View style={[styles.branch, { borderLeftColor: theme.border }]}>
                                          {TEAM_TABS.map((tab) => (
                                            <Row
                                              key={tab}
                                              href={{ pathname: '/group/[id]', params: { id: team.id, tab } }}
                                              label={tab}
                                              icon={ICONS[tab]}
                                              depth={0}
                                              small
                                              active={leafActive(tab, true)}
                                            />
                                          ))}
                                        </View>
                                      )}
                                    </View>
                                  );
                                })}
                                {!groupSimple && (project.myRole === 'admin' || adminSubgroups.includes(group.id)) && (
                                  <Row
                                    href={{ pathname: '/group/[id]', params: { id: group.id, tab: 'Teams' } }}
                                    label="New team"
                                    icon="plus"
                                    depth={0}
                                    small
                                    active={false}
                                  />
                                )}
                              </View>
                            )}
                          </View>
                        );
                      })}
                      {project.myRole === 'admin' && (
                        <Row
                          href={{ pathname: '/project/[id]', params: { id: project.id, tab: 'Groups' } }}
                          label="New group"
                          icon="plus"
                          depth={0}
                          active={pathname === projectPath && currentTab === 'Groups'}
                        />
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}

      <View style={[styles.you, { borderTopColor: theme.border }]}>
        <ThemedText type="label">You</ThemedText>
        <View style={styles.person}>
          <Avatar name={profile?.full_name} />
          <View style={styles.grow}>
            <ThemedText type="bold" numberOfLines={1}>
              {profile?.full_name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {profile?.position} at {profile?.company_name}
            </ThemedText>
          </View>
        </View>
        <Row href="/profile" label="Profile" icon="user" depth={0} active={pathname === '/profile'} />
        <Row href="/settings" label="Settings" icon="settings" depth={0} active={pathname === '/settings'} />
        <TextButton title="Sign out" onPress={signOut} />
      </View>
    </ScrollView>
  );
}

/** The closed menu on wide screens: a thin strip of icons that still shows what is there. */
export function MiniRail({ onOpen }: { onOpen: () => void }) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { companies, projects, subgroups } = useWorkspace();
  const pathname = usePathname();
  const openGroup = subgroups.find((s) => pathname === `/group/${s.id}`);
  const openParent = openGroup?.parent_id ?? openGroup?.id;
  const activeProject = openGroup?.project_id ?? projects.find((p) => pathname === `/project/${p.id}`)?.id;

  const box = (active: boolean) => [styles.miniBox, active && [styles.active, { backgroundColor: theme.card }]];

  return (
    <ScrollView style={{ backgroundColor: theme.rail }} contentContainerStyle={styles.mini}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open menu" onPress={onOpen} style={styles.miniBox}>
        <Icon name="menu" size={22} />
      </Pressable>
      <Link href="/" asChild>
        <Pressable accessibilityRole="link" accessibilityLabel="All projects">
          <View style={box(pathname === '/')}>
            <Icon name="grid" size={22} color={pathname === '/' ? 'primary' : 'textSecondary'} />
          </View>
        </Pressable>
      </Link>

      {companies.map((company) => (
        <View key={company.id} style={[styles.miniGroup, { borderTopColor: theme.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open menu at ${company.name}`} onPress={onOpen}>
            <View style={[styles.logo, { backgroundColor: theme.primary }]}>
              <ThemedText style={{ color: theme.onPrimary, fontFamily: Type.headBold, fontSize: 17 }}>
                {company.name.trim()[0]?.toUpperCase() ?? '?'}
              </ThemedText>
            </View>
          </Pressable>
          {projects
            .filter((p) => p.company_id === company.id)
            .map((project) => {
              const active = project.id === activeProject;
              const groups = subgroups.filter((s) => s.project_id === project.id && !s.parent_id);
              return (
                <View key={project.id} style={styles.miniProject}>
                  <Link href={{ pathname: '/project/[id]', params: { id: project.id } }} asChild>
                    <Pressable accessibilityRole="link" accessibilityLabel={project.name}>
                      <View style={box(active && !openGroup)}>
                        <Icon name="folder" size={22} color={active ? 'primary' : 'textSecondary'} />
                      </View>
                    </Pressable>
                  </Link>
                  {active &&
                    groups.map((group) => (
                      <Link key={group.id} href={{ pathname: '/group/[id]', params: { id: group.id } }} asChild>
                        <Pressable accessibilityRole="link" accessibilityLabel={group.name}>
                          <View style={[styles.miniMarkBox, openParent === group.id && { backgroundColor: theme.card }]}>
                            <View style={[styles.mark, { backgroundColor: theme[markOf(subgroups, group)] }]} />
                          </View>
                        </Pressable>
                      </Link>
                    ))}
                </View>
              );
            })}
        </View>
      ))}

      <View style={[styles.miniGroup, { borderTopColor: theme.border }]}>
        <Link href="/profile" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel="Profile">
            <Avatar name={profile?.full_name} />
          </Pressable>
        </Link>
        <Link href="/settings" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel="Settings">
            <View style={[styles.miniBox, pathname === '/settings' && [styles.active, { backgroundColor: theme.card }]]}>
              <Icon name="settings" size={22} color={pathname === '/settings' ? 'primary' : 'textSecondary'} />
            </View>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}

type RowProps = {
  href: React.ComponentProps<typeof Link>['href'];
  label: string;
  depth: 0 | 1 | 2;
  icon?: IconName;
  bold?: boolean;
  small?: boolean;
  mark?: ThemeColor;
  active: boolean;
  /** undefined: nothing to fold. */
  folded?: boolean;
  onToggle?: () => void;
};

function Row({ href, label, depth, icon, bold, small, mark, active, folded, onToggle }: RowProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { marginLeft: depth * 18 }]}>
      <Link href={href} asChild>
        <Pressable accessibilityRole="link" accessibilityState={{ selected: active }} style={styles.grow}>
          {/* The row styling sits on an inner box: a link's own style is not kept on the website. */}
          <View style={[styles.link, active && [styles.active, { backgroundColor: theme.card }]]}>
            {icon && <Icon name={icon} size={20} color={active ? 'primary' : 'textSecondary'} />}
            {mark && <View style={[styles.mark, { backgroundColor: theme[mark] }]} />}
            <ThemedText
              type={small ? (active ? 'smallBold' : 'small') : bold || active || mark ? 'bold' : 'default'}
              themeColor={active ? 'primary' : bold || mark ? 'text' : 'textSecondary'}
              numberOfLines={2}
              style={styles.grow}>
              {label}
            </ThemedText>
          </View>
        </Pressable>
      </Link>
      {folded !== undefined && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={folded ? `Expand ${label}` : `Collapse ${label}`}
          onPress={onToggle}
          hitSlop={8}
          style={styles.chevron}>
          <Icon name={folded ? 'chevron-right' : 'chevron-down'} size={20} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 10, gap: 2, paddingBottom: Spacing.five },
  grow: { flex: 1, minWidth: 0 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
    paddingHorizontal: 12,
  },
  company: { gap: 2, marginTop: Spacing.two },
  companyHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  logo: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  note: { paddingVertical: Spacing.one, paddingHorizontal: 12 },
  branch: { marginLeft: 22, paddingLeft: 6, borderLeftWidth: 2, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 46 },
  chevron: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  active: { boxShadow: '0 1px 4px rgba(120, 60, 30, 0.08)' },
  mark: { width: 14, height: 14, borderRadius: 4 },
  gap: { height: 8 },
  mini: { alignItems: 'center', paddingVertical: 10, gap: 6, paddingBottom: Spacing.five },
  miniBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  miniGroup: { alignItems: 'center', gap: 6, paddingTop: 10, marginTop: 4, borderTopWidth: 1, alignSelf: 'stretch' },
  miniProject: { alignItems: 'center', gap: 2 },
  miniMarkBox: { width: 34, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  you: { marginTop: Spacing.four, paddingTop: Spacing.three, paddingHorizontal: 12, borderTopWidth: 1, gap: Spacing.two },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
