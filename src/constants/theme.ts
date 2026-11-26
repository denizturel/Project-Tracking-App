/**
 * Look and feel: pastel tones with light peach as the main colour,
 * larger text and icons (decided by Deniz).
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#3B2A22',
    textSecondary: '#7A6257',
    background: '#FFF6F0',
    backgroundElement: '#FFE8DC',
    backgroundSelected: '#FFD3BF',
    card: '#FFFFFF',
    border: '#F3D2C1',
    primary: '#E8825A',
    onPrimary: '#FFFFFF',
    danger: '#C0453A',
    lavender: '#E6DEFA',
    mint: '#D8F2E4',
    sky: '#DCEBFB',
    butter: '#FFF1C2',
  },
  dark: {
    text: '#FBEDE5',
    textSecondary: '#CDB3A6',
    background: '#211815',
    backgroundElement: '#33241E',
    backgroundSelected: '#4A3329',
    card: '#2A1E19',
    border: '#4A3329',
    primary: '#F09A75',
    onPrimary: '#2A1710',
    danger: '#F0857B',
    lavender: '#3A3352',
    mint: '#24443A',
    sky: '#25384D',
    butter: '#4A4020',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { small: 10, medium: 16, large: 24 } as const;

export const MaxContentWidth = 720;
