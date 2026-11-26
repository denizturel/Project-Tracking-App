import { Link, useGlobalSearchParams, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Icon, type IconName, TextButton } from '@/components/ui';
import { Spacing, type ThemeColor, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppLock } from '@/lib/app-lock';
import { useAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';

const MARKS: ThemeColor[] = ['primary', 'lavenderInk', 'ok', 'skyInk', 'warn'];

/** The sections of a project, shown under the project that is open. */
export const PROJECT_SECTIONS: { tab: string; icon: IconName }[] = [
  { tab: 'Overview', icon: 'grid' },
  { tab: 'Chat', icon: 'message-square' },
  { tab: 'Tasks', icon: 'check-square' },
  { tab: 'Schedule', icon: 'calendar' },
  { tab: 'Questions & solutions', icon: 'help-circle' },
  { tab: 'Training', icon: 'book-open' },
  { tab: 'Media, links, docs', icon: 'image' },
  { tab: 'People', icon: 'users' },
];

/** Folding tree: each company > its projects > their sections and groups > teams, then "You". */
export function Sidebar() {
  const theme = useTheme();
  const { profile, signOut } = useAuth();
  const lock = useAppLock();
  const [lockError, setLockError] = useState<string | null>(null);
  const { companies, projects, subgroups, loading } = useWorkspace();
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
                  {!folded[project.id] && isActive && (
                    <View style={[styles.branch, { borderLeftColor: theme.border }]}>
                      {PROJECT_SECTIONS.map((section) => (
                        <Row
                          key={section.tab}
                          href={{ pathname: '/project/[id]', params: { id: project.id, tab: section.tab } }}
                          label={section.tab}
                          icon={section.icon}
                          depth={0}
                          active={pathname === projectPath && (params.tab ?? 'Overview') === section.tab}
                        />
                      ))}
                    </View>
                  )}
                  {!folded[project.id] && (
                    <View style={[styles.branch, { borderLeftColor: theme.border }]}>
                      {groups.map((group, index) => {
                        const teams = subgroups.filter((s) => s.parent_id === group.id);
                        return (
                          <View key={group.id}>
                            <Row
                              href={{ pathname: '/group/[id]', params: { id: group.id } }}
                              label={group.name}
                              depth={0}
                              mark={MARKS[index % MARKS.length]}
                              active={pathname === `/group/${group.id}`}
                              folded={teams.length > 0 ? !!folded[group.id] : undefined}
                              onToggle={() => toggle(group.id)}
                            />
                            {!folded[group.id] && teams.length > 0 && (
                              <View style={[styles.branch, { borderLeftColor: theme.border }]}>
                                {teams.map((team) => (
                                  <Row
                                    key={team.id}
                                    href={{ pathname: '/group/[id]', params: { id: team.id } }}
                                    label={team.name}
                                    depth={0}
                                    small
                                    active={pathname === `/group/${team.id}`}
                                  />
                                ))}
                              </View>
                            )}
                          </View>
                        );
                      })}
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
        {lock.available && (
          <TextButton
            title={lock.enabled ? `Turn off ${lock.method} unlock` : `Unlock with ${lock.method}`}
            onPress={async () => setLockError(await lock.setEnabled(!lock.enabled))}
          />
        )}
        {lockError && (
          <ThemedText type="small" themeColor="danger">
            {lockError}
          </ThemedText>
        )}
        <TextButton title="Sign out" onPress={signOut} />
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
  you: { marginTop: Spacing.four, paddingTop: Spacing.three, paddingHorizontal: 12, borderTopWidth: 1, gap: Spacing.two },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
