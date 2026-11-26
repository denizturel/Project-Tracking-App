import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Tag } from '@/components/space/questions';
import { inScope, personName } from '@/components/space/scope';
import { type SpaceInfo } from '@/components/space/space';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EditedLabel, ErrorText, Field, TextButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';
import { useWorkspace } from '@/lib/workspace';

type Item = {
  id: string;
  subgroup_id: string | null;
  kind: 'link' | 'document';
  title: string;
  description: string | null;
  url: string | null;
  storage_path: string | null;
  file_name: string | null;
  size_bytes: number | null;
  created_at: string;
  edited_at: string | null;
  adder: unknown;
  editor: unknown;
};

const SELECT =
  'id, subgroup_id, kind, title, description, url, storage_path, file_name, size_bytes, created_at, edited_at, ' +
  'adder:profiles!created_by(full_name), editor:profiles!edited_by(full_name)';

const MAX_FILE = 50 * 1024 * 1024;

/** The same link or the same file counts as one item, wherever it was added. */
function sameAs(item: Item) {
  if (item.kind === 'link') {
    return `link:${(item.url ?? '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, '')
      .replace(/\/+$/, '')}`;
  }
  return `file:${(item.file_name ?? '').toLowerCase()}:${item.size_bytes ?? 0}`;
}

