import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, Screen } from '@/components/ui';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { type Project, type Subgroup, supabase } from '@/lib/supabase';

const TINTS: ThemeColor[] = ['lavender', 'mint', 'sky', 'butter'];

type ProjectData = {
  project: Project | null;
  subgroups: Subgroup[];
  isAdmin: boolean;
  error: string | null;
};

async function fetchProject(id: string, userId: string): Promise<ProjectData> {
  const [p, s, m] = await Promise.all([
    supabase
      .from('projects')
      .select('id, company_id, name, description, restrict_to_subgroups, edited_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('subgroups')
      .select('id, project_id, parent_id, name, description, color')
      .eq('project_id', id)
      .order('name'),
    supabase.from('project_members').select('role').eq('project_id', id).eq('user_id', userId).maybeSingle(),
  ]);
  return {
    project: p.data,
    subgroups: s.data ?? [],
    isAdmin: m.data?.role === 'admin',
    error: (p.error ?? s.error ?? m.error)?.message ?? null,
  };
}

/** Project overview: description, then its groups with the teams inside each. */
export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const theme = useTheme();
  const userId = session?.user.id;

  const [data, setData] = useState<ProjectData | null>(null);
  const [version, setVersion] = useState(0);
  const load = useCallback(async () => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchProject(id, userId).then((result) => {
      if (active) setData(result);
    });
    return () => {
      active = false;
    };
  }, [id, userId, version]);

  const loaded = data !== null;
  const project = data?.project ?? null;
  const subgroups = data?.subgroups ?? [];
  const isAdmin = data?.isAdmin ?? false;
  const error = data?.error ?? null;

  if (!loaded) {
    return (
      <Screen centered>
        <ActivityIndicator color={theme.primary} size="large" />
      </Screen>
    );
  }

  if (!project) {
    return (
      <Screen centered>
        <ErrorText>{error ?? 'This project does not exist, or you are not a member of it.'}</ErrorText>
      </Screen>
    );
  }

  const groups = subgroups.filter((g) => g.parent_id === null);

  return (
    <Screen>
      <Stack.Screen options={{ title: project.name }} />

      <Card tint="backgroundElement">
        <ThemedText type="subtitle">{project.name}</ThemedText>
        <ThemedText themeColor={project.description ? 'text' : 'textSecondary'}>
          {project.description || 'No description yet.'}
        </ThemedText>
        {isAdmin && (
          <ThemedText type="small" themeColor="textSecondary">
            You are an admin of this project.
          </ThemedText>
        )}
      </Card>

      <ErrorText>{error}</ErrorText>

      <ThemedText type="subtitle">Groups</ThemedText>
      {groups.length === 0 && (
        <ThemedText themeColor="textSecondary">
          {isAdmin ? 'No groups yet. Add the first one below.' : 'You are not in any group yet.'}
        </ThemedText>
      )}

      {groups.map((group, index) => {
        const teams = subgroups.filter((t) => t.parent_id === group.id);
        return (
          <Card key={group.id} tint={TINTS[index % TINTS.length]}>
            <ThemedText type="bold">{group.name}</ThemedText>
            {!!group.description && <ThemedText type="small">{group.description}</ThemedText>}
            <View style={{ gap: Spacing.two }}>
              {teams.map((team) => (
                <View
                  key={team.id}
                  style={{ backgroundColor: theme.card, borderRadius: 12, padding: Spacing.three }}>
                  <ThemedText>{team.name}</ThemedText>
                </View>
              ))}
              {teams.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  No teams in this group yet.
                </ThemedText>
              )}
            </View>
            {isAdmin && <NewSubgroup label="team" projectId={project.id} parentId={group.id} onCreated={load} />}
          </Card>
        );
      })}

      {isAdmin && <NewSubgroup label="group" projectId={project.id} parentId={null} onCreated={load} />}
    </Screen>
  );
}

function NewSubgroup(props: {
  label: 'group' | 'team';
  projectId: string;
  parentId: string | null;
  onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return <Button title={`Add a ${props.label}`} variant="secondary" onPress={() => setOpen(true)} />;
  }

  async function create() {
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase
      .from('subgroups')
      .insert({ project_id: props.projectId, parent_id: props.parentId, name: name.trim() });
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    setName('');
    setOpen(false);
    await props.onCreated();
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <Field label={`Name of the ${props.label}`} required value={name} onChangeText={setName} />
      <ErrorText>{error}</ErrorText>
      <Button title={`Create ${props.label}`} onPress={create} loading={busy} disabled={!name.trim()} />
      <Button title="Cancel" variant="plain" onPress={() => setOpen(false)} disabled={busy} />
    </View>
  );
}
