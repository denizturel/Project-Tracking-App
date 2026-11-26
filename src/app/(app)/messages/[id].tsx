import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Chat } from '@/components/space/chat';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Icon } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useDirectChats } from '@/lib/direct';
import { WIDE_SCREEN } from '@/lib/workspace';

/** A private chat between two people. */
export default function DirectChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const wide = useWindowDimensions().width >= WIDE_SCREEN;
  const { chats } = useDirectChats(id);
  const other = chats.find((chat) => chat.conversation_id === id);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: other?.full_name ?? 'Messages' }} />
      {/* Phones show the person's name in the top bar already. */}
      {wide && (
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <Link href="/messages" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel="Back to messages" hitSlop={8}>
            <Icon name="chevron-left" />
          </Pressable>
        </Link>
        <Avatar name={other?.full_name} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <ThemedText type="bold" raw numberOfLines={1}>
            {other?.full_name ?? ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" raw={!!other?.position} numberOfLines={1}>
            {other?.position ?? 'Private chat'}
          </ThemedText>
        </View>
        <Icon name="lock" size={18} color="textSecondary" />
      </View>
      )}
      <Chat key={id} direct={id} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
});
