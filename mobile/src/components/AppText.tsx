import { Text, type TextProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { type, type TypeName } from '@/theme/tokens';

interface Props extends TextProps {
  variant?: TypeName;
  /** 'muted' = secondary text; any other string is used as a colour. */
  color?: 'text' | 'muted' | (string & {});
}

/**
 * The only Text component screens should use: locked fonts, theme colours,
 * and capped accessibility scaling so large system text can't break layouts.
 */
export function AppText({ variant = 'body', color = 'text', style, ...rest }: Props) {
  const { colors } = useTheme();
  const t = type[variant];
  const resolved = color === 'text' ? colors.text : color === 'muted' ? colors.textMuted : color;
  return (
    <Text
      maxFontSizeMultiplier={t.maxScale}
      style={[
        {
          fontFamily: t.fontFamily,
          fontSize: t.fontSize,
          lineHeight: t.lineHeight,
          letterSpacing: 'letterSpacing' in t ? t.letterSpacing : undefined,
          textTransform: 'textTransform' in t ? t.textTransform : undefined,
          color: resolved,
        },
        style,
      ]}
      {...rest}
    />
  );
}
