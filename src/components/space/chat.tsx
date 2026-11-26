import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { type SpaceInfo } from '@/components/space/space';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, EditedLabel, ErrorText, TextButton, MoreMenu } from '@/components/ui';
import { MaxContentWidth, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { locale, tr } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { keptChats } from '@/lib/use-rows';

type Message = {
  id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  sender: { full_name: string } | null;
  editor: { full_name: string } | null;
};

type Loaded = { conversationId: string | null; messages: Message[]; error: string | null; loadedAt: number };

async function fetchChat(info: SpaceInfo | undefined, direct: string | undefined): Promise<Loaded> {
  const conversations = supabase.from('conversations').select('id');
  const found = await (direct
    ? conversations.eq('id', direct)
    : info?.subgroup
      ? conversations.eq('kind', 'subgroup').eq('subgroup_id', info.subgroup.id)
      : conversations.eq('kind', 'project').eq('project_id', info?.project.id)
  ).maybeSingle();
  if (found.error || !found.data) {
    return { conversationId: null, messages: [], error: found.error?.message ?? 'This chat could not be found.', loadedAt: Date.now() };
  }
  // Opening a private chat marks it as read.
  if (direct) {
    const me = (await supabase.auth.getSession()).data.session?.user.id;
    if (me) {
      await supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', direct)
        .eq('user_id', me);
    }
  }

  const messages = await supabase
    .from('messages')
    .select(
      'id, sender_id, body, created_at, edited_at, deleted_at, sender:profiles!sender_id(full_name), editor:profiles!edited_by(full_name)',
    )
    .eq('conversation_id', found.data.id)
    .order('created_at', { ascending: false })
    .limit(200);

  return {
    conversationId: found.data.id,
    messages: ((messages.data ?? []) as unknown as Message[]).reverse(),
    error: messages.error?.message ?? null,
    loadedAt: Date.now(),
  };
}

/** The messages of chats opened earlier. */
const seen = keptChats as Map<string, Loaded>;

const time = (iso: string) =>
  new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Live chat of a project, group or team, or a private chat between two people (`direct`). */
export function Chat({ info, direct, closed }: { info?: SpaceInfo; direct?: string; closed?: string }) {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const list = useRef<FlatList<Message>>(null);

  // A chat that was open before shows its messages at once, then is brought up to date.
  const memory = direct ?? info?.subgroup?.id ?? info?.project.id ?? '';
  const [data, setData] = useState<Loaded | null>(() => seen.get(memory) ?? null);
  const [version, setVersion] = useState(0);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => setVersion((v) => v + 1);
  const conversationId = data?.conversationId ?? null;

  useEffect(() => {
    let active = true;
    fetchChat(info, direct).then((result) => {
      if (!result.error) seen.set(memory, result);
      if (active) setData(result);
    });
    return () => {
      active = false;
    };
    // The chat is identified by ids; `info` itself is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.project.id, info?.subgroup?.id, direct, version]);

  // New, edited and deleted messages from other people arrive live.
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        () => setVersion((v) => v + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  async function send() {
    const body = text.trim();
    if (!body || !conversationId) return;
    setBusy(true);
    setError(null);
    const { error: failed } = editing
      ? await supabase.from('messages').update({ body }).eq('id', editing.id)
      : await supabase.from('messages').insert({ conversation_id: conversationId, body });
    setBusy(false);
    if (failed) {
      // A private chat stops taking messages when one side blocked the other or they no longer share anything.
      setError(direct && failed.message.includes('row-level security') ? 'This message could not be sent.' : failed.message);
      return;
    }
    setText('');
    setEditing(null);
    refresh();
  }

  async function remove(message: Message) {
    const { error: failed } = await supabase.rpc('delete_message', { message_id: message.id });
    if (failed) setError(failed.message);
    refresh();
  }

  if (!data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}>
      <FlatList
        ref={list}
        data={data.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
            No messages yet. Say hello.
          </ThemedText>
        }
        renderItem={({ item, index }) => {
          const mine = item.sender_id === userId;
          const deleted = !!item.deleted_at;
          // Your own message can be changed for 24 hours, and only until someone else writes after it.
          const open =
            data.loadedAt - new Date(item.created_at).getTime() < 24 * 3600 * 1000 &&
            !data.messages.slice(index + 1).some((later) => later.sender_id !== item.sender_id);
          return (
            <View style={[styles.row, mine && styles.rowMine]}>
              {!mine && <Avatar name={item.sender?.full_name} size={36} />}
              <View
                style={[
                  styles.bubble,
                  mine
                    ? { backgroundColor: theme.bubbleMe, borderColor: 'transparent' }
                    : { backgroundColor: theme.card, borderColor: theme.border },
                ]}>
                {!mine && (
                  <ThemedText type="smallBold" themeColor="primary">
                    {item.sender?.full_name ?? 'Someone'}
                  </ThemedText>
                )}
                <ThemedText raw={!deleted} themeColor={deleted ? 'textSecondary' : 'text'} style={deleted && styles.deleted}>
                  {deleted ? 'This message was deleted' : item.body}
                </ThemedText>
                {!deleted && <EditedLabel name={item.editor?.full_name ?? null} at={item.edited_at} />}
                <View style={styles.meta}>
                  {!deleted && ((mine && open) || info?.isAdmin) && (
                    <MoreMenu
                      actions={[
                        {
                          title: 'Edit',
                          onPress: () => {
                            setEditing(item);
                            setText(item.body ?? '');
                          },
                        },
                        { title: 'Delete', danger: true, confirm: true, onPress: () => remove(item) },
                      ]}
                    />
                  )}
                  <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
                    {time(item.created_at)}
                  </ThemedText>
                </View>
              </View>
            </View>
          );
        }}
      />

      <View style={[styles.composer, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
        <View style={styles.composerColumn}>
          <ErrorText>{error ?? data.error}</ErrorText>
          {!!closed && (
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {closed}
            </ThemedText>
          )}
          {editing && (
            <View style={styles.actions}>
              <ThemedText type="small" themeColor="textSecondary">
                Editing a message
              </ThemedText>
              <TextButton
                title="Cancel"
                onPress={() => {
                  setEditing(null);
                  setText('');
                }}
              />
            </View>
          )}
          {!closed && (
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel="Message"
              placeholder={tr('Write a message')}
              placeholderTextColor={theme.textSecondary}
              value={text}
              onChangeText={setText}
              multiline
              onSubmitEditing={send}
              submitBehavior="submit"
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
            />
            <Button
              title={editing ? 'Save' : 'Send'}
              icon={editing ? 'check' : 'send'}
              onPress={send}
              loading={busy}
              disabled={!text.trim()}
            />
          </View>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: {
    padding: Spacing.three,
    gap: 10,
    width: '100%',
    maxWidth: MaxContentWidth + 160,
    alignSelf: 'center',
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', maxWidth: '88%', alignSelf: 'flex-start' },
  rowMine: { alignSelf: 'flex-end' },
  bubble: {
    flexShrink: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: Spacing.half,
  },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: Spacing.three },
  time: { fontSize: 13 },
  deleted: { fontStyle: 'italic' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  composer: { borderTopWidth: 1, padding: Spacing.three, alignItems: 'center' },
  composerColumn: { width: '100%', maxWidth: MaxContentWidth + 160, gap: Spacing.one },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    paddingVertical: 11,
    fontSize: 17,
    fontFamily: Type.body,
  },
});
