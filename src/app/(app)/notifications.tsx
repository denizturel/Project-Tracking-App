import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Icon, TextButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { locale } from '@/lib/i18n';
import { noticeIcon, noticeTarget, noticeText, useNotifications } from '@/lib/notifications';
import { WIDE_SCREEN } from '@/lib/workspace';

const when = (iso: string) =>
  new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Everything that happened to you: added somewhere, a connection request, a task, a solution. Pressing one opens it. */
export default function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const wide = useWindowDimensions().width >= WIDE_SCREEN;
  const { notices, unread, loading, read, readAll } = useNotifications();

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.column}>
        <View style={styles.line}>
          {wide && (
            <ThemedText type="title" style={styles.grow}>
              Notifications
            </ThemedText>
          )}
          {!wide && <View style={styles.grow} />}
          {unread > 0 && <TextButton title="Mark all as read" onPress={readAll} />}
        </View>
        {loading && <ActivityIndicator color={theme.primary} size="large" />}
        {!loading && notices.length === 0 && (
          <Card>
            <ThemedText themeColor="textSecondary">
              Nothing yet. You will see here when someone invites you to a company, adds you to a project, group or team, or wants to connect with you.
            </ThemedText>
          </Card>
        )}
        {notices.length > 0 && (
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {notices.map((notice, index) => (
              <Pressable
                key={notice.id}
                accessibilityRole="button"
                onPress={() => {
                  read(notice.id);
                  router.push(noticeTarget(notice) as never);
                }}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                  { opacity: pressed ? 0.6 : 1 },
                ]}>
                <View style={[styles.icon, { backgroundColor: notice.read_at ? theme.background : theme.backgroundSelected }]}>
                  <Icon name={noticeIcon(notice.kind)} size={20} color={notice.read_at ? 'textSecondary' : 'primary'} />
                </View>
                <View style={styles.grow}>
                  <ThemedText type={notice.read_at ? 'default' : 'bold'}>{noticeText(notice)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" raw>
                    {when(notice.created_at)}
                  </ThemedText>
                </View>
                {!notice.read_at && <View style={[styles.dot, { backgroundColor: theme.primary }]} />}
                <Icon name="chevron-right" size={18} color="textSecondary" />
              </Pressable>
            ))}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.three, alignItems: 'center' },
  column: { width: '100%', maxWidth: 720, gap: Spacing.three },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 28 },
  grow: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
