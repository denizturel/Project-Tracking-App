import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AttachmentView } from '@/components/space/attachment-view';
import { type SpaceInfo } from '@/components/space/space';
import { ThemedText } from '@/components/themed-text';
import { Card, ErrorText, Icon, Segmented, TextButton } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { type Attachment, ATTACHMENT_COLUMNS, linksIn } from '@/lib/attachments';
import { locale } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';

const PARTS = ['Media', 'Docs', 'Links'] as const;
type Part = (typeof PARTS)[number];

type Shared = Attachment & { message: { created_at: string; sender: { full_name: string } | null } | null };
type Linked = { id: string; body: string | null; created_at: string; sender: { full_name: string } | null };
type Row = { conversation: string | null; files: Shared[]; links: Linked[] };

const day = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '';

async function load(info: SpaceInfo): Promise<{ data: Row[]; error: { message: string } | null }> {
  const conversations = supabase.from('conversations').select('id');
  const found = await (info.subgroup
    ? conversations.eq('kind', 'subgroup').eq('subgroup_id', info.subgroup.id)
    : conversations.eq('kind', 'project').eq('project_id', info.project.id)
  ).maybeSingle();
  const conversation = (found.data as { id: string } | null)?.id ?? null;
  if (!conversation) return { data: [{ conversation: null, files: [], links: [] }], error: found.error };
  const [files, links] = await Promise.all([
    supabase
      .from('attachments')
      .select(`${ATTACHMENT_COLUMNS}, message:messages!message_id(created_at, sender:profiles!sender_id(full_name))`)
      .eq('conversation_id', conversation)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('messages')
      .select('id, body, created_at, sender:profiles!sender_id(full_name)')
      .eq('conversation_id', conversation)
      .is('deleted_at', null)
      .ilike('body', '%http%')
      .order('created_at', { ascending: false })
      .limit(300),
  ]);
  return {
    data: [{ conversation, files: (files.data ?? []) as unknown as Shared[], links: (links.data ?? []) as unknown as Linked[] }],
    error: files.error ?? links.error,
  };
}

/** Everything shared in this chat: pictures and voice messages, documents, and links, each with a way back to its message. */
export function Media({ info }: { info: SpaceInfo }) {
  const theme = useTheme();
  const router = useRouter();
  const [part, setPart] = useState<Part>('Media');
  const place = info.subgroup?.id ?? info.project.id;
  const { rows, error, loading } = useRows<Row>(`media1:${place}`, () => load(info));
  const data = rows[0] ?? { conversation: null, files: [], links: [] };

  const goTo = (messageId: string) =>
    info.subgroup
      ? router.push({ pathname: '/group/[id]', params: { id: info.subgroup.id, tab: 'Chat', message: messageId } })
      : router.push({ pathname: '/project/[id]', params: { id: info.project.id, tab: 'Chat', message: messageId } });

  const media = data.files.filter((f) => f.kind === 'image' || f.kind === 'voice');
  const docs = data.files.filter((f) => f.kind === 'file');
  const links = data.links.flatMap((m) => linksIn(m.body).map((url) => ({ url, message: m })));
  const shown = part === 'Media' ? media : docs;
  const empty = part === 'Links' ? links.length === 0 : shown.length === 0;

  return (
    <Card>
      <Segmented options={PARTS} value={part} onChange={setPart} />
      <ErrorText>{error}</ErrorText>
      {!loading && empty && (
        <ThemedText type="small" themeColor="textSecondary">
          {part === 'Media'
            ? 'No pictures or voice messages in this chat yet.'
            : part === 'Docs'
              ? 'No documents in this chat yet. Use the paperclip in the chat to send one.'
              : 'No links in this chat yet.'}
        </ThemedText>
      )}

      {part !== 'Links' &&
        shown.map((file, index) => (
          <View key={file.id} style={[styles.item, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
            <AttachmentView item={file} />
            <View style={styles.meta}>
              <ThemedText type="small" themeColor="textSecondary" raw numberOfLines={1} style={styles.grow}>
                {[file.message?.sender?.full_name, day(file.message?.created_at ?? file.created_at)].filter(Boolean).join(' · ')}
              </ThemedText>
              <TextButton title="Go to message" onPress={() => goTo(file.message_id)} />
            </View>
          </View>
        ))}

      {part === 'Links' &&
        links.map((link, index) => (
          <View key={`${link.message.id}-${index}`} style={[styles.item, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(link.url).catch(() => {})} style={styles.link}>
              <Icon name="link" size={18} color="primary" />
              <ThemedText type="smallBold" themeColor="primary" raw numberOfLines={2} style={styles.grow}>
                {link.url}
              </ThemedText>
            </Pressable>
            <View style={styles.meta}>
              <ThemedText type="small" themeColor="textSecondary" raw numberOfLines={1} style={styles.grow}>
                {[link.message.sender?.full_name, day(link.message.created_at)].filter(Boolean).join(' · ')}
              </ThemedText>
              <TextButton title="Go to message" onPress={() => goTo(link.message.id)} />
            </View>
          </View>
        ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  item: { gap: 6, paddingVertical: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
