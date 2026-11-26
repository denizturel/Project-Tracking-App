import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Face or fingerprint unlock on phones. It is a lock on this device only: the
 * account stays signed in, and the app asks for a face or fingerprint when it
 * opens or comes back from the background. Not available on the website.
 */

const STORAGE_KEY = 'app-lock-enabled';

type AppLockValue = {
  /** The phone has a face or fingerprint set up. */
  available: boolean;
  /** "Face ID", "Fingerprint" or a general word, for labels. */
  method: string;
  enabled: boolean;
  locked: boolean;
  /** Turns the lock on or off. Asks for a face or fingerprint first. Returns an error text or null. */
  setEnabled: (next: boolean) => Promise<string | null>;
  /** Asks for a face or fingerprint and opens the app when it matches. */
  unlock: () => Promise<void>;
};

const AppLockContext = createContext<AppLockValue | null>(null);

export function useAppLock() {
  const value = use(AppLockContext);
  if (!value) throw new Error('useAppLock must be used inside <AppLockProvider>');
  return value;
}

async function readSetup() {
  if (Platform.OS === 'web')
    return { available: false, method: 'Face or fingerprint', enabled: false };
  const [hardware, enrolled, types, saved] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
    AsyncStorage.getItem(STORAGE_KEY),
  ]);
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  const method =
    face && !finger
      ? Platform.OS === 'ios'
        ? 'Face ID'
        : 'Face unlock'
      : finger && !face
        ? Platform.OS === 'ios'
          ? 'Touch ID'
          : 'Fingerprint'
        : 'Face or fingerprint';
  const available = hardware && enrolled;
  return { available, method, enabled: available && saved === 'yes' };
}

async function ask(promptMessage: string) {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage });
  return result.success;
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(false);
  const [method, setMethod] = useState('Face or fingerprint');
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let active = true;
    readSetup()
      .catch(() => ({ available: false, method: 'Face or fingerprint', enabled: false }))
      .then((setup) => {
        if (!active) return;
        setAvailable(setup.available);
        setMethod(setup.method);
        setEnabledState(setup.enabled);
        setLocked(setup.enabled);
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Lock again each time the app goes to the background.
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') setLocked(true);
    });
    return () => sub.remove();
  }, [enabled]);

  const unlock = useCallback(async () => {
    if (await ask('Unlock Doneva')) setLocked(false);
  }, []);

  const setEnabled = useCallback(
    async (next: boolean) => {
      if (!available) return 'Set up a face or fingerprint in your phone settings first.';
      const confirmed = await ask(next ? `Turn on ${method} unlock` : `Turn off ${method} unlock`);
      if (!confirmed) return 'That did not match, so nothing was changed.';
      await AsyncStorage.setItem(STORAGE_KEY, next ? 'yes' : 'no');
      setEnabledState(next);
      return null;
    },
    [available, method],
  );

  const value = useMemo(
    () => ({ available, method, enabled, locked, setEnabled, unlock }),
    [available, method, enabled, locked, setEnabled, unlock],
  );

  // Nothing is shown until we know whether the app must start locked.
  if (!ready) return null;
  return <AppLockContext value={value}>{children}</AppLockContext>;
}
