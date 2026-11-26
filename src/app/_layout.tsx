import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { LockScreen } from '@/components/lock-screen';
import { useTheme } from '@/hooks/use-theme';
import { AppLockProvider, useAppLock } from '@/lib/app-lock';
import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <AppLockProvider>
        <RootNavigator />
      </AppLockProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { loading, session, profile } = useAuth();
  const theme = useTheme();
  const { locked } = useAppLock();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  const signedIn = !!session;
  // Company and position are required before anyone can continue (decided by Deniz).
  const ready = signedIn && !!profile?.profile_complete;

  return (
    <>
      <Screens signedIn={signedIn} ready={ready} theme={theme} />
      {signedIn && locked && <LockScreen />}
    </>
  );
}

function Screens({
  signedIn,
  ready,
  theme,
}: {
  signedIn: boolean;
  ready: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.backgroundElement },
        headerTintColor: theme.text,
        headerTitleStyle: { fontSize: 20, fontWeight: 700 },
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !ready}>
        <Stack.Screen name="work-details" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
