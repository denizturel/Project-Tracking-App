import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppLock } from '@/lib/app-lock';
import { useAuth } from '@/lib/auth';

/** Covers the whole app until the person unlocks with a face or fingerprint. */
export function LockScreen() {
  const theme = useTheme();
  const { method, unlock } = useAppLock();
  const { signOut } = useAuth();

  // Ask straight away, so nobody has to press a button first.
  useEffect(() => {
    unlock();
  }, [unlock]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: theme.background }]}>
      <ThemedText type="title">Doneva</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.text}>
        Locked. Use {method} to open the app.
      </ThemedText>
      <View style={styles.buttons}>
        <Button title={`Unlock with ${method}`} onPress={unlock} />
        <Button title="Sign out instead" variant="plain" onPress={signOut} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  text: { textAlign: 'center' },
  buttons: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.three, maxWidth: 420 },
});
