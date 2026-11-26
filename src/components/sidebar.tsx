import { Link, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TextButton } from '@/components/ui';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';

const MARKS: ThemeColor[] = ['lavender', 'mint', 'sky', 'butter'];

/** Folding tree: Projects > each project > its groups > their teams, then "You". */
export function Sidebar() {
  const theme = useTheme();
  const { profile, signOut } = useAuth();
  const { companies, projects, subgroups, loading } = useWorkspace();
  const [folded, setFolded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setFolded((f) => ({ ...f, [id]: !f[id] }));
  const foldable = [...projects.map((p) => p.id), ...subgroups.filter((s) => !s.parent_id).map((s) => s.id)];
  const setAll = (value: boolean) => setFolded(Object.fromEntries(foldable.map((id) => [id, value])));

  return (
    <ScrollView
      style={{ backgroundColor: theme.backgroundElement }}
      contentContainerStyle={styles.content}>
      <Row href="/" label="Home" depth={0} bold />

      <View style={styles.sectionHeader}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          PROJECTS
        </ThemedText>
        <View style={styles.actions}>
          <TextButton title="Collapse all" onPress={() => setAll(true)} />
          <TextButton title="Expand all" onPress={() => setAll(false)} />
        </View>
      </View>

      {!loading && projects.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          No projects yet. Create one from Home.
        </ThemedText>
      )}

      {companies.map((company) => {
        const mine = projects.filter((p) => p.company_id === company.id);
        if (mine.length === 0) return null;
        return (
          <View key={company.id} style={styles.company}>
            {companies.length > 1 && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                {company.name}
              </ThemedText>
            )}
            {mine.map((project) => {
              const groups = subgroups.filter((s) => s.project_id === project.id && !s.parent_id);
              return (
                <View key={project.id}>
                  <Row
                    href={{ pathname: '/project/[id]', params: { id: project.id } }}
                    label={project.name}
                    depth={0}
                    bold
                    folded={groups.length > 0 ? !!folded[project.id] : undefined}
                    onToggle={() => toggle(project.id)}
                  />
                  {!folded[project.id] &&
                    groups.map((group, index) => {
                      const teams = subgroups.filter((s) => s.parent_id === group.id);
                      return (
                        <View key={group.id}>
                          <Row
                            href={{ pathname: '/group/[id]', params: { id: group.id } }}
                            label={group.name}
                            depth={1}
                            mark={MARKS[index % MARKS.length]}
                            folded={teams.length > 0 ? !!folded[group.id] : undefined}
                            onToggle={() => toggle(group.id)}
                          />
                          {!folded[group.id] &&
                            teams.map((team) => (
                              <Row
                                key={team.id}
                                href={{ pathname: '/group/[id]', params: { id: team.id } }}
                                label={team.name}
                                depth={2}
                              />
                            ))}
                        </View>
                      );
                    })}
                </View>
              );
            })}
          </View>
        );
      })}

      <View style={[styles.you, { borderTopColor: theme.border }]}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          YOU
        </ThemedText>
        <ThemedText type="bold">{profile?.full_name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {profile?.position} at {profile?.company_name}
        </ThemedText>
        <TextButton title="Sign out" onPress={signOut} />
      </View>
    </ScrollView>
  );
}

type RowProps = {
  href: React.ComponentProps<typeof Link>['href'];
  label: string;
  depth: 0 | 1 | 2;
  bold?: boolean;
  mark?: ThemeColor;
  /** undefined: nothing to fold. */
  folded?: boolean;
  onToggle?: () => void;
};

function Row({ href, label, depth, bold, mark, folded, onToggle }: RowProps) {
  const theme = useTheme();
  const pathname = usePathname();
  const target = typeof href === 'string' ? href : href.pathname.replace('[id]', String(href.params?.id));
  const active = pathname === target;

  return (
    <View style={[styles.row, { marginLeft: depth * 18 }]}>
      {depth > 0 && <View style={[styles.guide, { backgroundColor: theme.border }]} />}
      {folded === undefined ? (
        <View style={styles.chevron} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={folded ? `Expand ${label}` : `Collapse ${label}`}
          onPress={onToggle}
          hitSlop={8}
          style={styles.chevron}>
          <ThemedText themeColor="textSecondary">{folded ? '▸' : '▾'}</ThemedText>
        </Pressable>
      )}
      <Link href={href} asChild>
        <Pressable
          accessibilityRole="link"
          style={({ pressed }) => [
            styles.link,
            { backgroundColor: active || pressed ? theme.backgroundSelected : 'transparent' },
          ]}>
          {mark && <View style={[styles.mark, { backgroundColor: theme[mark], borderColor: theme.border }]} />}
          <ThemedText type={bold || active ? 'bold' : 'default'} numberOfLines={1} style={styles.label}>
            {label}
          </ThemedText>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.one },
  sectionHeader: { marginTop: Spacing.three, gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.three },
  company: { gap: Spacing.one },
  note: { paddingVertical: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 46 },
  guide: { width: 2, alignSelf: 'stretch', marginRight: Spacing.one, borderRadius: 1 },
  chevron: { width: 26, alignItems: 'center', justifyContent: 'center' },
  link: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: 12,
  },
  mark: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
  label: { flex: 1 },
  you: { marginTop: Spacing.four, paddingTop: Spacing.three, borderTopWidth: 1, gap: Spacing.one },
});
