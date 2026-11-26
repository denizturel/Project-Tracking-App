import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Sidebar } from '@/components/sidebar';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ErrorText, Field, Icon, TextButton } from '@/components/ui';
import { Spacing, type ThemeColor, WideContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';
import { type CompanyNode, useWorkspace, WIDE_SCREEN } from '@/lib/workspace';

type MilestoneRow = { project_id: string; done: boolean };
type TaskRow = { id: string; project_id: string; title: string; due_date: string | null };
type SolvedRow = { id: string; project_id: string; title: string };
type MemberRow = { project_id: string };

const TINTS: ThemeColor[] = ['backgroundSelected', 'lavender', 'sky', 'mint', 'butter'];
const shortDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Home: every project as a card, with what is coming up next to them. */
export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { companies, projects, subgroups, loading, error } = useWorkspace();
  const width = useWindowDimensions().width;
  const wide = width >= WIDE_SCREEN;
  const twoColumns = width >= 1240;
  const [creating, setCreating] = useState(false);

  const adminOf = companies.filter((c) => c.role === 'owner' || c.role === 'admin');
  const key = projects.map((p) => p.id).join(',');

  const milestones = useRows<MilestoneRow>(key, () =>
    supabase.from('milestones').select('project_id, done').returns<MilestoneRow[]>(),
  );
  const tasks = useRows<TaskRow>(key, () =>
    supabase
      .from('tasks')
      .select('id, project_id, title, due_date')
      .is('completed_at', null)
      .not('due_date', 'is', null)
      .order('due_date')
      .limit(5)
      .returns<TaskRow[]>(),
  );
  const solved = useRows<SolvedRow>(key, () =>
    supabase
      .from('questions')
      .select('id, project_id, title')
      .eq('status', 'solved')
      .order('created_at', { ascending: false })
      .limit(4)
      .returns<SolvedRow[]>(),
  );
  const members = useRows<MemberRow>(key, () =>
    supabase.from('project_members').select('project_id').returns<MemberRow[]>(),
  );

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '';
  const open = (id: string, tab?: string) =>
    router.push({ pathname: '/project/[id]', params: tab ? { id, tab } : { id } });

  const side = (
    <>
      <Card>
        <ThemedText type="label">Coming up</ThemedText>
        {tasks.rows.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Open tasks with a due date will be listed here.
          </ThemedText>
        )}
        {tasks.rows.map((task, index) => (
          <Pressable
            key={task.id}
            accessibilityRole="button"
            onPress={() => open(task.project_id, 'Tasks')}
            style={[styles.line, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
            <Chip text={shortDate(task.due_date as string)} tone="sky" />
            <View style={styles.grow}>
              <ThemedText type="bold" numberOfLines={2}>
                {task.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {projectName(task.project_id)}
              </ThemedText>
            </View>
          </Pressable>
        ))}
      </Card>
      <Card>
        <ThemedText type="label">Latest solutions</ThemedText>
        {solved.rows.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Solved questions will be listed here.
          </ThemedText>
        )}
        {solved.rows.map((question, index) => (
          <Pressable
            key={question.id}
            accessibilityRole="button"
            onPress={() => open(question.project_id, 'Questions & solutions')}
            style={[styles.line, styles.top, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
            <Icon name="check-circle" color="ok" />
            <View style={styles.grow}>
              <ThemedText type="bold">{question.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {projectName(question.project_id)}
              </ThemedText>
            </View>
          </Pressable>
        ))}
      </Card>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {wide && (
        <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <View style={styles.grow}>
            <ThemedText type="subtitle">Projects</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {companies.length > 0
                ? `${companies.map((c) => c.name).join(', ')} company space${companies.length === 1 ? '' : 's'}`
                : 'No company space yet'}
            </ThemedText>
          </View>
          {adminOf.length > 0 && <Button title="New project" icon="plus" inline onPress={() => setCreating(true)} />}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.page, twoColumns && styles.columns]}>
          <View style={[styles.stack, twoColumns && styles.grow]}>
            <ErrorText>{error}</ErrorText>
            {loading && <ActivityIndicator color={theme.primary} size="large" />}

            {!wide && adminOf.length > 0 && !creating && (
              <Button title="New project" icon="plus" onPress={() => setCreating(true)} />
            )}
            {creating && <NewProject companies={adminOf} onClose={() => setCreating(false)} />}

            {companies.map((company) => {
              const mine = projects.filter((p) => p.company_id === company.id);
              return (
                <View key={company.id} style={styles.stack}>
                  {companies.length > 1 && <ThemedText type="label">{company.name}</ThemedText>}
                  {mine.length === 0 && (
                    <Card tint="backgroundElement">
                      <ThemedText themeColor="textSecondary">
                        No projects in {company.name} yet.
                        {adminOf.includes(company) ? ' Use "New project" to start the first one.' : ''}
                      </ThemedText>
                    </Card>
                  )}
                  <View style={styles.grid}>
                    {mine.map((project) => {
                      const index = projects.indexOf(project);
                      const steps = milestones.rows.filter((m) => m.project_id === project.id);
                      const percent = steps.length
                        ? Math.round((steps.filter((m) => m.done).length / steps.length) * 100)
                        : null;
                      const groups = subgroups.filter((s) => s.project_id === project.id && !s.parent_id).length;
                      const people = members.rows.filter((m) => m.project_id === project.id).length;
                      return (
                        <Pressable
                          key={project.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${project.name}`}
                          onPress={() => open(project.id)}
                          style={({ pressed }) => [
                            styles.project,
                            {
                              backgroundColor: theme[TINTS[index % TINTS.length]],
                              borderColor: theme.border,
                              opacity: pressed ? 0.85 : 1,
                            },
                          ]}>
                          <View style={[styles.folder, { backgroundColor: theme.card }]}>
                            <Icon name="folder" color="primary" />
                          </View>
                          <ThemedText type="heading" style={styles.projectName} numberOfLines={3}>
                            {project.name}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {[groups > 0 ? count(groups, 'group') : 'No groups yet', people > 0 ? count(people, 'person').replace('persons', 'people') : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </ThemedText>
                          <View style={styles.progress}>
                            <View style={[styles.bar, { backgroundColor: theme.card }]}>
                              <View style={[styles.barFill, { backgroundColor: theme.primary, width: `${percent ?? 0}%` }]} />
                            </View>
                            <ThemedText type="smallBold">{percent === null ? 'No schedule' : `${percent}%`}</ThemedText>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            {!twoColumns && projects.length > 0 && side}

            {!loading && <JoinWithCode />}
            <View style={styles.manage}>
              {adminOf.map((company) => (
                <CompanyPeople key={company.id} company={company} />
              ))}
              {!loading && <NewCompany first={companies.length === 0} />}
            </View>

            {!wide && (
              <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: theme.border }}>
                <Sidebar />
              </View>
            )}
          </View>
          {twoColumns && <View style={[styles.stack, styles.sideColumn]}>{side}</View>}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  scroll: { padding: 16, paddingBottom: 48 },
  page: { width: '100%', maxWidth: WideContentWidth, alignSelf: 'center' },
  columns: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  stack: { gap: 18, minWidth: 0 },
  sideColumn: { width: 340 },
  grow: { flex: 1, minWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  project: {
    flexGrow: 1,
    flexBasis: 280,
    maxWidth: 420,
    minHeight: 200,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    gap: 6,
    boxShadow: '0 2px 10px rgba(150, 80, 40, 0.05)',
  },
  folder: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  projectName: { fontSize: 20, lineHeight: 28 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 'auto', paddingTop: 12 },
  bar: { flex: 1, height: 8, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 999 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  top: { alignItems: 'flex-start' },
  manage: { gap: 12 },
  pick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

type CompanyPerson = {
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
  profile: { full_name: string; position: string | null } | null;
};

const ROLE_WORDS = { owner: 'Owner', admin: 'Company admin', member: 'Member', guest: 'Guest' };

/** Who is in the company space. Owners and company admins choose the company admins. */
function CompanyPeople({ company }: { company: CompanyNode }) {
  const { session } = useAuth();
  const me = session?.user.id;
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const { rows, error, reload } = useRows<CompanyPerson>(company.id, () =>
    supabase
      .from('company_members')
      .select('user_id, role, profile:profiles!user_id(full_name, position)')
      .eq('company_id', company.id)
      .returns<CompanyPerson[]>(),
  );

  if (!open) {
    return (
      <Button
        title={`People and admins of ${company.name}`}
        icon="users"
        variant="secondary"
        onPress={() => setOpen(true)}
      />
    );
  }

  async function setRole(userId: string, role: 'admin' | 'member') {
    const result = await supabase
      .from('company_members')
      .update({ role })
      .eq('company_id', company.id)
      .eq('user_id', userId);
    setFailed(result.error?.message ?? null);
    reload();
  }

  const people = [...rows].sort((a, b) => (a.profile?.full_name ?? '').localeCompare(b.profile?.full_name ?? ''));

  return (
    <Card tint="lavender">
      <ThemedText type="subtitle">People of {company.name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Company admins can see and manage every project, group and team of this company and create new
        projects. Guests see only the projects they were added to.
      </ThemedText>
      <ErrorText>{failed ?? error}</ErrorText>
      {people.map((person) => (
        <View key={person.user_id} style={{ gap: Spacing.half }}>
          <ThemedText type="bold">
            {person.profile?.full_name ?? 'Unknown'}
            {person.user_id === me ? ' (you)' : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {[person.profile?.position, ROLE_WORDS[person.role]].filter(Boolean).join(' · ')}
          </ThemedText>
          {person.user_id !== me && person.role !== 'owner' && (
            <TextButton
              title={person.role === 'admin' ? 'Remove company admin rights' : 'Make company admin'}
              onPress={() => setRole(person.user_id, person.role === 'admin' ? 'member' : 'admin')}
            />
          )}
        </View>
      ))}
      <Button title="Close" variant="plain" onPress={() => setOpen(false)} />
    </Card>
  );
}

function NewProject({ companies, onClose }: { companies: CompanyNode[]; onClose: () => void }) {
  const router = useRouter();
  const theme = useTheme();
  const { reload } = useWorkspace();
  const [companyId, setCompanyId] = useState(companies[0]?.id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const { data, error: failed } = await supabase
      .from('projects')
      .insert({ company_id: companyId, name: name.trim(), description: description.trim() || null })
      .select('id')
      .single();
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    reload();
    onClose();
    // Straight into the new project's workspace.
    router.push({ pathname: '/project/[id]', params: { id: data.id } });
  }

  return (
    <Card>
      <ThemedText type="subtitle">New project</ThemedText>
      {companies.length > 1 && (
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Company space
          </ThemedText>
          <View style={styles.pick}>
            {companies.map((company) => (
              <Pressable
                key={company.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: company.id === companyId }}
                onPress={() => setCompanyId(company.id)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: company.id === companyId ? theme.primary : theme.border,
                  backgroundColor: company.id === companyId ? theme.backgroundSelected : theme.card,
                }}>
                <ThemedText type="bold">{company.name}</ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <Field label="Project name" required value={name} onChangeText={setName} />
      <Field label="Description" value={description} onChangeText={setDescription} multiline />
      <ErrorText>{error}</ErrorText>
      <Button title="Create project" onPress={create} loading={busy} disabled={!name.trim() || !companyId} />
      <Button title="Cancel" variant="plain" onPress={onClose} disabled={busy} />
    </Card>
  );
}

function JoinWithCode() {
  const router = useRouter();
  const { reload } = useWorkspace();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase.rpc('accept_invitation', { invite_token: code.trim() });
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    setCode('');
    reload();
    router.replace('/');
  }

  return (
    <Card tint="sky">
      <ThemedText type="subtitle">Have an invitation code?</ThemedText>
      <ThemedText themeColor="textSecondary">
        An admin can invite your email address to a project and send you a code. Paste it here.
      </ThemedText>
      <Field label="Invitation code" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} />
      <ErrorText>{error}</ErrorText>
      <Button title="Join" variant="secondary" onPress={join} loading={busy} disabled={code.trim().length < 8} />
    </Card>
  );
}

function NewCompany({ first }: { first: boolean }) {
  const { reload } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase.from('companies').insert({ name: name.trim() });
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    setName('');
    setOpen(false);
    reload();
  }

  if (!open && !first) {
    return (
      <Button title="Create another company space" icon="briefcase" variant="secondary" onPress={() => setOpen(true)} />
    );
  }

  return (
    <Card tint="butter">
      <ThemedText type="subtitle">{first ? 'Start your company space' : 'New company space'}</ThemedText>
      <ThemedText themeColor="textSecondary">
        {first
          ? 'Create a space for your company and you become its owner. Then you can create its first project.'
          : 'A separate, closed space with its own people and projects.'}
      </ThemedText>
      <Field label="Company name" required value={name} onChangeText={setName} />
      <ErrorText>{error}</ErrorText>
      <Button title="Create company space" onPress={create} loading={busy} disabled={!name.trim()} />
      {!first && <Button title="Cancel" variant="plain" onPress={() => setOpen(false)} disabled={busy} />}
    </Card>
  );
}
