import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePrefs } from '@/lib/prefs';

/** True in night mode, whether chosen in Settings or taken from the device. */
export function useIsDark() {
  const scheme = useColorScheme();
  const { mode } = usePrefs();
  return (mode === 'system' ? scheme : mode) === 'dark';
}

/** Day or night colours: the person's choice in Settings, or else what the device uses. */
export function useTheme() {
  const scheme = useColorScheme();
  const { mode } = usePrefs();
  const theme = (mode === 'system' ? scheme : mode) === 'dark' ? 'dark' : 'light';

  return Colors[theme];
}
