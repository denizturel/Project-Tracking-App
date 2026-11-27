import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, Chip, ErrorText, Field, TextButton, MoreMenu } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { acceptConnection, askToConnect, type MyPerson, removeConnection, startChat, unblockPerson, useMyPeople } from '@/lib/direct';
import { Suggestions } from '@/components/suggestions';
import { useAuth } from '@/lib/auth';
import { useUsernameSuggestions } from '@/lib/suggest';
import { jobText } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';
import { WIDE_SCREEN } from '@/lib/workspace';

type Found = Pick<MyPerson, 'user_id' | 'full_name' | 'position' | 'company_name'> & { username?: string | null };
type Result = PromiseLike<{ error: { message: string } | null }>;

/** Your connections: people you can message even without a shared project. */
export default function ConnectionsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const wide = useWindowDimensions().width >= WIDE_SCREEN;
  const { people, loading, error, reload } = useMyPeople();
  const [failed, setFailed] = useState<string | null>(null);
  // Removing takes two presses, so a slip does nothing.
  const { profile, session } = useAuth();
  const blocks = useRows<{ blocked: string; profile: { full_name: string } | null }>(`connections1:blocks`, () =>
    supabase
      .from('user_blocks')
      .select('blocked, profile:profiles!blocked(full_name)')
      .returns<{ blocked: string; profile: { full_name: string } | null }[]>(),
  );
  const [username, setUsername] = useState('');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<Found | 'nobody' | null>(null);

  const received = people.filter((p) => p.connection === 'received');
  const connected = people.filter((p) => p.connection === 'connected');
  const sent = people.filter((p) => p.connection === 'sent');
  const suggested = people.filter((p) => !p.connection && !blocks.rows.some((b) => b.blocked === p.user_id));

  async function run(action: Result) {
    const result = await action;
    setFailed(result.error?.message ?? null);
    reload();
    blocks.reload();
  }

  async function message(userId: string) {
    const chat = await startChat(userId);
    setFailed(chat.error);
    if (chat.id) router.push({ pathname: '/messages/[id]', params: { id: chat.id } });
  }

  // People whose username starts with what is typed, offered while typing.
  const offered = useUsernameSuggestions(username, !found).filter(
    (person) => !people.some((p) => p.user_id === person.user_id && p.connection === 'connected'),
  );

  async function find() {
    setSearching(true);
    const result = await supabase.rpc('find_person_by_username', { name: username });
    setSearching(false);
    if (result.error) {
      // "Nobody found" would be wrong here: the search itself did not run.
      setFailed(result.error.message.includes('permission denied') ? 'Please sign in again and try once more.' : result.error.message);
      setFound(null);
      return;
    }
    setFailed(null);
    setFound(((result.data as Found[] | null) ?? [])[0] ?? 'nobody');
  }

  const line = (person: Found, buttons: React.ReactNode) => (
    <View key={person.user_id} style={styles.row}>
      <Avatar name={person.full_name} size={40} />
      <View style={styles.name}>
        <ThemedText type="bold" raw numberOfLines={1}>
          {person.full_name}
          {!!(person as Found).username && <ThemedText themeColor="textSecondary" raw>{`  @${(person as Found).username}`}</ThemedText>}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {jobText(person.position, person.company_name)}
        </ThemedText>
      </View>
      <View style={styles.buttons}>{buttons}</View>
    </View>
  );

  const foundKnown = found && found !== 'nobody' ? people.find((p) => p.user_id === found.user_id) : undefined;

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        {wide && <ThemedText type="title">Connections</ThemedText>}
        <ThemedText themeColor="textSecondary">
          You can always message people in your projects. Connect with someone to keep messaging them without a shared
          project.
        </ThemedText>
        <ErrorText>{failed ?? error}</ErrorText>
        {loading && <ActivityIndicator color={theme.primary} size="large" />}

        {received.length > 0 && (
          <Card tint="butter">
            <ThemedText type="label">Wants to connect with you</ThemedText>
            {received.map((person) =>
              line(
                person,
                <>
                  <Button title="Accept" small onPress={() => run(acceptConnection(person.connection_id as string))} />
                  <TextButton title="Decline" onPress={() => run(removeConnection(person.connection_id as string))} />
                </>,
              ),
            )}
          </Card>
        )}

        <Card>
          <View style={styles.between}>
            <ThemedText type="label">Your connections</ThemedText>
            <Chip text={String(connected.length)} tone="accent" />
          </View>
          {!loading && connected.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              No connections yet. Add someone below.
            </ThemedText>
          )}
          {connected.map((person) =>
            line(
              person,
              <>
                <Button title="Message" icon="message-circle" small variant="secondary" onPress={() => message(person.user_id)} />
                <MoreMenu
                  actions={[{ title: 'Remove', danger: true, confirm: true, onPress: () => run(removeConnection(person.connection_id as string)) }]}
                />
              </>,
            ),
          )}
        </Card>

        {sent.length > 0 && (
          <Card>
            <ThemedText type="label">Waiting for their answer</ThemedText>
            {sent.map((person) =>
              line(person, <TextButton title="Take back" onPress={() => run(removeConnection(person.connection_id as string))} />),
            )}
          </Card>
        )}

        <Card tint="sky">
          <ThemedText type="subtitle">Add a connection</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Type the person&apos;s username. They get a request and can accept it.
          </ThemedText>
          {!!profile?.username && (
            <ThemedText type="small" themeColor="textSecondary">
              Your own username, to give to others:{' '}
              <ThemedText type="smallBold" themeColor="primary" raw selectable>
                @{profile.username}
              </ThemedText>
            </ThemedText>
          )}
          <Field
            label="Their username"
            value={username}
            onChangeText={(text) => {
              setUsername(text.replace(/\s/g, ''));
              setFound(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={find}
          />
          <Suggestions
            people={offered}
            onPick={(person) => {
              setUsername(person.username ?? '');
              setFailed(null);
              setFound(person);
            }}
          />
          <Button title="Find" icon="search" variant="secondary" onPress={find} loading={searching} disabled={username.replace(/^@+/, '').length < 3} />
          {found === 'nobody' && (
            <ThemedText type="small" themeColor="textSecondary">
              Nobody has this username.
            </ThemedText>
          )}
          {found &&
            found !== 'nobody' &&
            line(
              found,
              foundKnown?.connection === 'connected' ? (
                <Chip text="Connected" tone="ok" icon="check" />
              ) : foundKnown?.connection === 'sent' ? (
                <Chip text="Connection request sent" tone="plain" icon="clock" />
              ) : foundKnown?.connection === 'received' ? (
                <Button title="Accept" small onPress={() => run(acceptConnection(foundKnown.connection_id as string))} />
              ) : (
                <Button title="Connect" icon="user-plus" small onPress={() => run(askToConnect(found.user_id))} />
              ),
            )}
        </Card>

        {blocks.rows.length > 0 && (
          <Card>
            <ThemedText type="label">Blocked people</ThemedText>
            {blocks.rows.map((block) =>
              line(
                { user_id: block.blocked, full_name: block.profile?.full_name ?? '', position: null, company_name: null },
                <TextButton title="Unblock" onPress={() => run(unblockPerson(block.blocked, session?.user.id ?? ''))} />,
              ),
            )}
          </Card>
        )}

        {suggested.length > 0 && (
          <Card>
            <ThemedText type="label">People in your projects</ThemedText>
            {suggested.map((person) =>
              line(person, <Button title="Connect" icon="user-plus" small variant="secondary" onPress={() => run(askToConnect(person.user_id))} />),
            )}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.three, alignItems: 'center' },
  column: { width: '100%', maxWidth: 720, gap: Spacing.three },
  // Wide enough to stay readable: on a narrow phone the buttons move to the next line instead.
  name: { flex: 1, minWidth: 170 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, flexWrap: 'wrap' },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginLeft: 'auto' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
});
