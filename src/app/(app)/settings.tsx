import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, Icon, type IconName } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppLock } from '@/lib/app-lock';
import { useAuth } from '@/lib/auth';
import { WIDE_SCREEN } from '@/lib/workspace';
import { supabase } from '@/lib/supabase';

/** Settings: security and password (change password, phone unlock, delete account) and sign out. */
export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const [security, setSecurity] = useState(false);
  const wide = useWindowDimensions().width >= WIDE_SCREEN;

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        {wide && <ThemedText type="title">Settings</ThemedText>}

        <Card style={styles.list}>
          <MenuRow
            icon="lock"
            title="Security and password"
            hint="Change your password, phone unlock, delete your account"
            open={security}
            onPress={() => setSecurity(!security)}
          />
        </Card>
        {security && <Security />}

        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Signed in as {session?.user.email}
          </ThemedText>
          <Button title="Sign out" icon="log-out" variant="secondary" onPress={signOut} />
        </Card>
      </View>
    </ScrollView>
  );
}

function MenuRow(props: { icon: IconName; title: string; hint: string; open: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: props.open }}
      onPress={props.onPress}
      style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.6 : 1 }]}>
      <Icon name={props.icon} size={24} color="primary" />
      <View style={styles.grow}>
        <ThemedText type="bold">{props.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {props.hint}
        </ThemedText>
      </View>
      <Icon name={props.open ? 'chevron-up' : 'chevron-right'} size={20} />
    </Pressable>
  );
}

function Security() {
  const theme = useTheme();
  const { session, signOut } = useAuth();
  const lock = useAppLock();
  const [lockError, setLockError] = useState<string | null>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const email = session?.user.email ?? '';
  const mismatch = !!again && next !== again;
  const canChange = !!current && next.length >= 8 && next === again;

  async function changePassword() {
    setBusy(true);
    setError(null);
    setChanged(false);
    // Asking for the current password stops someone who picks up an unlocked phone from taking the account.
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) {
      setError('The current password is not right.');
      setBusy(false);
      return;
    }
    const { error: failed } = await supabase.auth.updateUser({ password: next });
    if (failed) setError(failed.message);
    else {
      setChanged(true);
      setCurrent('');
      setNext('');
      setAgain('');
    }
    setBusy(false);
  }

  async function deleteAccount() {
    setDeleteBusy(true);
    setDeleteError(null);
    const { error: failed } = await supabase.rpc('delete_my_account');
    if (failed) {
      setDeleteError(failed.message);
      setDeleteBusy(false);
      return;
    }
    await signOut();
  }

  return (
    <>
      <Card>
        <ThemedText type="heading">Change password</ThemedText>
        <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
        <Field label="New password (at least 8 characters)" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
        <Field label="New password again" value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" />
        <ErrorText>{mismatch ? 'The two new passwords are not the same.' : error}</ErrorText>
        {changed && (
          <ThemedText type="small" themeColor="textSecondary">
            Your password is changed.
          </ThemedText>
        )}
        <Button title="Change password" onPress={changePassword} loading={busy} disabled={!canChange} />
      </Card>

      {lock.available && (
        <Card>
          <ThemedText type="heading">Unlock with {lock.method}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Ask for {lock.method} each time the app is opened on this phone.
          </ThemedText>
          <ErrorText>{lockError}</ErrorText>
          <Button
            title={lock.enabled ? `Turn off ${lock.method} unlock` : `Turn on ${lock.method} unlock`}
            variant="secondary"
            onPress={async () => setLockError(await lock.setEnabled(!lock.enabled))}
          />
        </Card>
      )}

      <Card style={{ borderColor: theme.danger }}>
        <ThemedText type="heading">Delete account</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          This erases your sign-in and your personal details and takes you out of every company, project, group and
          team. It cannot be undone. Messages, questions and solutions you wrote stay for your team, shown as
          &quot;Deleted user&quot;.
        </ThemedText>
        {!deleting && <Button title="Delete my account" icon="trash-2" variant="secondary" onPress={() => setDeleting(true)} />}
        {deleting && (
          <>
            <Field label="Type DELETE to confirm" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" />
            <ErrorText>{deleteError}</ErrorText>
            <View style={styles.buttons}>
              <Button title="Cancel" variant="secondary" inline onPress={() => setDeleting(false)} disabled={deleteBusy} />
              <Button
                title="Delete forever"
                inline
                onPress={deleteAccount}
                loading={deleteBusy}
                disabled={confirm.trim().toUpperCase() !== 'DELETE'}
              />
            </View>
          </>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.three, alignItems: 'center' },
  column: { width: '100%', maxWidth: 640, gap: Spacing.three },
  list: { paddingVertical: Spacing.one },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  grow: { flex: 1, minWidth: 0 },
  buttons: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
});
