import { StyleSheet, Text, type TextProps } from 'react-native';

import { type ThemeColor, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { capitals, trChildren } from '@/lib/i18n';
import { currentLang } from '@/lib/prefs';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'bold' | 'title' | 'subtitle' | 'heading' | 'small' | 'smallBold' | 'link' | 'label' | 'number';
  themeColor?: ThemeColor;
  /** Text typed by a person (a message, a note): shown as written, never translated. */
  raw?: boolean;
};

export function ThemedText({ style, type = 'default', themeColor, raw, children, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const color = theme[themeColor ?? (type === 'link' ? 'primary' : type === 'label' ? 'textSecondary' : 'text')];

  return (
    <Text style={[{ color }, styles[type], type === 'label' && currentLang() === 'tr' && styles.asWritten, style]} {...rest}>
      {raw ? children : type === 'label' ? capitals(trChildren(children)) : trChildren(children)}
    </Text>
  );
}

const styles = StyleSheet.create({
  // Turkish labels are put in capitals by us (i to İ), so the phone must not do it again.
  asWritten: { textTransform: 'none' },
  default: { fontFamily: Type.body, fontSize: 17, lineHeight: 25 },
  bold: { fontFamily: Type.bodyBold, fontSize: 17, lineHeight: 25 },
  title: { fontFamily: Type.headBold, fontSize: 30, lineHeight: 37, letterSpacing: -0.3 },
  subtitle: { fontFamily: Type.head, fontSize: 21, lineHeight: 28, letterSpacing: -0.2 },
  heading: { fontFamily: Type.head, fontSize: 18, lineHeight: 25, letterSpacing: -0.2 },
  small: { fontFamily: Type.body, fontSize: 15, lineHeight: 21 },
  smallBold: { fontFamily: Type.bodyBold, fontSize: 15, lineHeight: 21 },
  link: { fontFamily: Type.bodyBold, fontSize: 17, lineHeight: 25 },
  label: { fontFamily: Type.bodyBold, fontSize: 13, lineHeight: 18, letterSpacing: 0.9, textTransform: 'uppercase' },
  number: { fontFamily: Type.headBold, fontSize: 34, lineHeight: 40, letterSpacing: -0.5 },
});
