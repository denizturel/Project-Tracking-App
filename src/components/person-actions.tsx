import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { acceptConnection, askToConnect, canMessage, startChat, useMyPeople } from '@/lib/direct';

/** "Send message" and "Connect" for one person, as shown on their profile card. */
export function PersonActions({ userId, onLeave }: { userId: string; onLeave?: () => void }) {
  const router = useRouter();
  const { people, loading, reload } = useMyPeople();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const person = people.find((p) => p.user_id === userId);

  if (loading) return null;

  async function message() {
    setBusy(true);
    const chat = await startChat(userId);
    setBusy(false);
    setError(chat.error);
    if (!chat.id) return;
    onLeave?.();
    router.push({ pathname: '/messages/[id]', params: { id: chat.id } });
  }

  async function connect() {
    setBusy(true);
    const result = await (person?.connection === 'received' && person.connection_id
      ? acceptConnection(person.connection_id)
      : askToConnect(userId));
    setBusy(false);
    setError(result.error?.message ?? null);
    reload();
  }

  return (
    <View style={{ gap: Spacing.two }}>
      <ErrorText>{error}</ErrorText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two }}>
        {(!person || canMessage(person)) && (
          <Button title="Send message" icon="message-circle" small onPress={message} disabled={busy} />
        )}
        {person?.connection === 'connected' ? (
          <Chip text="Connected" tone="ok" icon="check" />
        ) : person?.connection === 'sent' ? (
          <Chip text="Connection request sent" tone="plain" icon="clock" />
        ) : (
          <Button
            title={person?.connection === 'received' ? 'Accept connection' : 'Connect'}
            icon="user-plus"
            small
            variant="secondary"
            onPress={connect}
            disabled={busy}
          />
        )}
      </View>
    </View>
  );
}
