import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { type Company, type CompanyRole, type Project, supabase } from '@/lib/supabase';

type Space = Company & { role: CompanyRole; projects: Project[] };

async function fetchSpaces(userId: string): Promise<{ spaces: Space[] | null; error: string | null }> {
  const [memberships, projects] = await Promise.all([
    supabase.from('company_members').select('role, companies(id, name)').eq('user_id', userId),
    supabase
      .from('projects')
      .select('id, company_id, name, description, restrict_to_subgroups, edited_at')
      .order('name'),
  ]);
  const failed = memberships.error ?? projects.error;
  if (failed) return { spaces: null, error: failed.message };

  const spaces = (memberships.data ?? []).flatMap((row) => {
    const company = row.companies as unknown as Company | null;
    if (!company) return [];
    return [
      {
        ...company,
        role: row.role as CompanyRole,
        projects: (projects.data ?? []).filter((p) => p.company_id === company.id),
      },
    ];
  });
  return { spaces, error: null };
}

export default function ProjectsScreen() {
  const { session, profile, signOut } = useAuth();
  const theme = useTheme();
  const userId = session?.user.id;

  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const load = useCallback(async () => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchSpaces(userId).then((result) => {
      if (!active) return;
      setError(result.error);
      if (result.spaces) setSpaces(result.spaces);
    });
    return () => {
      active = false;
    };
  }, [userId, version]);

  return (
    <Screen>
      <Card tint="backgroundElement">
        <ThemedText type="subtitle">Hello, {profile?.full_name}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {profile?.position} at {profile?.company_name}
        </ThemedText>
      </Card>

      <ErrorText>{error}</ErrorText>
      {spaces === null && !error && <ActivityIndicator color={theme.primary} size="large" />}

      {spaces?.map((space) => {
        const canCreate = space.role === 'owner' || space.role === 'admin';
        return (
          <Card key={space.id}>
            <View style={{ gap: Spacing.half }}>
              <ThemedText type="subtitle">{space.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Company space · you are {space.role === 'owner' ? 'the owner' : `a ${space.role}`}
              </ThemedText>
            </View>

            {space.projects.length === 0 && (
              <ThemedText themeColor="textSecondary">
                {canCreate
                  ? 'No projects yet. Create the first one below.'
                  : 'You have not been added to a project here yet.'}
              </ThemedText>
            )}

            {space.projects.map((project) => (
              <Link key={project.id} href={{ pathname: '/project/[id]', params: { id: project.id } }} asChild>
                <Pressable
                  accessibilityRole="link"
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                    borderRadius: 16,
                    padding: Spacing.three,
                    gap: Spacing.half,
                  })}>
                  <ThemedText type="bold">{project.name}</ThemedText>
                  {!!project.description && (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                      {project.description}
                    </ThemedText>
                  )}
                </Pressable>
              </Link>
            ))}

            {canCreate && <NewProject companyId={space.id} onCreated={load} />}
          </Card>
        );
      })}

      {spaces !== null && <NewCompany first={spaces.length === 0} onCreated={load} />}

      <Button title="Sign out" variant="plain" onPress={signOut} />
    </Screen>
  );
}

function NewProject({ companyId, onCreated }: { companyId: string; onCreated: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return <Button title="New project" variant="secondary" onPress={() => setOpen(true)} />;

  async function create() {
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase
      .from('projects')
      .insert({ company_id: companyId, name: name.trim(), description: description.trim() || null });
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    setName('');
    setDescription('');
    setOpen(false);
    await onCreated();
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <Field label="Project name" required value={name} onChangeText={setName} />
      <Field label="Description" value={description} onChangeText={setDescription} multiline />
      <ErrorText>{error}</ErrorText>
      <Button title="Create project" onPress={create} loading={busy} disabled={!name.trim()} />
      <Button title="Cancel" variant="plain" onPress={() => setOpen(false)} disabled={busy} />
    </View>
  );
}

function NewCompany({ first, onCreated }: { first: boolean; onCreated: () => Promise<void> }) {
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
    await onCreated();
  }

  if (!open && !first) {
    return <Button title="Create another company space" variant="plain" onPress={() => setOpen(true)} />;
  }

  return (
    <Card tint="butter">
      <ThemedText type="subtitle">{first ? 'Start your company space' : 'New company space'}</ThemedText>
      <ThemedText themeColor="textSecondary">
        {first
          ? 'If someone invited you, open the link in their invitation instead. Otherwise create a space for your company and you become its owner.'
          : 'A separate, closed space with its own people and projects.'}
      </ThemedText>
      <Field label="Company name" required value={name} onChangeText={setName} />
      <ErrorText>{error}</ErrorText>
      <Button title="Create company space" onPress={create} loading={busy} disabled={!name.trim()} />
      {!first && <Button title="Cancel" variant="plain" onPress={() => setOpen(false)} disabled={busy} />}
    </Card>
  );
}
