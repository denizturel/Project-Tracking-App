import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { type SpaceInfo } from '@/components/space/space';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EditedLabel, ErrorText, Field, TextButton } from '@/components/ui';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';

const TINTS: ThemeColor[] = ['lavender', 'mint', 'sky', 'butter'];

export function Overview({ info }: { info: SpaceInfo }) {
  const theme = useTheme();
  const { subgroups, reload } = useWorkspace();
  const { project, subgroup, level, isAdmin } = info;
  const item = subgroup ?? project;

  const children =
    level === 'project'
      ? subgroups.filter((s) => s.project_id === project.id && !s.parent_id)
      : level === 'group'
        ? subgroups.filter((s) => s.parent_id === subgroup?.id)
        : [];
  const childWord = level === 'project' ? 'group' : 'team';

  async function setRestricted(value: boolean) {
    await supabase.from('projects').update({ restrict_to_subgroups: value }).eq('id', project.id);
    reload();
  }

  return (
    <>
      <Details info={info} />

      {level === 'project' && isAdmin && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
            <View style={{ flex: 1, gap: Spacing.half }}>
              <ThemedText type="bold">Members see only their own groups</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Everyone still sees the project chat and all questions and solutions.
              </ThemedText>
            </View>
            <Switch
              accessibilityLabel="Members see only their own groups"
              value={project.restrict_to_subgroups}
              onValueChange={setRestricted}
              trackColor={{ true: theme.primary, false: theme.border }}
            />
          </View>
        </Card>
      )}

      {level !== 'team' && (
        <>
          <ThemedText type="subtitle">{level === 'project' ? 'Groups' : 'Teams'}</ThemedText>
          {children.length === 0 && (
            <ThemedText themeColor="textSecondary">
              {isAdmin ? `No ${childWord}s yet. Add the first one below.` : `No ${childWord}s for you here yet.`}
            </ThemedText>
          )}
          {children.map((child, index) => (
            <Link key={child.id} href={{ pathname: '/group/[id]', params: { id: child.id } }} asChild>
              <Pressable accessibilityRole="link" style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
                <Card tint={TINTS[index % TINTS.length]} style={{ gap: Spacing.one }}>
                  <ThemedText type="bold">{child.name}</ThemedText>
                  {!!child.description && <ThemedText type="small">{child.description}</ThemedText>}
                  <ThemedText type="small" themeColor="textSecondary">
                    Open ›
                  </ThemedText>
                </Card>
              </Pressable>
            </Link>
          ))}
          {isAdmin && (
            <NewChild
              word={childWord}
              projectId={project.id}
              parentId={level === 'group' ? (subgroup?.id ?? null) : null}
            />
          )}
        </>
      )}

      <ThemedText type="small" themeColor="textSecondary">
        {item === project && project.myRole === 'admin' ? 'You are an admin of this project.' : ''}
      </ThemedText>
    </>
  );
}

/** Name and description, editable by admins, with the "Edited by" label. */
function Details({ info }: { info: SpaceInfo }) {
  const router = useRouter();
  const { reload } = useWorkspace();
  const { project, subgroup, parent, level, isAdmin } = info;
  const item = subgroup ?? project;
  const table = subgroup ? 'subgroups' : 'projects';

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase
      .from(table)
      .update({ name: name.trim(), description: description.trim() || null })
      .eq('id', item.id);
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    setEditing(false);
    reload();
  }

  async function remove() {
    if (!subgroup) return;
    setBusy(true);
    const { error: failed } = await supabase.from('subgroups').delete().eq('id', subgroup.id);
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    reload();
    router.replace(
      parent
        ? { pathname: '/group/[id]', params: { id: parent.id } }
        : { pathname: '/project/[id]', params: { id: project.id } },
    );
  }

  if (editing) {
    return (
      <Card>
        <Field label="Name" required value={name} onChangeText={setName} />
        <Field label="Description" value={description} onChangeText={setDescription} multiline />
        <ErrorText>{error}</ErrorText>
        <Button title="Save" onPress={save} loading={busy} disabled={!name.trim()} />
        <Button title="Cancel" variant="plain" onPress={() => setEditing(false)} disabled={busy} />
      </Card>
    );
  }

  return (
    <Card tint="backgroundElement">
      <ThemedText type="small" themeColor="textSecondary">
        {level === 'project' ? 'Project' : level === 'group' ? 'Group' : 'Team'}
      </ThemedText>
      <ThemedText type="subtitle">{item.name}</ThemedText>
      <ThemedText themeColor={item.description ? 'text' : 'textSecondary'}>
        {item.description || 'No description yet.'}
      </ThemedText>
      <EditedLabel name={item.editor} at={item.edited_at} />
      <ErrorText>{error}</ErrorText>
      {isAdmin && (
        <View style={{ flexDirection: 'row', gap: Spacing.four, flexWrap: 'wrap' }}>
          <TextButton title="Edit" onPress={() => setEditing(true)} />
          {subgroup && !confirmDelete && (
            <TextButton title={`Delete this ${level}`} danger onPress={() => setConfirmDelete(true)} />
          )}
          {subgroup && confirmDelete && (
            <>
              <TextButton
                title={`Yes, delete it with its chat${level === 'group' ? ' and teams' : ''}`}
                danger
                onPress={remove}
                disabled={busy}
              />
              <TextButton title="Keep it" onPress={() => setConfirmDelete(false)} />
            </>
          )}
        </View>
      )}
    </Card>
  );
}

function NewChild(props: { word: 'group' | 'team'; projectId: string; parentId: string | null }) {
  const { reload } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return <Button title={`Add a ${props.word}`} variant="secondary" onPress={() => setOpen(true)} />;
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
    reload();
  }

  return (
    <Card>
      <Field label={`Name of the ${props.word}`} required value={name} onChangeText={setName} />
      <ErrorText>{error}</ErrorText>
      <Button title={`Create ${props.word}`} onPress={create} loading={busy} disabled={!name.trim()} />
      <Button title="Cancel" variant="plain" onPress={() => setOpen(false)} disabled={busy} />
    </Card>
  );
}
