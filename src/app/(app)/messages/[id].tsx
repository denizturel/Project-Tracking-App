import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Chat } from '@/components/space/chat';
import { Link } from '@/components/go';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, ErrorText, Field, Icon, IconButton, TextButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { blockPerson, reportPerson, unblockPerson, useDirectChats } from '@/lib/direct';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';
import { WIDE_SCREEN } from '@/lib/workspace';

/** A private chat between two people, with block and report behind the "more" button. */
export default function DirectChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const wide = useWindowDimensions().width >= WIDE_SCREEN;
  const { chats } = useDirectChats(id);
  const other = chats.find((chat) => chat.conversation_id === id);
  const otherId = other?.user_id;

  const blocks = useRows<{ blocked: string }>(`chat1:${otherId ?? ''}`, () =>
    supabase.from('user_blocks').select('blocked').eq('blocked', otherId ?? me).returns<{ blocked: string }[]>(),
  );
  const blocked = !!otherId && blocks.rows.length > 0;

  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: PromiseLike<{ error: { message: string } | null }>, done?: string) {
    setBusy(true);
    const result = await action;
    setBusy(false);
    setError(result.error?.message ?? null);
    if (result.error) return;
    setConfirming(false);
    setReporting(false);
    setReason('');
    setNotice(done ?? null);
    blocks.reload();
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: other?.full_name ?? 'Messages' }} />
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        {wide && (
          <Link href="/messages" asChild>
            <Pressable accessibilityRole="link" accessibilityLabel="Back to messages" hitSlop={8}>
              <Icon name="chevron-left" />
            </Pressable>
          </Link>
        )}
        {/* Phones show the person's name in the top bar already. */}
        {wide ? <Avatar name={other?.full_name} size={40} /> : <Icon name="lock" size={18} color="textSecondary" />}
        <View style={styles.grow}>
          {wide && (
            <ThemedText type="bold" raw numberOfLines={1}>
              {other?.full_name ?? ''}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary" raw={wide && !!other?.position} numberOfLines={1}>
            {wide && other?.position ? other.position : 'Private chat'}
          </ThemedText>
        </View>
        {!!otherId && (
          <IconButton
            icon={menu ? 'x' : 'more-vertical'}
            label={menu ? 'Close' : 'Block or report'}
            onPress={() => {
              setMenu(!menu);
              setConfirming(false);
              setReporting(false);
              setNotice(null);
            }}
          />
        )}
      </View>

      {menu && otherId && (
        <View style={[styles.menu, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <ErrorText>{error}</ErrorText>
          {!!notice && (
            <ThemedText type="small" themeColor="ok">
              {notice}
            </ThemedText>
          )}
          {!reporting && (
            <View style={styles.actions}>
              {blocked ? (
                <Button title="Unblock" icon="unlock" small variant="secondary" disabled={busy} onPress={() => run(unblockPerson(otherId, me))} />
              ) : confirming ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
                    Neither of you can message the other or ask to connect while the block is on. They are not told.
                  </ThemedText>
                  <Button title="Yes, block" small disabled={busy} onPress={() => run(blockPerson(otherId))} />
                  <TextButton title="Cancel" onPress={() => setConfirming(false)} />
                </>
              ) : (
                <Button title="Block this person" icon="slash" small variant="secondary" onPress={() => setConfirming(true)} />
              )}
              {!confirming && (
                <Button title="Report this person" icon="flag" small variant="secondary" onPress={() => setReporting(true)} />
              )}
            </View>
          )}
          {reporting && (
            <View style={{ gap: Spacing.two }}>
              <Field
                label="What is wrong?"
                required
                value={reason}
                onChangeText={setReason}
                multiline
                maxLength={1000}
              />
              <ThemedText type="small" themeColor="textSecondary">
                The report goes to the people who run Doneva, not to this person.
              </ThemedText>
              <View style={styles.actions}>
                <Button
                  title="Send report"
                  small
                  loading={busy}
                  disabled={reason.trim().length < 3}
                  onPress={() => run(reportPerson(otherId, reason, id), 'Thank you. Your report was sent.')}
                />
                <TextButton title="Cancel" onPress={() => setReporting(false)} />
              </View>
            </View>
          )}
        </View>
      )}

      <Chat key={id} direct={id} closed={blocked ? 'You blocked this person. Unblock them to write again.' : undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  grow: { flex: 1, minWidth: 0 },
  menu: { paddingHorizontal: 16, paddingVertical: 12, gap: Spacing.two, borderBottomWidth: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
});
