import Feather from '@expo/vector-icons/Feather';
import { type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing, type ThemeColor, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Full-height scrolling page with the peach background and a centred column. */
export function Screen({ children, centered }: { children: ReactNode; centered?: boolean }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, centered && styles.centered]}>
          <View style={styles.column}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ style, tint, ...rest }: ViewProps & { tint?: ThemeColor }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme[tint ?? 'card'], borderColor: theme.border },
        styles.shadow,
        style,
      ]}
      {...rest}
    />
  );
}

export type IconName = ComponentProps<typeof Feather>['name'];

/** Line icons, a little larger than usual (decided by Deniz). */
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: ThemeColor }) {
  const theme = useTheme();
  return <Feather name={name} size={size} color={theme[color ?? 'textSecondary']} />;
}

const TONES = {
  lavender: ['lavender', 'lavenderInk'],
  sky: ['sky', 'skyInk'],
  ok: ['mint', 'ok'],
  warn: ['butter', 'warn'],
  accent: ['backgroundSelected', 'primary'],
  plain: ['backgroundElement', 'textSecondary'],
} as const;
export type Tone = keyof typeof TONES;

/** Small rounded tag: who asked, who solved, due dates, places. */
export function Chip({ text, tone = 'lavender', icon }: { text: string; tone?: Tone; icon?: IconName }) {
  const theme = useTheme();
  const [background, ink] = TONES[tone];
  return (
    <View style={[styles.chip, { backgroundColor: theme[background] }]}>
      {icon && <Feather name={icon} size={14} color={theme[ink]} />}
      <ThemedText type="smallBold" style={{ color: theme[ink], fontSize: 14, lineHeight: 19 }}>
        {text}
      </ThemedText>
    </View>
  );
}

const AVATAR_COLORS = ['#8E7CC3', '#5B9BD5', '#A89A4E', '#D07A5A', '#5FA587', '#C06C84'];

/** Round badge with a person's initials. */
export function Avatar({ name, size = 40 }: { name: string | null | undefined; size?: number }) {
  const words = (name ?? '?').trim().split(/\s+/);
  const initials = ((words[0]?.[0] ?? '?') + (words.length > 1 ? (words[words.length - 1][0] ?? '') : '')).toUpperCase();
  let sum = 0;
  for (const letter of name ?? '') sum += letter.charCodeAt(0);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: AVATAR_COLORS[sum % AVATAR_COLORS.length],
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <ThemedText style={{ color: '#FFFFFF', fontFamily: Type.bodyBold, fontSize: size * 0.34, lineHeight: size * 0.5 }}>
        {initials}
      </ThemedText>
    </View>
  );
}

type ButtonProps = {
  title: string;
  icon?: IconName;
  /** As wide as its text instead of the full row. */
  inline?: boolean;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'plain';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, icon, inline, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const theme = useTheme();
  const off = disabled || loading;
  const background =
    variant === 'primary' ? theme.primary : variant === 'secondary' ? theme.backgroundElement : 'transparent';
  const color = variant === 'primary' ? theme.onPrimary : variant === 'secondary' ? theme.text : theme.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        inline && styles.inline,
        { backgroundColor: background, opacity: off ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {icon && <Feather name={icon} size={19} color={color} />}
          <ThemedText type="bold" style={{ color }}>
            {title}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, required, ...rest }: TextInputProps & { label: string; required?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
        {required ? ' *' : ''}
      </ThemedText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { backgroundColor: theme.card, borderColor: theme.border, color: theme.text },
        ]}
        {...rest}
      />
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1 },
  scroll: { flexGrow: 1, padding: Spacing.three, alignItems: 'center' },
  centered: { justifyContent: 'center' },
  column: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  card: {
    borderRadius: Radius.large,
    borderWidth: 1,
    padding: 20,
    gap: Spacing.three,
  },
  inline: { alignSelf: 'flex-start' },
  shadow: { boxShadow: '0 2px 10px rgba(150, 80, 40, 0.05)' },
  button: {
    minHeight: 48,
    borderRadius: Radius.medium,
    paddingHorizontal: 18,
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 11,
  },
  field: { gap: Spacing.one },
  input: {
    minHeight: 48,
    borderRadius: Radius.small,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 17,
    fontFamily: Type.body,
  },
});

/** Small text button for actions inside a row (Edit, Remove, Make admin). */
export function TextButton(props: { title: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      hitSlop={8}
      style={({ pressed }) => ({ opacity: props.disabled ? 0.4 : pressed ? 0.6 : 1, paddingVertical: Spacing.one })}>
      <ThemedText type="smallBold" style={{ color: props.danger ? theme.danger : theme.primary }}>
        {props.title}
      </ThemedText>
    </Pressable>
  );
}

/** "Edited by <name>" label shown under anything that was edited (decided by Deniz). */
export function EditedLabel({ name, at }: { name: string | null; at: string | null }) {
  if (!at) return null;
  return (
    <ThemedText type="small" themeColor="textSecondary" style={{ fontStyle: 'italic' }}>
      Edited{name ? ` by ${name}` : ''}
    </ThemedText>
  );
}

export function ComingNext({ what }: { what: string }) {
  return (
    <Card tint="butter">
      <ThemedText type="bold">{what} is coming next</ThemedText>
      <ThemedText themeColor="textSecondary">
        This part of the app is designed and its place in the database is ready. The screen is not
        built yet.
      </ThemedText>
    </Card>
  );
}
