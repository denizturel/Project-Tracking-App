import { Manrope_500Medium, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import Feather from '@expo/vector-icons/Feather';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useEffect } from 'react';

import { LockScreen } from '@/components/lock-screen';
import { useIsDark, useTheme } from '@/hooks/use-theme';
import { AppLockProvider, useAppLock } from '@/lib/app-lock';
import { AuthProvider, useAuth } from '@/lib/auth';
import { usePrefs } from '@/lib/prefs';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
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
  const { lang, ready: prefsReady } = usePrefs();
  const dark = useIsDark();

  const [fontsReady, fontsFailed] = useFonts({
    Manrope_500Medium,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Sora_600SemiBold,
    Sora_700Bold,
    ...Feather.font,
  });
  // If the fonts cannot load, carry on with the phone's own font.
  const waiting = loading || !prefsReady || (!fontsReady && !fontsFailed);

  useEffect(() => {
    if (!waiting) SplashScreen.hideAsync();
  }, [waiting]);

  if (waiting) return null;

  const signedIn = !!session;
  // Company and position are required before anyone can continue (decided by Deniz).
  const ready = signedIn && !!profile?.profile_complete;

  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {/* A new language draws every screen again from the start. */}
      <Fragment key={lang}>
        <Screens signedIn={signedIn} ready={ready} theme={theme} dark={dark} />
        {signedIn && locked && <LockScreen />}
      </Fragment>
    </>
  );
}

function Screens({
  signedIn,
  ready,
  theme,
  dark,
}: {
  dark: boolean;
  signedIn: boolean;
  ready: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Stack
      screenOptions={{
        statusBarStyle: dark ? 'light' : 'dark',
        headerStyle: { backgroundColor: theme.backgroundElement },
        headerTintColor: theme.text,
        headerTitleStyle: { fontSize: 20, fontFamily: 'Sora_600SemiBold' },
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
