import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { NewProject } from '@/components/new-project';
import { Suggestions } from '@/components/suggestions';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, Chip, Choices, ErrorText, Field, Icon, MoreMenu, TextButton } from '@/components/ui';
import { Spacing, WideContentWidth } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { type Suggested, useUsernameSuggestions } from '@/lib/suggest';
import { useLiveVersion } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';
import { type CompanyNode, useWorkspace } from '@/lib/workspace';

type Role = 'owner' | 'admin' | 'manager' | 'member' | 'guest';
type CompanyPerson = {
  user_id: string;
  role: Role;
  profile: { full_name: string; position: string | null; username: string | null } | null;
};
type Found = Suggested;
type OpenInvite = { id: string; user_id: string; username: string | null; full_name: string; position: string | null; role: Role };

const ROLE_WORDS: Record<Role, string> = { owner: 'Owner', admin: 'Company admin', manager: 'Manager', member: 'Staff', guest: 'Guest' };
const COMPANY_ROLES = [
  { value: 'admin', label: 'Company admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Staff' },
  { value: 'guest', label: 'Guest' },
] as const;
const ADD_AS = [
  { value: 'member', label: 'Staff' },
  { value: 'guest', label: 'Guest' },
] as const;

/** A company's own page: its people, adding people, its projects and its name. */
export default function CompanyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { companies, loading } = useWorkspace();
  const company = companies.find((c) => c.id === id);
  if (!company) {
    return (
      <View style={styles.page}>
        <ThemedText themeColor="textSecondary">{loading ? 'Loading…' : 'This company space could not be found.'}</ThemedText>
      </View>
    );
  }
  return <CompanyPage key={company.id} company={company} />;
}

