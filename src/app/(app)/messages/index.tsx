import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Link } from '@/components/go';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, ErrorText, SearchField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { canMessage, startChat, useDirectChats, useMyPeople } from '@/lib/direct';
import { jobText, locale } from '@/lib/i18n';
import { WIDE_SCREEN } from '@/lib/workspace';

/** "14:05" for today, "25 Nov" for earlier days. */
function when(iso: string) {
  const date = new Date(iso);
  const today = date.toDateString() === new Date().toDateString();
  return today
    ? date.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}

/** Private messages: one chat per person. */
export default function MessagesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const wide = useWindowDimensions().width >= WIDE_SCREEN;
  const { chats, loading, error } = useDirectChats();
  const [picking, setPicking] = useState(false);

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        {wide && <ThemedText type="title">Messages</ThemedText>}
        <ThemedText themeColor="textSecondary">
          Private messages with people in your projects and with your connections.
        </ThemedText>
        <Button
          title={picking ? 'Close' : 'New message'}
          icon={picking ? 'x' : 'edit-3'}
          variant={picking ? 'secondary' : 'primary'}
          onPress={() => setPicking(!picking)}
        />
        {picking && (
          <PickPerson
            onPicked={(id) => {
              setPicking(false);
              router.push({ pathname: '/messages/[id]', params: { id } });
            }}
          />
        )}
        <ErrorText>{error}</ErrorText>
        {loading && <ActivityIndicator color={theme.primary} size="large" />}

        {!loading && chats.length === 0 && !picking && (
          <Card tint="backgroundElement">
            <ThemedText themeColor="textSecondary">
              {'No private messages yet. Use "New message" to write to someone.'}
            </ThemedText>
          </Card>
        )}
        {chats.length > 0 && (
          <Card style={{ gap: 0 }}>
            {chats.map((chat, index) => (
              <Link key={chat.conversation_id} href={{ pathname: '/messages/[id]', params: { id: chat.conversation_id } }} asChild>
                <Pressable accessibilityRole="link" accessibilityLabel={`Open the chat with ${chat.full_name}`}>
                  <View style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                    <Avatar name={chat.full_name} size={44} />
                    <View style={styles.grow}>
                      <ThemedText type="bold" raw numberOfLines={1}>
                        {chat.full_name}
                      </ThemedText>
                      {chat.last_deleted ? (
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ fontStyle: 'italic' }}>
                          This message was deleted
                        </ThemedText>
                      ) : chat.last_body ? (
                        <ThemedText type={chat.unread ? 'smallBold' : 'small'} themeColor={chat.unread ? 'text' : 'textSecondary'} raw numberOfLines={1}>
                          {chat.last_body}
                        </ThemedText>
                      ) : (
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          No messages yet
                        </ThemedText>
                      )}
                    </View>
                    <View style={styles.end}>
                      <ThemedText type="small" themeColor="textSecondary" raw>
                        {when(chat.last_at)}
                      </ThemedText>
                      {chat.unread > 0 && (
                        <View accessibilityLabel="Unread messages" style={[styles.badge, { backgroundColor: theme.primary }]}>
                          <ThemedText type="smallBold" raw style={{ color: theme.onPrimary, fontSize: 13, lineHeight: 18 }}>
                            {chat.unread}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              </Link>
            ))}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

/** Pick who to write to: people in my projects and my connections. */
function PickPerson({ onPicked }: { onPicked: (conversationId: string) => void }) {
  const theme = useTheme();
  const { people, loading, error } = useMyPeople();
  const [query, setQuery] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const words = query.trim().toLocaleLowerCase(locale());
  const shown = people
    .filter(canMessage)
    .filter((p) => !words || `${p.full_name} ${p.company_name ?? ''} ${p.position ?? ''}`.toLocaleLowerCase(locale()).includes(words));

  async function pick(userId: string) {
    setBusy(userId);
    const chat = await startChat(userId);
    setBusy(null);
    setFailed(chat.error);
    if (chat.id) onPicked(chat.id);
  }

  return (
    <Card tint="sky">
      <ThemedText type="bold">Who do you want to write to?</ThemedText>
      <SearchField value={query} onChangeText={setQuery} placeholder="Search people" />
      <ErrorText>{failed ?? error}</ErrorText>
      {loading && <ActivityIndicator color={theme.primary} />}
      {!loading && shown.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Nobody found. You can message people in your projects and your connections.
        </ThemedText>
      )}
      {shown.map((person) => (
        <Pressable
          key={person.user_id}
          accessibilityRole="button"
          accessibilityLabel={`Write to ${person.full_name}`}
          disabled={busy !== null}
          onPress={() => pick(person.user_id)}
          style={({ pressed }) => [styles.pick, { opacity: pressed || busy === person.user_id ? 0.6 : 1 }]}>
          <Avatar name={person.full_name} size={36} />
          <View style={styles.grow}>
            <ThemedText type="bold" raw numberOfLines={1}>
              {person.full_name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {jobText(person.position, person.company_name)}
            </ThemedText>
          </View>
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.three, alignItems: 'center' },
  column: { width: '100%', maxWidth: 720, gap: Spacing.three },
  grow: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  end: { alignItems: 'flex-end', gap: 4 },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
});
