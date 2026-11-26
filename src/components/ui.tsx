import { type ReactNode } from 'react';
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
import { MaxContentWidth, Radius, Spacing, type ThemeColor } from '@/constants/theme';
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
        style,
      ]}
      {...rest}
    />
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'plain';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
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
        { backgroundColor: background, opacity: off ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText type="bold" style={{ color }}>
          {title}
        </ThemedText>
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
    padding: Spacing.four,
    gap: Spacing.three,
  },
  button: {
    minHeight: 54,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { gap: Spacing.one },
  input: {
    minHeight: 54,
    borderRadius: Radius.medium,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 17,
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
