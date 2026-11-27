import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ErrorText, Field, Icon } from '@/components/ui';
import { type ThemeColor, WideContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';
import { useWorkspace, WIDE_SCREEN } from '@/lib/workspace';
import { NewProject } from '@/components/new-project';
import { locale } from '@/lib/i18n';
import { useLiveVersion } from '@/lib/live';
import { useNotifications } from '@/lib/notifications';
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

  const milestones = useRows<MilestoneRow>(`index1:${key}`, () =>
    supabase.from('milestones').select('project_id, done').returns<MilestoneRow[]>(),
  );
  const tasks = useRows<TaskRow>(`index2:${key}`, () =>
    supabase
      .from('tasks')
      .select('id, project_id, title, due_date')
      .is('completed_at', null)
      .not('due_date', 'is', null)
      .order('due_date')
      .limit(5)
      .returns<TaskRow[]>(),
  );
  const solved = useRows<SolvedRow>(`index3:${key}`, () =>
    supabase
      .from('questions')
      .select('id, project_id, title')
      .eq('status', 'solved')
      .order('created_at', { ascending: false })
      .limit(4)
      .returns<SolvedRow[]>(),
  );
  const members = useRows<MemberRow>(`index4:${key}`, () =>
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
            <CompanyInvites />

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

type MyInvite = { id: string; company_id: string; company_name: string; role: string; by_name: string | null };

/** Invitations to a company that wait for my answer. Nobody is put into a company without accepting. */
function CompanyInvites() {
  const router = useRouter();
  const { reload: reloadWorkspace } = useWorkspace();
  const { notices } = useNotifications();
  const live = useLiveVersion();
  // A new invitation arrives with a notification, so the list is asked again when one comes.
  const { rows, reload } = useRows<MyInvite>(`index5:${notices.length}:${live}`, () =>
    supabase.rpc('my_company_invites') as unknown as PromiseLike<{ data: MyInvite[] | null; error: { message: string } | null }>,
  );
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function answer(invite: MyInvite, accept: boolean) {
    setBusy(invite.id);
    const result = await supabase.rpc('respond_company_invite', { invite: invite.id, accept });
    setBusy(null);
    setFailed(result.error?.message ?? null);
    reload();
    if (result.error || !accept) return;
    reloadWorkspace();
    router.push({ pathname: '/company/[id]', params: { id: invite.company_id } });
  }

  if (rows.length === 0) return null;
  return (
    <Card tint="butter">
      <ThemedText type="subtitle">Invitations</ThemedText>
      <ErrorText>{failed}</ErrorText>
      {rows.map((invite) => (
        <View key={invite.id} style={{ gap: 10 }}>
          <ThemedText>
            {invite.role === 'guest'
              ? `${invite.by_name ?? 'Someone'} invited you to the company ${invite.company_name} as a guest`
              : `${invite.by_name ?? 'Someone'} invited you to the company ${invite.company_name}`}
          </ThemedText>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Button title="Accept" small inline onPress={() => answer(invite, true)} loading={busy === invite.id} />
            <Button title="Decline" small inline variant="plain" onPress={() => answer(invite, false)} disabled={busy === invite.id} />
          </View>
        </View>
      ))}
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
