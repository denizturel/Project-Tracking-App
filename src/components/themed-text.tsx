import { StyleSheet, Text, type TextProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'bold' | 'title' | 'subtitle' | 'small' | 'smallBold' | 'link';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const color = theme[themeColor ?? (type === 'link' ? 'primary' : 'text')];

  return <Text style={[{ color }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  default: { fontSize: 17, lineHeight: 25 },
  bold: { fontSize: 17, lineHeight: 25, fontWeight: 700 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: 700 },
  subtitle: { fontSize: 22, lineHeight: 28, fontWeight: 700 },
  small: { fontSize: 15, lineHeight: 21 },
  smallBold: { fontSize: 15, lineHeight: 21, fontWeight: 700 },
  link: { fontSize: 17, lineHeight: 25, fontWeight: 600 },
});
