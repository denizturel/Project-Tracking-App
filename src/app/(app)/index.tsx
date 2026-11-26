import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, useWindowDimensions, View } from 'react-native';

import { Sidebar } from '@/components/sidebar';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, Screen, TextButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';
import { type CompanyNode, useWorkspace, WIDE_SCREEN } from '@/lib/workspace';

/** Home: on phones the side menu comes first, then the things you can start from here. */
export default function HomeScreen() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { companies, projects, loading, error } = useWorkspace();
  const wide = useWindowDimensions().width >= WIDE_SCREEN;

  const adminOf = companies.filter((c) => c.role === 'owner' || c.role === 'admin');

  return (
    <Screen>
      <Card tint="backgroundElement">
        <ThemedText type="subtitle">Hello, {profile?.full_name}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {projects.length > 0
            ? wide
              ? 'Pick a project, group or team from the menu on the left.'
              : 'Pick a project, group or team below.'
            : 'Start by creating a company space and a project, or join with an invitation code.'}
        </ThemedText>
      </Card>

      <ErrorText>{error}</ErrorText>
      {loading && <ActivityIndicator color={theme.primary} size="large" />}

      {!wide && projects.length > 0 && (
        <View style={{ borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: theme.border }}>
          <Sidebar />
        </View>
      )}

      {adminOf.map((company) => (
        <NewProject key={company.id} companyId={company.id} companyName={company.name} />
      ))}
      {adminOf.map((company) => (
        <CompanyPeople key={company.id} company={company} />
      ))}

      {!loading && <JoinWithCode />}
      {!loading && <NewCompany first={companies.length === 0} />}
    </Screen>
  );
}

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

function NewProject({ companyId, companyName }: { companyId: string; companyName: string }) {
  const router = useRouter();
  const { reload } = useWorkspace();
  const [open, setOpen] = useState(false);
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
    setName('');
    setDescription('');
    reload();
    // Straight into the new project's workspace.
    router.push({ pathname: '/project/[id]', params: { id: data.id } });
  }

  if (!open) {
    return (
      <Button
        title={`New project in ${companyName}`}
        icon="plus"
        variant="secondary"
        onPress={() => setOpen(true)}
      />
    );
  }

  return (
    <Card>
      <View style={{ gap: Spacing.half }}>
        <ThemedText type="subtitle">New project</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          In the company space {companyName}
        </ThemedText>
      </View>
      <Field label="Project name" required value={name} onChangeText={setName} />
      <Field label="Description" value={description} onChangeText={setDescription} multiline />
      <ErrorText>{error}</ErrorText>
      <Button title="Create project" onPress={create} loading={busy} disabled={!name.trim()} />
      <Button title="Cancel" variant="plain" onPress={() => setOpen(false)} disabled={busy} />
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
