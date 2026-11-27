import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEY = 'doneva-join';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Finds the invite code in whatever was pasted: the code itself or a whole link. */
export function tokenFrom(text: string): string | null {
  return UUID.exec(text)?.[0].toLowerCase() ?? null;
}

/** The link that opens the app on a phone. This is what the QR code holds. */
export const appLink = (token: string) => `projecttrackingapp://join/${token}`;

const WEBSITE = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/+$/, '');

/**
 * The link to share and to put in the QR code: the join page of the website,
 * which works in any browser, with or without the app installed.
 */
export function shareLink(token: string) {
  // On the website itself, its own address is used (a link to this computer, localhost, is of no use to anyone else).
  const here = Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? window.location.origin : '';
  const site = here || WEBSITE;
  return site ? `${site}/join/${token}` : appLink(token);
}

/** Remembers a link that was opened before signing in, so Home can finish joining afterwards. */
export const savePendingJoin = (token: string) => AsyncStorage.setItem(KEY, token).catch(() => {});

export async function takePendingJoin(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(KEY);
    if (token) await AsyncStorage.removeItem(KEY);
    return token;
  } catch {
    return null;
  }
}
