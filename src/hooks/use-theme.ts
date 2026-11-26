import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePrefs } from '@/lib/prefs';

/** Day or night colours: the person's choice in Settings, or else what the device uses. */
export function useTheme() {
  const scheme = useColorScheme();
  const { mode } = usePrefs();
  const theme = (mode === 'system' ? scheme : mode) === 'dark' ? 'dark' : 'light';

  return Colors[theme];
}