function withHttps(text: string) {
  const value = text.trim();
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function fileSize(bytes: number | null) {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Training({ info }: { info: SpaceInfo }) {
  const { subgroups } = useWorkspace();
  const [search, setSearch] = useState('');

  const { rows, loading, error, reload } = useRows<Item>(info.project.id, () =>
    supabase
      .from('training_items')
      .select(SELECT)
      .eq('project_id', info.project.id)
      .order('created_at', { ascending: false })
      .returns<Item[]>(),
  );

  const placeOf = (id: string | null) =>
    id ? (subgroups.find((s) => s.id === id)?.name ?? 'A team') : 'Whole project';

  // One entry per link or file, with every place it was added to (no duplicates).
  const groups = new Map<string, Item[]>();
  for (const item of rows.filter((r) => inScope(info, subgroups, r.subgroup_id))) {
    const key = sameAs(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = [...groups.values()].filter((copies) => {
    const text = copies
      .map((c) => `${c.title} ${c.description ?? ''} ${c.url ?? ''} ${c.file_name ?? ''}`)
      .join(' ')
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });

  return (
    <>
      <ThemedText type="subtitle">Training</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {info.level === 'team'
          ? 'Training links and documents for this team.'
          : `Training links and documents of this ${info.level} and everything inside it. Each item is listed once.`}
      </ThemedText>

      {info.isAdmin && <NewItem info={info} onSaved={reload} />}
      {rows.length > 5 && <Field label="Search" value={search} onChangeText={setSearch} autoCapitalize="none" />}
      <ErrorText>{error}</ErrorText>
      {!loading && shown.length === 0 && (
        <ThemedText themeColor="textSecondary">
          {groups.size === 0 ? 'No training material here yet.' : 'Nothing matches.'}
        </ThemedText>
      )}

      {shown.map((copies) => (
        <ItemCard
          key={copies[0].id}
          copies={copies}
          places={[...new Set(copies.map((c) => placeOf(c.subgroup_id)))]}
          here={info.subgroup?.id ?? null}
          showPlaces={info.level !== 'team'}
          isAdmin={info.isAdmin}
          onChanged={reload}
        />
      ))}
    </>
  );
}

function NewItem({ info, onSaved }: { info: SpaceInfo; onSaved: () => void }) {
  const [mode, setMode] = useState<'closed' | 'link' | 'document'>('closed');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mode === 'closed') {
    return (
      <View style={styles.row}>
        <View style={styles.grow}>
          <Button title="Add a link" onPress={() => setMode('link')} />
        </View>
        <View style={styles.grow}>
          <Button title="Add a document" variant="secondary" onPress={() => setMode('document')} />
        </View>
      </View>
    );
  }

  function close() {
    setMode('closed');
    setTitle('');
    setDescription('');
    setUrl('');
    setFile(null);
    setError(null);
  }

  async function pick() {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if ((asset.size ?? 0) > MAX_FILE) return setError('That file is larger than 50 MB.');
    setFile(asset);
    if (!title.trim()) setTitle(asset.name.replace(/\.[^.]+$/, ''));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const base = {
      project_id: info.project.id,
      subgroup_id: info.subgroup?.id ?? null,
      title: title.trim(),
      description: description.trim() || null,
    };

    let failed: { message: string } | null = null;
    if (mode === 'link') {
      ({ error: failed } = await supabase.from('training_items').insert({ ...base, kind: 'link', url: withHttps(url) }));
    } else if (file) {
      const safeName = file.name.replace(/[^\w.-]+/g, '_');
      const path = `training/${info.project.id}/${info.subgroup?.id ?? 'project'}/${Date.now()}-${safeName}`;
      const body = file.file ?? (await (await fetch(file.uri)).arrayBuffer());
      const uploaded = await supabase.storage
        .from('attachments')
        .upload(path, body, { contentType: file.mimeType ?? 'application/octet-stream' });
      failed = uploaded.error;
      if (!failed) {
        ({ error: failed } = await supabase.from('training_items').insert({
          ...base,
          kind: 'document',
          storage_path: path,
          file_name: file.name,
          mime_type: file.mimeType ?? null,
          size_bytes: file.size ?? null,
        }));
      }
    }
    setBusy(false);
    if (failed) return setError(failed.message);
    close();
    onSaved();
  }

  const ready = !!title.trim() && (mode === 'link' ? url.trim().length > 3 : !!file);

  return (
    <Card>
      <ThemedText type="bold">{mode === 'link' ? 'New training link' : 'New training document'}</ThemedText>
      {mode === 'link' ? (
        <Field
          label="Link"
          required
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="https://"
        />
      ) : (
        <>
          <Button title={file ? 'Choose another file' : 'Choose a file'} variant="secondary" onPress={pick} />
          {file && (
            <ThemedText type="small">
              {file.name} {fileSize(file.size ?? null)}
            </ThemedText>
          )}
        </>
      )}
      <Field label="Title" required value={title} onChangeText={setTitle} />
      <Field label="What is it about" value={description} onChangeText={setDescription} multiline />
      <ErrorText>{error}</ErrorText>
      <Button title="Add" onPress={save} loading={busy} disabled={!ready} />
      <Button title="Cancel" variant="plain" onPress={close} disabled={busy} />
    </Card>
  );
}

type CardProps = {
  /** The same item as added in one or more places. */
  copies: Item[];
  places: string[];
  here: string | null;
  showPlaces: boolean;
  isAdmin: boolean;
  onChanged: () => void;
};

function ItemCard({ copies, places, here, showPlaces, isAdmin, onChanged }: CardProps) {
  // Edit and remove act on the copy that belongs to this page when there is one.
  const item = copies.find((c) => c.subgroup_id === here) ?? copies[0];
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    if (item.kind === 'link' && item.url) {
      await Linking.openURL(item.url).catch(() => setError('This link could not be opened.'));
      return;
    }
    if (!item.storage_path) return;
    setBusy(true);
    const { data, error: failed } = await supabase.storage.from('attachments').createSignedUrl(item.storage_path, 3600);
    setBusy(false);
    if (failed || !data) return setError(failed?.message ?? 'This file could not be opened.');
    await Linking.openURL(data.signedUrl).catch(() => setError('This file could not be opened.'));
  }

  async function run(action: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error: failed } = await action;
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return false;
    }
    onChanged();
    return true;
  }

  async function save() {
    const saved = await run(
      supabase
        .from('training_items')
        .update({ title: title.trim(), description: description.trim() || null })
        .eq('id', item.id),
    );
    if (saved) setEditing(false);
  }

  return (
    <Card tint={item.kind === 'link' ? 'sky' : 'butter'}>
      <View style={styles.tags}>
        <Tag text={item.kind === 'link' ? 'Link' : `Document ${fileSize(item.size_bytes)}`.trim()} />
        {showPlaces && places.map((place) => <Tag key={place} text={place} />)}
      </View>

      {editing ? (
        <>
          <Field label="Title" required value={title} onChangeText={setTitle} />
          <Field label="What is it about" value={description} onChangeText={setDescription} multiline />
          <Button title="Save" onPress={save} loading={busy} disabled={!title.trim()} />
          <Button title="Cancel" variant="plain" onPress={() => setEditing(false)} disabled={busy} />
        </>
      ) : (
        <>
          <ThemedText type="bold">{item.title}</ThemedText>
          {!!item.description && <ThemedText>{item.description}</ThemedText>}
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {item.kind === 'link' ? item.url : item.file_name} · added by {personName(item.adder)}
          </ThemedText>
          <EditedLabel name={item.edited_at ? personName(item.editor) : null} at={item.edited_at} />
          <View style={styles.row}>
            <TextButton title={item.kind === 'link' ? 'Open link' : 'Open document'} onPress={open} disabled={busy} />
            {isAdmin && <TextButton title="Edit" onPress={() => setEditing(true)} />}
            {isAdmin && (
              <TextButton
                title={copies.length > 1 ? `Remove from ${here === item.subgroup_id ? 'here' : 'one place'}` : 'Remove'}
                danger
                disabled={busy}
                onPress={() => run(supabase.from('training_items').delete().eq('id', item.id))}
              />
            )}
          </View>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  grow: { flex: 1, minWidth: 160 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
