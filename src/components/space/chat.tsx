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
import { Button, EditedLabel, ErrorText, TextButton } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

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

type Loaded = { conversationId: string | null; messages: Message[]; error: string | null };

async function fetchChat(info: SpaceInfo): Promise<Loaded> {
  const conversations = supabase.from('conversations').select('id');
  const found = await (info.subgroup
    ? conversations.eq('kind', 'subgroup').eq('subgroup_id', info.subgroup.id)
    : conversations.eq('kind', 'project').eq('project_id', info.project.id)
  ).maybeSingle();
  if (found.error || !found.data) {
    return { conversationId: null, messages: [], error: found.error?.message ?? 'This chat could not be found.' };
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
  };
}

const time = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Live chat of a project, group or team. */
export function Chat({ info }: { info: SpaceInfo }) {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const list = useRef<FlatList<Message>>(null);

  const [data, setData] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => setVersion((v) => v + 1);
  const conversationId = data?.conversationId ?? null;

  useEffect(() => {
    let active = true;
    fetchChat(info).then((result) => {
      if (active) setData(result);
    });
    return () => {
      active = false;
    };
    // The chat is identified by ids; `info` itself is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.project.id, info.subgroup?.id, version]);

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
      setError(failed.message);
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
        renderItem={({ item }) => {
          const mine = item.sender_id === userId;
          const deleted = !!item.deleted_at;
          return (
            <View style={[styles.row, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
              <View
                style={[
                  styles.bubble,
                  { backgroundColor: mine ? theme.backgroundSelected : theme.card, borderColor: theme.border },
                ]}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {mine ? 'You' : (item.sender?.full_name ?? 'Someone')} · {time(item.created_at)}
                </ThemedText>
                <ThemedText themeColor={deleted ? 'textSecondary' : 'text'} style={deleted && styles.deleted}>
                  {deleted ? 'This message was deleted' : item.body}
                </ThemedText>
                {!deleted && <EditedLabel name={item.editor?.full_name ?? null} at={item.edited_at} />}
                {!deleted && (mine || info.isAdmin) && (
                  <View style={styles.actions}>
                    <TextButton
                      title="Edit"
                      onPress={() => {
                        setEditing(item);
                        setText(item.body ?? '');
                      }}
                    />
                    <TextButton title="Delete" danger onPress={() => remove(item)} />
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />

      <View style={[styles.composer, { borderTopColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <View style={styles.composerColumn}>
          <ErrorText>{error ?? data.error}</ErrorText>
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
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel="Message"
              placeholder="Write a message"
              placeholderTextColor={theme.textSecondary}
              value={text}
              onChangeText={setText}
              multiline
              onSubmitEditing={send}
              submitBehavior="submit"
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
            />
            <Button title={editing ? 'Save' : 'Send'} onPress={send} loading={busy} disabled={!text.trim()} />
          </View>
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
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth + 160,
    alignSelf: 'center',
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  row: { width: '100%' },
  bubble: {
    maxWidth: '85%',
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.half,
  },
  deleted: { fontStyle: 'italic' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  composer: { borderTopWidth: 1, padding: Spacing.three, alignItems: 'center' },
  composerColumn: { width: '100%', maxWidth: MaxContentWidth + 160, gap: Spacing.one },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  input: {
    flex: 1,
    minHeight: 54,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 17,
  },
});
