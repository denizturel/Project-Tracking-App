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

import { AttachmentView } from '@/components/space/attachment-view';
import { type SpaceInfo } from '@/components/space/space';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, EditedLabel, ErrorText, Icon, IconButton, TextButton, MoreMenu } from '@/components/ui';
import { MaxContentWidth, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type Attachment, ATTACHMENT_COLUMNS, clock, type Outgoing, pickFile, saveAttachment, sizeText } from '@/lib/attachments';
import { fold } from '@/lib/fold';
import { locale, tr } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { markSeen } from '@/lib/unseen';
import { canRecordVoice, useVoiceRecorder } from '@/lib/voice';
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
  attachments: Attachment[] | null;
};

type Loaded = { conversationId: string | null; messages: Message[]; error: string | null; loadedAt: number };

async function fetchChat(info: SpaceInfo | undefined, direct: string | undefined, deep: boolean): Promise<Loaded> {
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
      `id, sender_id, body, created_at, edited_at, deleted_at, sender:profiles!sender_id(full_name), editor:profiles!edited_by(full_name), attachments(${ATTACHMENT_COLUMNS})`,
    )
    .eq('conversation_id', found.data.id)
    .order('created_at', { ascending: false })
    // Looking for one older message (from Search) or searching in the chat reaches further back.
    .limit(deep ? 1500 : 200);

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
export function Chat({ info, direct, closed, focus }: { info?: SpaceInfo; direct?: string; closed?: string; focus?: string }) {
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

  // The message to show and mark: the one opened from Search, or the current match of the search in this chat.
  const [target, setTarget] = useState<string | null>(focus ?? null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const deep = !!focus || searching;

  const refresh = () => setVersion((v) => v + 1);
  const conversationId = data?.conversationId ?? null;

  // Another message was picked in Search while this chat was already open.
  const [lastFocus, setLastFocus] = useState(focus);
  if (focus !== lastFocus) {
    setLastFocus(focus);
    if (focus) setTarget(focus);
  }

  const wanted = fold(query.trim());
  const matches =
    searching && wanted.length >= 2
      ? (data?.messages ?? []).filter((m) => !m.deleted_at && fold(m.body).includes(wanted)).map((m) => m.id)
      : [];
  const matchAt = target ? matches.indexOf(target) : -1;
  const step = (by: number) => {
    if (!matches.length) return;
    const next = matchAt < 0 ? matches.length - 1 : (matchAt + by + matches.length) % matches.length;
    setTarget(matches[next]);
  };

  // Brings the marked message into view.
  const targetIndex = target && data ? data.messages.findIndex((m) => m.id === target) : -1;
  useEffect(() => {
    if (targetIndex < 0) return;
    const timer = setTimeout(() => list.current?.scrollToIndex({ index: targetIndex, viewPosition: 0.4, animated: false }), 150);
    return () => clearTimeout(timer);
  }, [targetIndex, target]);

  useEffect(() => {
    let active = true;
    fetchChat(info, direct, deep).then((result) => {
      if (!result.error) seen.set(memory, result);
      if (active) setData(result);
      // Messages that arrive while the chat is on screen count as seen.
      if (active && info) markSeen(info.subgroup?.id ?? info.project.id, 'chat');
    });
    return () => {
      active = false;
    };
    // The chat is identified by ids; `info` itself is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.project.id, info?.subgroup?.id, direct, version, deep]);

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
      // A file or voice message is stored a moment after its message, so it gets its own signal.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attachments', filter: `conversation_id=eq.${conversationId}` },
        () => setVersion((v) => v + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // A file that was picked and waits for Send, and the voice recorder.
  const [file, setFile] = useState<Outgoing | null>(null);
  // A voice message stops by itself at the longest length and is sent.
  const voice = useVoiceRecorder(() => void endRecording(true));

  /** Sends the text, with a file or voice message when there is one. */
  async function send(extra?: Outgoing) {
    const body = text.trim();
    const attached = extra ?? file;
    if ((!body && !attached) || !conversationId) return;
    setBusy(true);
    setError(null);
    let failed: string | null = null;
    if (editing) {
      failed = (await supabase.from('messages').update({ body }).eq('id', editing.id)).error?.message ?? null;
    } else if (attached) {
      // The message comes first, because a file belongs to a message. A voice message goes without the typed text.
      const made = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, body: extra ? null : body || null })
        .select('id')
        .single();
      failed = made.error?.message ?? (await saveAttachment(conversationId, (made.data as { id: string }).id, attached));
      // A message whose file did not arrive is taken back, so no empty bubble is left.
      if (failed && made.data) await supabase.rpc('delete_message', { message_id: (made.data as { id: string }).id });
    } else {
      failed = (await supabase.from('messages').insert({ conversation_id: conversationId, body })).error?.message ?? null;
    }
    setBusy(false);
    if (failed) {
      // A private chat stops taking messages when one side blocked the other or they no longer share anything.
      setError(direct && failed.includes('row-level security') ? 'This message could not be sent.' : failed);
      return;
    }
    if (!extra) {
      setText('');
      setFile(null);
    }
    setEditing(null);
    refresh();
  }

  async function attach() {
    setError(null);
    const picked = await pickFile();
    if (!picked) return;
    if ('problem' in picked) return setError(picked.problem);
    setFile(picked);
  }

  async function record() {
    setError(await voice.start());
  }

  async function endRecording(keep: boolean) {
    const recorded = await voice.stop(keep);
    if (recorded) await send(recorded);
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
      <View style={[styles.searchBar, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
        {searching ? (
          <>
            <TextInput
              accessibilityLabel="Search in this chat"
              placeholder={tr('Search in this chat')}
              placeholderTextColor={theme.textSecondary}
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                setTarget(null);
              }}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => step(-1)}
              style={[styles.searchInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
            />
            <ThemedText type="small" themeColor="textSecondary" raw>
              {wanted.length < 2 ? '' : matches.length ? `${matchAt < 0 ? matches.length : matchAt + 1}/${matches.length}` : '0'}
            </ThemedText>
            <IconButton icon="chevron-up" label="Previous match" onPress={() => step(-1)} disabled={!matches.length} />
            <IconButton icon="chevron-down" label="Next match" onPress={() => step(1)} disabled={!matches.length} />
            <IconButton
              icon="x"
              label="Close search"
              onPress={() => {
                setSearching(false);
                setQuery('');
                setTarget(null);
              }}
            />
          </>
        ) : (
          <>
            <View style={styles.flex} />
            <IconButton icon="search" label="Search in this chat" onPress={() => setSearching(true)} />
          </>
        )}
      </View>
      <FlatList
        ref={list}
        data={data.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => {
          if (!target) list.current?.scrollToEnd({ animated: false });
        }}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          // Rows further up are not measured yet: go near it first, then exactly.
          list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
          setTimeout(() => list.current?.scrollToIndex({ index, viewPosition: 0.4, animated: false }), 250);
        }}
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
                  item.id === target && { borderColor: theme.primary, borderWidth: 3 },
                ]}>
                {/* In a private chat there is only one other person, so their name is not repeated. */}
                {!mine && !direct && (
                  <ThemedText type="smallBold" themeColor="primary">
                    {item.sender?.full_name ?? 'Someone'}
                  </ThemedText>
                )}
                {!deleted && (item.attachments ?? []).map((attachment) => <AttachmentView key={attachment.id} item={attachment} />)}
                {(deleted || !!item.body) && (
                  <ThemedText raw={!deleted} themeColor={deleted ? 'textSecondary' : 'text'} style={deleted && styles.deleted}>
                    {deleted ? 'This message was deleted' : item.body}
                  </ThemedText>
                )}
                {!deleted && <EditedLabel name={item.editor?.full_name ?? null} at={item.edited_at} />}
                <View style={styles.meta}>
                  {!deleted && ((mine && open) || info?.isAdmin) && (
                    <MoreMenu
                      actions={[
                        // A voice message or a file without words has no text to edit.
                        !!item.body && {
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
          {file && !voice.recording && (
            <View style={[styles.waiting, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <Icon name="paperclip" size={18} color="primary" />
              <ThemedText type="small" raw numberOfLines={1} style={styles.flex}>
                {file.name}
                {file.size ? ` · ${sizeText(file.size)}` : ''}
              </ThemedText>
              <IconButton icon="x" label="Remove the file" onPress={() => setFile(null)} />
            </View>
          )}
          {!closed && voice.recording && (
            <View style={styles.inputRow}>
              <View style={[styles.recording, { borderColor: theme.danger }]}>
                <Icon name="mic" size={20} color="danger" />
                <ThemedText type="bold" raw>
                  {clock(voice.seconds)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.flex}>
                  Recording a voice message
                </ThemedText>
              </View>
              <IconButton icon="trash-2" label="Throw the recording away" onPress={() => endRecording(false)} color="danger" />
              <Button title="Send" icon="send" onPress={() => endRecording(true)} loading={busy} />
            </View>
          )}
          {!closed && !voice.recording && (
          <View style={styles.inputRow}>
            {!editing && <IconButton icon="paperclip" label="Attach a file" onPress={attach} color="primary" disabled={busy} />}
            <TextInput
              accessibilityLabel="Message"
              placeholder={tr('Write a message')}
              placeholderTextColor={theme.textSecondary}
              value={text}
              onChangeText={setText}
              multiline
              onSubmitEditing={() => send()}
              submitBehavior="submit"
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
            />
            {canRecordVoice && !editing && !text.trim() && !file ? (
              <Button title="Voice" icon="mic" variant="secondary" onPress={record} loading={busy} />
            ) : (
              <Button
                title={editing ? 'Save' : 'Send'}
                icon={editing ? 'check' : 'send'}
                onPress={() => send()}
                loading={busy}
                disabled={!text.trim() && !file}
              />
            )}
          </View>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.three, paddingVertical: 4, borderBottomWidth: 1, minHeight: 44 },
  searchInput: { flex: 1, height: 38, borderWidth: 1, borderRadius: 19, paddingHorizontal: 14, fontSize: 16, fontFamily: Type.body },
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
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingLeft: 12, paddingRight: 2 },
  recording: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 24, paddingHorizontal: 14, minHeight: 48 },
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
