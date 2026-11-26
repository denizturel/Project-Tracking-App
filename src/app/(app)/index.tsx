import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, Chip, Choices, ErrorText, Field, Icon } from '@/components/ui';
import { Spacing, type ThemeColor, WideContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';
import { type CompanyNode, useWorkspace, WIDE_SCREEN } from '@/lib/workspace';
import { locale } from '@/lib/i18n';
import { takePendingJoin, tokenFrom } from '@/lib/join-link';

type MilestoneRow = { project_id: string; done: boolean };
type TaskRow = { id: string; project_id: string; title: string; due_date: string | null };
type SolvedRow = { id: string; project_id: string; title: string };
type MemberRow = { project_id: string };

const TINTS: ThemeColor[] = ['backgroundSelected', 'lavender', 'sky', 'mint', 'butter'];
const shortDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
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

  // A project invite link or QR code that was opened before signing in finishes here.
  const [joinError, setJoinError] = useState<string | null>(null);
  const { reload: reloadWorkspace } = useWorkspace();
  useEffect(() => {
    takePendingJoin().then(async (token) => {
      if (!token) return;
      const joined = await supabase.rpc('join_project_by_link', { link_token: token });
      if (joined.error) {
        setJoinError(joined.error.message);
        return;
      }
      reloadWorkspace();
      router.push({ pathname: '/project/[id]', params: { id: joined.data as string } });
    });
    // Once, when Home opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <ErrorText>{error ?? joinError}</ErrorText>
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

            {adminOf.map((company) => (
              <JoinRequests key={company.id} company={company} />
            ))}
            {!loading && <FindCompany first={companies.length === 0} />}
            {!loading && <JoinWithCode />}
            <View style={styles.manage}>
              {adminOf.map((company) => (
                <CompanyPeople key={company.id} company={company} />
              ))}
              {!loading && <NewCompany first={companies.length === 0} />}
            </View>
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
  role: 'owner' | 'admin' | 'manager' | 'member' | 'guest';
  profile: { full_name: string; position: string | null } | null;
};

const ROLE_WORDS = { owner: 'Owner', admin: 'Company admin', manager: 'Manager', member: 'Staff', guest: 'Guest' };
const COMPANY_ROLES = [
  { value: 'admin', label: 'Company admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Staff' },
  { value: 'guest', label: 'Guest' },
] as const;

/** Who is in the company space. Only the owner changes people's company status. */
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

  async function setRole(userId: string, role: 'admin' | 'manager' | 'member' | 'guest') {
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
        The owner created the company space and is the only one who changes these statuses. Company admins
        create, edit and delete projects and are admins inside every project. Managers see every project but do
        not manage them. Staff and guests see only what they were added to.
      </ThemedText>
      <ErrorText>{failed ?? error}</ErrorText>
      {people.map((person) => (
        <View key={person.user_id} style={{ gap: Spacing.two }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={person.profile?.full_name} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <ThemedText type="bold">
                {person.profile?.full_name ?? 'Unknown'}
                {person.user_id === me ? ' (you)' : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[person.profile?.position, ROLE_WORDS[person.role]].filter(Boolean).join(' · ')}
              </ThemedText>
            </View>
          </View>
          {company.role === 'owner' && person.user_id !== me && person.role !== 'owner' && (
            <Choices options={COMPANY_ROLES} value={person.role} onChange={(role) => setRole(person.user_id, role)} />
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
    // A project's invite link (or the code inside it) lets you straight in.
    const linkToken = tokenFrom(code);
    const byLink = linkToken ? await supabase.rpc('join_project_by_link', { link_token: linkToken }) : null;
    if (byLink && !byLink.error) {
      setBusy(false);
      setCode('');
      reload();
      router.push({ pathname: '/project/[id]', params: { id: byLink.data as string } });
      return;
    }
    const { error: failed } = await supabase.rpc('accept_invitation', { invite_token: code.trim() });
    setBusy(false);
    if (failed) {
      setError(byLink?.error?.message ?? failed.message);
      return;
    }
    setCode('');
    reload();
    router.replace('/');
  }

  return (
    <Card tint="sky">
      <ThemedText type="subtitle">Have an invite link or code?</ThemedText>
      <ThemedText themeColor="textSecondary">
        Paste the invite link or code an admin gave you. On a phone you can also scan the project&apos;s QR code with
        the camera.
      </ThemedText>
      <Field label="Invite link or code" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} />
      <ErrorText>{error}</ErrorText>
      <Button title="Join" variant="secondary" onPress={join} loading={busy} disabled={code.trim().length < 8} />
    </Card>
  );
}

type Found = { id: string; name: string };
type Asked = { id: string; company_id: string; name: string; status: 'pending' | 'declined' };

/** Find your company's space by name and ask to join it. The owner or a company admin lets you in. */
function FindCompany({ first }: { first: boolean }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(profile?.company_name ?? '');
  const [found, setFound] = useState<Found[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const asked = useRows<Asked>('mine', async () => {
    const { data, error } = await supabase.rpc('my_join_requests');
    return { data: data as Asked[] | null, error };
  });

  useEffect(() => {
    let active = true;
    // Wait until the typing stops.
    const timer = setTimeout(async () => {
      const result =
        query.trim().length >= 2 ? await supabase.rpc('search_companies', { q: query }) : null;
      if (active) setFound((result?.data as Found[] | null) ?? []);
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  async function ask(company: Found) {
    const result = await supabase.from('company_join_requests').insert({ company_id: company.id });
    setFailed(result.error?.message ?? null);
    asked.reload();
  }

  const stateOf = (companyId: string) => asked.rows.find((r) => r.company_id === companyId)?.status;
  const others = asked.rows.filter((r) => !found.some((f) => f.id === r.company_id));
  const line = (id: string, name: string) => {
    const state = stateOf(id);
    return (
      <View key={id} style={styles.line}>
        <Icon name="briefcase" color="primary" />
        <ThemedText type="bold" raw style={styles.grow} numberOfLines={2}>
          {name}
        </ThemedText>
        {state === 'pending' ? (
          <Chip text="Waiting for approval" tone="warn" icon="clock" />
        ) : state === 'declined' ? (
          <Chip text="Declined" tone="plain" />
        ) : (
          <Button title="Ask to join" small variant="secondary" onPress={() => ask({ id, name })} />
        )}
      </View>
    );
  };

  // Someone who already has a company space sees a button; requests still waiting stay visible.
  if (!first && !open && asked.rows.length === 0) {
    return <Button title="Find another company" icon="search" variant="secondary" onPress={() => setOpen(true)} />;
  }

  return (
    <Card tint="mint">
      <ThemedText type="subtitle">Find your company</ThemedText>
      <ThemedText themeColor="textSecondary">
        Search for your company&apos;s space and ask to join. Its owner or a company admin lets you in.
      </ThemedText>
      <Field label="Company name" value={query} onChangeText={setQuery} autoCorrect={false} />
      <ErrorText>{failed ?? asked.error}</ErrorText>
      {found.map((company) => line(company.id, company.name))}
      {others.map((request) => line(request.company_id, request.name))}
      {query.trim().length >= 2 && found.length === 0 && others.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          No company space with this name that you are not already in.
        </ThemedText>
      )}
    </Card>
  );
}

type JoinRequest = {
  id: string;
  user_id: string;
  profile: { full_name: string; position: string | null; company_name: string | null } | null;
};

/** People who asked to join the company. The owner and company admins let them in or decline. */
function JoinRequests({ company }: { company: CompanyNode }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { rows, reload } = useRows<JoinRequest>(company.id, () =>
    supabase
      .from('company_join_requests')
      .select('id, user_id, profile:profiles!user_id(full_name, position, company_name)')
      .eq('company_id', company.id)
      .eq('status', 'pending')
      .order('created_at')
      .returns<JoinRequest[]>(),
  );

  if (rows.length === 0) return null;

  async function decide(request: string, as_role: 'member' | 'guest' | 'declined') {
    setBusy(request);
    const result = await supabase.rpc('decide_join_request', { request, as_role });
    setBusy(null);
    setFailed(result.error?.message ?? null);
    reload();
  }

  return (
    <Card tint="butter">
      <ThemedText type="subtitle">Waiting to join {company.name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Staff see the company space. Guests see only the projects they are added to.
      </ThemedText>
      <ErrorText>{failed}</ErrorText>
      {rows.map((request) => (
        <View key={request.id} style={{ gap: Spacing.two }}>
          <View style={styles.line}>
            <Avatar name={request.profile?.full_name} size={36} />
            <View style={styles.grow}>
              <ThemedText type="bold" raw>
                {request.profile?.full_name ?? ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" raw>
                {[request.profile?.position, request.profile?.company_name].filter(Boolean).join(' · ')}
              </ThemedText>
            </View>
          </View>
          <View style={styles.pick}>
            <Button title="Let in as staff" small onPress={() => decide(request.id, 'member')} disabled={busy === request.id} />
            <Button title="Let in as guest" small variant="secondary" onPress={() => decide(request.id, 'guest')} disabled={busy === request.id} />
            <Button title="Decline" small variant="plain" onPress={() => decide(request.id, 'declined')} disabled={busy === request.id} />
          </View>
        </View>
      ))}
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
