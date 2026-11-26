import { type Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { type Profile, supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type AuthValue = {
  /** True until the saved session (and its profile) has been read. */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, company_name, position, department, phone, profile_complete, username')
    .eq('id', userId)
    .maybeSingle();
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const shownUser = useRef<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // The same person again (a renewed sign-in, or coming back to the browser tab) must not redraw every page.
      const samePerson = !!next && shownUser.current === next.user.id;
      shownUser.current = next?.user.id ?? null;
      if (!samePerson) setSession(next);
      if (!next) {
        setProfile(null);
        setLoading(false);
        return;
      }
      if (samePerson) return;
      // Deferred: Supabase calls must not run inside this callback.
      setTimeout(async () => {
        setProfile(await fetchProfile(next.user.id));
        setLoading(false);
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Phones: only refresh the session while the app is in the foreground.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    supabase.auth.startAutoRefresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => sub.remove();
  }, []);

  const userId = session?.user.id;

  const refreshProfile = useCallback(async () => {
    if (userId) setProfile(await fetchProfile(userId));
  }, [userId]);

  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      return error?.message ?? null;
    }

    const redirectTo = Linking.createURL('sign-in');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) return error?.message ?? 'Could not start Google sign-in';

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return null;

    const code = Linking.parse(result.url).queryParams?.code;
    if (typeof code !== 'string') return 'Google sign-in did not finish';
    const exchanged = await supabase.auth.exchangeCodeForSession(code);
    return exchanged.error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    // Only this device: signing out here must not throw the same person out of their other devices.
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const value = useMemo(
    () => ({ loading, session, profile, refreshProfile, signInWithGoogle, signOut }),
    [loading, session, profile, refreshProfile, signInWithGoogle, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
