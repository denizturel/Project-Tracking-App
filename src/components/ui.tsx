import Feather from '@expo/vector-icons/Feather';
import { type ComponentProps, type ComponentRef, type ReactNode, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing, type ThemeColor, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';

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
  /** Compact, for buttons inside cards and page headers. Always as wide as its text. */
  small?: boolean;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'plain';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, icon, inline, small, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
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
        (inline || small) && styles.inline,
        small && styles.buttonSmall,
        { backgroundColor: background, opacity: off ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {icon && <Feather name={icon} size={small ? 17 : 19} color={color} />}
          <ThemedText type="bold" style={{ color }}>
            {title}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, required, secureTextEntry, ...rest }: TextInputProps & { label: string; required?: boolean }) {
  const theme = useTheme();
  // Password boxes get an eye button: press to see what was typed, press again to hide it.
  const [visible, setVisible] = useState(false);
  const input = (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={theme.textSecondary}
      style={[
        styles.input,
        { backgroundColor: theme.card, borderColor: theme.border, color: theme.text },
        secureTextEntry && styles.inputWithEye,
      ]}
      {...rest}
      secureTextEntry={secureTextEntry && !visible}
      placeholder={rest.placeholder ? tr(rest.placeholder) : undefined}
    />
  );
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
        {required ? ' *' : ''}
      </ThemedText>
      {secureTextEntry ? (
        <View>
          {input}
          <View style={styles.eye}>
            <IconButton
              icon={visible ? 'eye-off' : 'eye'}
              label={visible ? 'Hide password' : 'Show password'}
              onPress={() => setVisible(!visible)}
              color="textSecondary"
            />
          </View>
        </View>
      ) : (
        input
      )}
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
  buttonSmall: { minHeight: 40, paddingHorizontal: 14, borderRadius: Radius.small },
  seg: { flexDirection: 'row', flexWrap: 'wrap', maxWidth: '100%', borderRadius: 12, padding: 4, gap: 2, alignSelf: 'flex-start' },
  segItem: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 9, flexShrink: 1 },
  more: {
    position: 'absolute',
    minWidth: 190,
    maxWidth: 300,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  moreRow: { minHeight: 46, justifyContent: 'center', paddingHorizontal: Spacing.three + 4 },
  iconButton: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flexShrink: 1, maxWidth: '100%' },
  choice: { borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 15 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 54 },
  searchInput: { flex: 1, fontSize: 17, fontFamily: Type.body, paddingVertical: 10, outlineStyle: 'none' } as never,
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, minWidth: 24, alignItems: 'center' },
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
  inputWithEye: { paddingRight: 52 },
  eye: { position: 'absolute', right: 4, top: 0, bottom: 0, justifyContent: 'center' },
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

/** A row of choices where one is picked (List, Timeline, Calendar). */
export function Segmented<T extends string>(props: { options: readonly T[]; value: T; onChange: (value: T) => void }) {
  const theme = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.seg, { backgroundColor: theme.backgroundElement }]}>
      {props.options.map((option) => {
        const active = option === props.value;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => props.onChange(option)}
            style={[styles.segItem, active && [{ backgroundColor: theme.card }, styles.shadow]]}>
            <ThemedText type="bold" themeColor={active ? 'text' : 'textSecondary'}>
              {option}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A button that is only an icon, with its meaning as the label for screen readers. */
export function IconButton(props: { icon: IconName; label: string; onPress: () => void; color?: ThemeColor; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, { opacity: props.disabled ? 0.3 : pressed ? 0.6 : 1 }]}>
      <Icon name={props.icon} size={19} color={props.color} />
    </Pressable>
  );
}

export type MenuAction = { title: string; onPress: () => void; danger?: boolean; disabled?: boolean; confirm?: boolean };

/**
 * The three-dots button: Edit, Delete and the like stay behind it until it is pressed.
 * An action with `confirm` asks once more before it runs.
 */
export function MoreMenu({ actions, label = 'More actions' }: { actions: (MenuAction | false | null | undefined)[]; label?: string }) {
  const theme = useTheme();
  const screen = useWindowDimensions();
  const anchor = useRef<ComponentRef<typeof View>>(null);
  // Where the button is on the screen while the menu is open; the menu drops from there.
  const [at, setAt] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const shown = actions.filter((a): a is MenuAction => !!a);
  if (shown.length === 0) return null;
  const close = () => {
    setAt(null);
    setSure(null);
  };
  const open = () => anchor.current?.measureInWindow((x: number, y: number, width: number, height: number) => setAt({ x, y, width, height }));
  // Near the bottom of the screen the menu opens upwards, so it is never cut off.
  const upwards = !!at && at.y > screen.height - (shown.length * 48 + 40);

  return (
    <View ref={anchor} collapsable={false}>
      <IconButton icon="more-vertical" label={label} onPress={open} />
      <Modal visible={!!at} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        {at && (
          <View
            style={[
              styles.more,
              { backgroundColor: theme.card, borderColor: theme.border, right: Math.max(8, screen.width - at.x - at.width) },
              upwards ? { bottom: screen.height - at.y + 4 } : { top: at.y + at.height + 4 },
            ]}>
            {shown.map((action) => (
              <Pressable
                key={action.title}
                accessibilityRole="button"
                disabled={action.disabled}
                onPress={() => {
                  if (action.confirm && sure !== action.title) {
                    setSure(action.title);
                    return;
                  }
                  close();
                  action.onPress();
                }}
                style={({ pressed }) => [styles.moreRow, { opacity: action.disabled ? 0.4 : pressed ? 0.6 : 1 }]}>
                <ThemedText type="smallBold" style={{ color: action.danger ? theme.danger : theme.text }}>
                  {sure === action.title ? 'Yes, I am sure' : action.title}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}
      </Modal>
    </View>
  );
}

/** Small rounded count next to a tab or menu row. */
export function Pill({ text, tone = 'plain' }: { text: string; tone?: Tone }) {
  const theme = useTheme();
  const [background, ink] = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: theme[background] }]}>
      <ThemedText type="smallBold" style={{ color: theme[ink], fontSize: 13, lineHeight: 20 }}>
        {text}
      </ThemedText>
    </View>
  );
}

/** Round filter buttons; the chosen one is filled (Open, Done, All). */
export function Choices<T extends string>(props: {
  options: readonly (T | { value: T; label: string })[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.choices}>
      {props.options.map((option) => {
        const value = typeof option === 'string' ? option : option.value;
        const label = typeof option === 'string' ? option : option.label;
        const active = value === props.value;
        return (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => props.onChange(value)}
            style={[
              styles.choice,
              { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border },
            ]}>
            <ThemedText type="smallBold" style={{ color: active ? theme.onPrimary : theme.textSecondary }}>
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Search box with a magnifier, as in the prototype. */
export function SearchField(props: { value: string; onChangeText: (text: string) => void; placeholder: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Icon name="search" />
      <TextInput
        accessibilityLabel={props.placeholder}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={tr(props.placeholder)}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        style={[styles.searchInput, { color: theme.text }]}
      />
      {!!props.value && <IconButton icon="x" label="Clear search" onPress={() => props.onChangeText('')} />}
    </View>
  );
}