function CompanyPage({ company }: { company: CompanyNode }) {
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id;
  const { projects, reload: reloadWorkspace, togglePin } = useWorkspace();
  const owner = company.role === 'owner';
  const admin = owner || company.role === 'admin';

  const [failed, setFailed] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(company.name);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [changing, setChanging] = useState<string | null>(null);

  const { rows, error, reload } = useRows<CompanyPerson>(`company1:${company.id}`, () =>
    supabase
      .from('company_members')
      .select('user_id, role, profile:profiles!user_id(full_name, position, username)')
      .eq('company_id', company.id)
      .returns<CompanyPerson[]>(),
  );
  // Invitations that were sent and not answered yet. Asked again now and then, so an answer shows by itself.
  const live = useLiveVersion();
  const invites = useRows<OpenInvite>(`company3:${company.id}:${admin}:${live}`, () =>
    admin
      ? (supabase.rpc('company_open_invites', { company: company.id }) as unknown as PromiseLike<{ data: OpenInvite[] | null; error: { message: string } | null }>)
      : Promise.resolve({ data: [] as OpenInvite[], error: null }),
  );
  const people = [...rows].sort((a, b) => (a.profile?.full_name ?? '').localeCompare(b.profile?.full_name ?? ''));
  const mine = projects.filter((p) => p.company_id === company.id);

  async function rename() {
    setBusy(true);
    const result = await supabase.from('companies').update({ name: name.trim() }).eq('id', company.id);
    setBusy(false);
    setFailed(result.error?.message ?? null);
    if (!result.error) {
      setRenaming(false);
      reloadWorkspace();
    }
  }

  async function setRole(userId: string, role: Exclude<Role, 'owner'>) {
    const result = await supabase.from('company_members').update({ role }).eq('company_id', company.id).eq('user_id', userId);
    setFailed(result.error?.message ?? null);
    setChanging(null);
    reload();
  }

  async function remove(userId: string) {
    const result = await supabase.from('company_members').delete().eq('company_id', company.id).eq('user_id', userId);
    setFailed(result.error?.message ?? null);
    reload();
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card tint="backgroundSelected">
        <View style={styles.line}>
          <View style={styles.grow}>
            <ThemedText type="title" raw>
              {company.name}
            </ThemedText>
            <ThemedText themeColor="textSecondary">Company space</ThemedText>
          </View>
          <Chip text={ROLE_WORDS[company.role]} tone="lavender" />
          {!renaming && (
            <MoreMenu
              actions={[
                {
                  title: company.pinned ? 'Unpin from the top' : 'Pin to the top',
                  onPress: async () => setFailed(await togglePin('companies', company.id)),
                },
                owner && { title: 'Rename company', onPress: () => setRenaming(true) },
              ]}
            />
          )}
        </View>
        {renaming && (
          <>
            <Field label="Company name" required value={name} onChangeText={setName} />
            <View style={styles.buttons}>
              <Button title="Save" small onPress={rename} loading={busy} disabled={name.trim().length < 2} />
              <Button title="Cancel" small variant="plain" onPress={() => setRenaming(false)} disabled={busy} />
            </View>
          </>
        )}
        <ErrorText>{failed ?? error}</ErrorText>
      </Card>

      {admin && <Waiting company={company} invited={invites.rows.map((i) => i.user_id)} onInvited={invites.reload} />}
      {admin && <AddPerson company={company} people={people} onInvited={invites.reload} />}
      {admin && invites.rows.length > 0 && (
        <Card>
          <ThemedText type="label">Waiting for their answer</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            These people were invited. They join the company when they accept.
          </ThemedText>
          {invites.rows.map((invite) => (
            <View key={invite.id} style={styles.line}>
              <Avatar name={invite.full_name} size={40} />
              <View style={styles.grow}>
                <ThemedText type="bold" raw numberOfLines={1}>
                  {invite.full_name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" raw numberOfLines={1}>
                  {[invite.username ? `@${invite.username}` : null, invite.position].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
              <Chip text={ROLE_WORDS[invite.role]} tone="plain" />
              <MoreMenu
                actions={[
                  {
                    title: 'Take back the invitation',
                    danger: true,
                    onPress: async () => {
                      const result = await supabase.rpc('cancel_company_invite', { invite: invite.id });
                      setFailed(result.error?.message ?? null);
                      invites.reload();
                    },
                  },
                ]}
              />
            </View>
          ))}
        </Card>
      )}

      <Card>
        <ThemedText type="label">People</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          The owner created the company space and is the only one who changes these statuses. Company admins
          create, edit and delete projects and are admins inside every project. Managers see every project but do
          not manage them. Staff and guests see only what they were added to.
        </ThemedText>
        {people.map((person) => (
          <View key={person.user_id} style={{ gap: Spacing.two }}>
            <View style={styles.line}>
              <Avatar name={person.profile?.full_name} size={40} />
              <View style={styles.grow}>
                <ThemedText type="bold" raw numberOfLines={1}>
                  {person.profile?.full_name ?? ''}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" raw numberOfLines={2}>
                  {[person.profile?.username ? `@${person.profile.username}` : null, person.profile?.position].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
              <Chip text={ROLE_WORDS[person.role]} tone={person.role === 'owner' || person.role === 'admin' ? 'lavender' : 'plain'} />
              {owner && person.user_id !== me && person.role !== 'owner' && (
                <MoreMenu
                  actions={[
                    { title: 'Change status', onPress: () => setChanging(person.user_id) },
                    { title: 'Remove from the company', danger: true, confirm: true, onPress: () => remove(person.user_id) },
                  ]}
                />
              )}
            </View>
            {changing === person.user_id && person.role !== 'owner' && (
              <View style={styles.buttons}>
                <Choices options={COMPANY_ROLES} value={person.role} onChange={(role) => setRole(person.user_id, role)} />
                <TextButton title="Cancel" onPress={() => setChanging(null)} />
              </View>
            )}
          </View>
        ))}
      </Card>

      <Card>
        <View style={styles.line}>
          <ThemedText type="label" style={styles.grow}>
            Projects
          </ThemedText>
          {admin && !creating && <Button title="New project" icon="plus" small onPress={() => setCreating(true)} />}
        </View>
        {creating && <NewProject companies={[company]} onClose={() => setCreating(false)} />}
        {mine.length === 0 && <ThemedText themeColor="textSecondary">No projects here yet.</ThemedText>}
        {mine.map((project) => (
          <View key={project.id} style={styles.line}>
            <Icon name="folder" color="primary" />
            <ThemedText type="bold" raw style={styles.grow} numberOfLines={2}>
              {project.name}
            </ThemedText>
            <Button
              title="Open project"
              small
              variant="secondary"
              onPress={() => router.push({ pathname: '/project/[id]', params: { id: project.id } })}
            />
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

type Candidate = { user_id: string; username: string | null; full_name: string; position: string | null };

/**
 * People who wrote this company's name when they signed up and are not in it yet.
 * Nobody joins by typing a name: the owner or a company admin invites them, and they accept.
 */
function Waiting({ company, invited, onInvited }: { company: CompanyNode; invited: string[]; onInvited: () => void }) {
  const { rows, reload } = useRows<Candidate>(`company2:${company.id}`, () =>
    supabase.rpc('company_candidates', { company: company.id }) as unknown as PromiseLike<{ data: Candidate[] | null; error: { message: string } | null }>,
  );
  const [failed, setFailed] = useState<string | null>(null);

  // A new account shows up here by itself while the page is open.
  useEffect(() => {
    const timer = setInterval(reload, 15000);
    return () => clearInterval(timer);
  }, [reload]);

  async function invite(person: Candidate, role: 'member' | 'guest') {
    const result = await supabase.rpc('invite_to_company', { company: company.id, person: person.user_id, as_role: role });
    setFailed(result.error?.message ?? null);
    reload();
    if (!result.error) onInvited();
  }

  const waiting = rows.filter((person) => !invited.includes(person.user_id));
  if (waiting.length === 0) return null;
  return (
    <Card tint="butter">
      <ThemedText type="subtitle">New people who wrote this company</ThemedText>
      <ThemedText themeColor="textSecondary">
        They wrote this company&apos;s name when they signed up. Invite only the people you know.
      </ThemedText>
      <ErrorText>{failed}</ErrorText>
      {waiting.map((person) => (
        <View key={person.user_id} style={styles.line}>
          <Avatar name={person.full_name} size={40} />
          <View style={styles.grow}>
            <ThemedText type="bold" raw numberOfLines={1}>
              {person.full_name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" raw numberOfLines={1}>
              {[person.username ? `@${person.username}` : null, person.position].filter(Boolean).join(' · ')}
            </ThemedText>
          </View>
          <Button title="Invite as staff" small variant="secondary" onPress={() => invite(person, 'member')} />
          <MoreMenu actions={[{ title: 'Invite as guest', onPress: () => invite(person, 'guest') }]} />
        </View>
      ))}
    </Card>
  );
}

/** Invites someone to the company by their username. They join only when they accept the invitation. */
function AddPerson({ company, people, onInvited }: { company: CompanyNode; people: CompanyPerson[]; onInvited: () => void }) {
  const [username, setUsername] = useState('');
  const [found, setFound] = useState<Found | 'nobody' | null>(null);
  const [as, setAs] = useState<'member' | 'guest'>('member');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  // People whose username starts with what is typed, offered while typing. People already here are left out.
  const offered = useUsernameSuggestions(username, !found).filter((person) => !people.some((p) => p.user_id === person.user_id));

  async function find() {
    setBusy(true);
    setAdded(null);
    const result = await supabase.rpc('find_person_by_username', { name: username });
    setBusy(false);
    setFailed(result.error?.message ?? null);
    setFound(result.error ? null : (((result.data as Found[] | null) ?? [])[0] ?? 'nobody'));
  }

  async function add(person: Found) {
    setBusy(true);
    const result = await supabase.rpc('invite_to_company', { company: company.id, person: person.user_id, as_role: as });
    setBusy(false);
    setFailed(result.error?.message ?? null);
    if (result.error) return;
    setAdded(person.full_name);
    setFound(null);
    setUsername('');
    onInvited();
  }

  const already = found && found !== 'nobody' && people.some((p) => p.user_id === found.user_id);

  return (
    <Card tint="mint">
      <ThemedText type="subtitle">Invite a person to the company</ThemedText>
      <ThemedText themeColor="textSecondary">
        Start typing their username and pick them from the list. They get an invitation and join the company when they accept it. After that you can add them to projects.
      </ThemedText>
      <Field
        label="Username"
        value={username}
        onChangeText={(text) => {
          setUsername(text);
          setFound(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={() => username.trim().length >= 3 && find()}
      />
      <Suggestions
        people={offered}
        onPick={(person) => {
          setUsername(person.username ?? '');
          setAdded(null);
          setFailed(null);
          setFound(person);
        }}
      />
      <Button title="Find" icon="search" variant="secondary" onPress={find} loading={busy && !found} disabled={username.trim().length < 3} />
      <ErrorText>{failed}</ErrorText>
      {found === 'nobody' && <ThemedText themeColor="textSecondary">Nobody has this username.</ThemedText>}
      {found && found !== 'nobody' && (
        <>
          <View style={styles.line}>
            <Avatar name={found.full_name} size={40} />
            <View style={styles.grow}>
              <ThemedText type="bold" raw numberOfLines={1}>
                {found.full_name}
                {found.username ? `  @${found.username}` : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" raw numberOfLines={1}>
                {[found.position, found.company_name].filter(Boolean).join(' · ')}
              </ThemedText>
            </View>
          </View>
          {already ? (
            <ThemedText themeColor="textSecondary">This person is already in the company.</ThemedText>
          ) : (
            <>
              <Choices options={ADD_AS} value={as} onChange={setAs} />
              <Button title="Send invitation" icon="user-plus" onPress={() => add(found)} loading={busy} />
            </>
          )}
        </>
      )}
      {added && (
        <View style={styles.line}>
          <Icon name="check-circle" color="primary" />
          <ThemedText raw style={styles.grow}>
            {added}
          </ThemedText>
          <Chip text="Invited" tone="ok" />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: WideContentWidth, alignSelf: 'center', padding: 16, paddingBottom: 48, gap: 18 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three },
});
