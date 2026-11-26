/**
 * Look and feel: pastel tones with light peach as the main colour,
 * larger text and icons (decided by Deniz).
 */

import '@/global.css';

import { Platform } from 'react-native';

// Same palette as the approved prototype.
export const Colors = {
  light: {
    text: '#3B2A24',
    textSecondary: '#7A6157',
    background: '#FFF6EF',
    /** Soft peach surface for quiet buttons and inner boxes. */
    backgroundElement: '#FCE9DC',
    backgroundSelected: '#FFDCC9',
    /** Side menu. */
    rail: '#FFE9DB',
    card: '#FFFFFF',
    border: '#F1DCCD',
    primary: '#C9603E',
    onPrimary: '#FFFFFF',
    danger: '#B5412F',
    lavender: '#ECE6FA',
    lavenderInk: '#5B4C8C',
    mint: '#DCF2E4',
    ok: '#2E7A4E',
    sky: '#E1EEFA',
    skyInk: '#2F5F8A',
    butter: '#FFF0C7',
    warn: '#9A6300',
    bubbleMe: '#FFE2D2',
  },
  dark: {
    text: '#F6E9E1',
    textSecondary: '#C2A99D',
    background: '#1D1613',
    backgroundElement: '#352A25',
    backgroundSelected: '#4A3025',
    rail: '#241B17',
    card: '#28201C',
    border: '#41332C',
    primary: '#F4A585',
    onPrimary: '#2A140B',
    danger: '#F0857B',
    lavender: '#332C47',
    lavenderInk: '#CFC3F4',
    mint: '#1E3427',
    ok: '#8FD3A8',
    sky: '#22313F',
    skyInk: '#A9CCEC',
    butter: '#3C3018',
    warn: '#F2C766',
    bubbleMe: '#4A3025',
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

export const Radius = { small: 10, medium: 12, large: 16 } as const;

/** Headings use Sora, everything else Manrope, as in the prototype. */
export const Type = {
  body: 'Manrope_500Medium',
  bodyBold: 'Manrope_700Bold',
  bodyHeavy: 'Manrope_800ExtraBold',
  head: 'Sora_600SemiBold',
  headBold: 'Sora_700Bold',
} as const;

export const MaxContentWidth = 760;
/** Dashboards with a side column. */
export const WideContentWidth = 1180;
