import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, ErrorText, Icon, Pill, TextButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { acceptConnection, removeConnection, useMyPeople } from '@/lib/direct';
import { jobText, locale } from '@/lib/i18n';
import { useLiveVersion } from '@/lib/live';
import { isInvitation, type Notice, noticeIcon, noticeTarget, noticeText, useNotifications } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';
import { useWorkspace, WIDE_SCREEN } from '@/lib/workspace';

const when = (iso: string) =>
  new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

type MyInvite = { id: string; company_id: string; company_name: string; role: string; by_name: string | null };
type Part = 'invitations' | 'other';

/**
 * Two lists (Deniz, 2026-11-27): invitations and connections, which wait for an answer, and everything else
 * that happened to you (added somewhere, a task, a solution). Invitations are answered here and nowhere else.
 */
export default function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const wide = useWindowDimensions().width >= WIDE_SCREEN;
  const { notices, unread, loading, read, readAll } = useNotifications();
  const { reload: reloadWorkspace } = useWorkspace();
  const live = useLiveVersion();

  // Company invitations that wait for my answer. A new one arrives with a notification, so the list is asked again then.
  const invites = useRows<MyInvite>(`notifications1:${notices.length}:${live}`, () =>
    supabase.rpc('my_company_invites') as unknown as PromiseLike<{ data: MyInvite[] | null; error: { message: string } | null }>,
  );
  const { people, reload: reloadPeople } = useMyPeople();
  const requests = people.filter((person) => person.connection === 'received');
  const waiting = invites.rows.length + requests.length;

  // A request that waits is shown as a card with Accept and Decline, so its notification is not listed a second time.
  const asks = notices.filter((notice) => notice.kind === 'company_invite' || notice.kind === 'connection_request');
  const invitationNotices = notices.filter((notice) => isInvitation(notice) && !asks.includes(notice));
  const otherNotices = notices.filter((notice) => !isInvitation(notice));
  const unreadOther = otherNotices.filter((notice) => !notice.read_at).length;

  // Opens on the list that needs an answer; after that it stays where the person put it.
  const [chosen, setChosen] = useState<Part | null>(null);
  const part: Part = chosen ?? (waiting > 0 ? 'invitations' : 'other');

  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function answerInvite(invite: MyInvite, accept: boolean) {
    setBusy(invite.id);
    const result = await supabase.rpc('respond_company_invite', { invite: invite.id, accept });
    setBusy(null);
    setFailed(result.error?.message ?? null);
    invites.reload();
    // The notification that brought the invitation is done with.
    notices.filter((n) => n.kind === 'company_invite' && n.payload.invite_id === invite.id && !n.read_at).forEach((n) => read(n.id));
    if (result.error || !accept) return;
    reloadWorkspace();
    router.push({ pathname: '/company/[id]', params: { id: invite.company_id } });
  }

  async function answerRequest(connectionId: string, userId: string, accept: boolean) {
    setBusy(connectionId);
    const result = await (accept ? acceptConnection(connectionId) : removeConnection(connectionId));
    setBusy(null);
    setFailed(result.error?.message ?? null);
    reloadPeople();
    notices.filter((n) => n.kind === 'connection_request' && n.payload.by === userId && !n.read_at).forEach((n) => read(n.id));
  }

  const list = (rows: Notice[]) => (
    <Card style={{ gap: 0, paddingVertical: 4 }}>
      {rows.map((notice, index) => (
        <Pressable
          key={notice.id}
          accessibilityRole="button"
          onPress={() => {
            read(notice.id);
            const target = noticeTarget(notice);
            if (target.pathname !== '/notifications') router.push(target as never);
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
          {noticeTarget(notice).pathname !== '/notifications' && <Icon name="chevron-right" size={18} color="textSecondary" />}
        </Pressable>
      ))}
    </Card>
  );

  const tab = (value: Part, title: string, count: number) => {
    const active = part === value;
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        onPress={() => {
          setChosen(value);
          // Looking at the invitations counts as having seen them.
          if (value === 'invitations') asks.filter((notice) => !notice.read_at).forEach((notice) => read(notice.id));
        }}
        style={[styles.tab, { backgroundColor: active ? theme.card : 'transparent', borderColor: active ? theme.border : 'transparent' }]}>
        <ThemedText type="bold" themeColor={active ? 'text' : 'textSecondary'} numberOfLines={2} style={styles.tabText}>
          {title}
        </ThemedText>
        {count > 0 && <Pill text={String(count)} tone="accent" />}
      </Pressable>
    );
  };

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

        <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: theme.backgroundElement }]}>
          {tab('invitations', 'Invitations and connections', waiting)}
          {tab('other', 'Other notifications', unreadOther)}
        </View>

        <ErrorText>{failed}</ErrorText>
        {loading && <ActivityIndicator color={theme.primary} size="large" />}

        {part === 'invitations' && (
          <>
            {invites.rows.map((invite) => (
              <Card key={invite.id} tint="butter">
                <View style={styles.ask}>
                  <View style={[styles.icon, { backgroundColor: theme.card }]}>
                    <Icon name="briefcase" size={20} color="primary" />
                  </View>
                  <ThemedText style={styles.grow}>
                    {invite.role === 'guest'
                      ? `${invite.by_name ?? 'Someone'} invited you to the company ${invite.company_name} as a guest`
                      : `${invite.by_name ?? 'Someone'} invited you to the company ${invite.company_name}`}
                  </ThemedText>
                </View>
                <View style={styles.buttons}>
                  <Button title="Accept" small inline onPress={() => answerInvite(invite, true)} loading={busy === invite.id} />
                  <Button title="Decline" small inline variant="plain" onPress={() => answerInvite(invite, false)} disabled={busy === invite.id} />
                </View>
              </Card>
            ))}
            {requests.map((person) => (
              <Card key={person.user_id} tint="sky">
                <View style={styles.ask}>
                  <Avatar name={person.full_name} size={40} />
                  <View style={styles.grow}>
                    <ThemedText>{`${person.full_name} wants to connect with you`}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {jobText(person.position, person.company_name)}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.buttons}>
                  <Button
                    title="Accept"
                    small
                    inline
                    onPress={() => answerRequest(person.connection_id as string, person.user_id, true)}
                    loading={busy === person.connection_id}
                  />
                  <Button
                    title="Decline"
                    small
                    inline
                    variant="plain"
                    onPress={() => answerRequest(person.connection_id as string, person.user_id, false)}
                    disabled={busy === person.connection_id}
                  />
                </View>
              </Card>
            ))}
            {!loading && waiting === 0 && invitationNotices.length === 0 && (
              <Card>
                <ThemedText themeColor="textSecondary">
                  No invitations. When someone invites you to a company or wants to connect with you, you answer it here.
                </ThemedText>
              </Card>
            )}
            {invitationNotices.length > 0 && list(invitationNotices)}
          </>
        )}

        {part === 'other' && (
          <>
            {!loading && otherNotices.length === 0 && (
              <Card>
                <ThemedText themeColor="textSecondary">
                  Nothing yet. You will see here when someone adds you to a project, group or team, gives you a task or answers your question.
                </ThemedText>
              </Card>
            )}
            {otherNotices.length > 0 && list(otherNotices)}
          </>
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
  tabs: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 10, minHeight: 48 },
  tabText: { flexShrink: 1, textAlign: 'center' },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buttons: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
});
