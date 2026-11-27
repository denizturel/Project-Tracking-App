import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ErrorText, Field, Icon } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fold } from '@/lib/fold';
import { locale } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useWorkspace, WIDE_SCREEN } from '@/lib/workspace';

type Hit = {
  kind: 'message' | 'question' | 'solution' | 'task';
  id: string;
  project_id: string | null;
  conversation_id: string | null;
  snippet: string | null;
  created_at: string;
};

const KIND_WORD: Record<Hit['kind'], string> = { message: 'Message', question: 'Question', solution: 'Solution', task: 'Task' };
const when = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });

type Place = { key: string; name: string; kind: 'Company' | 'Project' | 'Group' | 'Team'; where: string; open: () => void };

/**
 * One search bar for everything: companies, projects, groups and teams show up while typing,
 * and Search also looks in every chat, question, solution and task you can see.
 * Turkish letters do not matter ("sifre" finds "Şifre").
 */
export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const wide = useWindowDimensions().width >= WIDE_SCREEN;
  const { companies, projects, subgroups } = useWorkspace();
  const [text, setText] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const q = text.trim();
    if (q.length < 2) return;
    setBusy(true);
    const result = await supabase.rpc('search_all', { q });
    setBusy(false);
    setError(result.error?.message ?? null);
    setHits((result.data as Hit[] | null) ?? []);
    setAsked(q);
  }

  async function open(hit: Hit) {
    if (hit.kind === 'message' && hit.conversation_id) {
      const found = await supabase.from('conversations').select('kind, project_id, subgroup_id').eq('id', hit.conversation_id).maybeSingle();
      const chat = found.data as { kind: string; project_id: string | null; subgroup_id: string | null } | null;
      if (!chat) return setError('This chat could not be found.');
      if (chat.kind === 'direct') router.push({ pathname: '/messages/[id]', params: { id: hit.conversation_id, message: hit.id } });
      else if (chat.kind === 'subgroup' && chat.subgroup_id)
        router.push({ pathname: '/group/[id]', params: { id: chat.subgroup_id, tab: 'Chat', message: hit.id } });
      else if (chat.project_id) router.push({ pathname: '/project/[id]', params: { id: chat.project_id, tab: 'Chat', message: hit.id } });
      return;
    }
    if (!hit.project_id) return;
    router.push({ pathname: '/project/[id]', params: { id: hit.project_id, tab: hit.kind === 'task' ? 'Tasks' : 'Questions & solutions' } });
  }

  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? '';

  // Companies, projects, groups and teams are already on the device, so they are found while typing.
  const typed = fold(text.trim());
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? '';
  const places: Place[] =
    typed.length < 2
      ? []
      : [
          ...companies.map((c): Place => ({ key: `c${c.id}`, name: c.name, kind: 'Company', where: '', open: () => router.push({ pathname: '/company/[id]', params: { id: c.id } }) })),
          ...projects.map((p): Place => ({ key: `p${p.id}`, name: p.name, kind: 'Project', where: companyName(p.company_id), open: () => router.push({ pathname: '/project/[id]', params: { id: p.id } }) })),
          ...subgroups.map(
            (s): Place => ({
              key: `s${s.id}`,
              name: s.name,
              kind: s.parent_id ? 'Team' : 'Group',
              where: [projectName(s.project_id), s.parent_id ? subgroups.find((g) => g.id === s.parent_id)?.name : null].filter(Boolean).join(' · '),
              open: () => router.push({ pathname: '/group/[id]', params: { id: s.id } }),
            }),
          ),
        ].filter((place) => fold(place.name).includes(typed));

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        {wide && <ThemedText type="title">Search</ThemedText>}
        <Card>
          <Field
            label="Search companies, projects, groups, teams, messages, questions and tasks"
            value={text}
            onChangeText={setText}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={search}
          />
          <Button title="Search" icon="search" onPress={search} loading={busy} disabled={text.trim().length < 2} />
          <ErrorText>{error}</ErrorText>
        </Card>

        {places.length > 0 && (
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {places.slice(0, 20).map((place, index) => (
              <Pressable
                key={place.key}
                accessibilityRole="button"
                onPress={place.open}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                  { opacity: pressed ? 0.6 : 1 },
                ]}>
                <View style={styles.grow}>
                  <ThemedText type="bold" raw numberOfLines={1}>
                    {place.name}
                  </ThemedText>
                  <View style={styles.meta}>
                    <Chip text={place.kind} tone={place.kind === 'Company' ? 'accent' : place.kind === 'Project' ? 'sky' : 'lavender'} />
                    <ThemedText type="small" themeColor="textSecondary" raw numberOfLines={1} style={styles.grow}>
                      {place.where}
                    </ThemedText>
                  </View>
                </View>
                <Icon name="chevron-right" size={18} color="textSecondary" />
              </Pressable>
            ))}
          </Card>
        )}

        {busy && !hits && <ActivityIndicator color={theme.primary} size="large" />}
        {hits && hits.length === 0 && places.length === 0 && (
          <ThemedText themeColor="textSecondary" raw={false}>
            Nothing found.
          </ThemedText>
        )}
        {hits && hits.length > 0 && (
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {hits.map((hit, index) => (
              <Pressable
                key={`${hit.kind}-${hit.id}`}
                accessibilityRole="button"
                onPress={() => open(hit)}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                  { opacity: pressed ? 0.6 : 1 },
                ]}>
                <View style={styles.grow}>
                  <ThemedText raw numberOfLines={3}>
                    {hit.snippet ?? ''}
                  </ThemedText>
                  <View style={styles.meta}>
                    <Chip text={KIND_WORD[hit.kind]} tone={hit.kind === 'message' ? 'accent' : 'lavender'} />
                    <ThemedText type="small" themeColor="textSecondary" raw numberOfLines={1} style={styles.grow}>
                      {[projectName(hit.project_id), when(hit.created_at)].filter(Boolean).join(' · ')}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText type="smallBold" themeColor="primary">
                  {hit.kind === 'message' ? 'Go to message' : 'Go to it'}
                </ThemedText>
                <Icon name="chevron-right" size={18} color="textSecondary" />
              </Pressable>
            ))}
          </Card>
        )}
        {hits && hits.length >= 100 && (
          <ThemedText type="small" themeColor="textSecondary">
            Only the newest 100 results are shown. Add a word to narrow it down.
          </ThemedText>
        )}
        {!hits && !busy && !asked && (
          <ThemedText type="small" themeColor="textSecondary">
            Companies, projects, groups and teams appear while you type. Press Search to also look in every chat, question, solution and task you can see. Turkish letters do not matter.
          </ThemedText>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.three, alignItems: 'center' },
  column: { width: '100%', maxWidth: 760, gap: Spacing.three },
  grow: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: 6 },
});
