// Small building blocks shared by every screen. Colours come only from the theme.
import { useRef, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, TextInput, View, type PressableProps, type TextInputProps, type ViewProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, size, space, type as typeScale, type BadgeName } from '@/theme/tokens';
import { AppText } from './AppText';

/** Rounded card: crisp 1 px border in both modes, and only a very faint shadow in light mode. */
export function Card({ style, ...rest }: ViewProps) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.card,
          padding: space.lg,
          borderWidth: 1,
          borderColor: colors.border,
        },
        !isDark && {
          shadowColor: colors.shadow,
          shadowOpacity: 0.04,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        },
        style,
      ]}
      {...rest}
    />
  );
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}

/** Full-width button (image 1 style). */
export function Button({ title, onPress, variant = 'primary', disabled, loading, accessibilityHint }: ButtonProps) {
  const { colors } = useTheme();
  const bg = variant === 'primary' ? colors.accent : variant === 'danger' ? colors.sos : colors.cardAlt;
  const fg = variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.onSos : colors.text;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <AppText variant="button" color={fg}>{title}</AppText>}
    </Pressable>
  );
}

/** Text field with a label above it. */
export function Field({ label, error, ...input }: TextInputProps & { label: string; error?: string | null }) {
  const { colors } = useTheme();
  const t = typeScale.body;
  return (
    <View style={{ gap: space.sm }}>
      <AppText variant="label" color="muted">{label}</AppText>
      <TextInput
        placeholderTextColor={colors.textMuted}
        maxFontSizeMultiplier={t.maxScale}
        style={[
          styles.input,
          {
            backgroundColor: colors.cardAlt,
            color: colors.text,
            borderColor: error ? colors.danger : colors.border,
            fontFamily: t.fontFamily,
            fontSize: 16,
          },
        ]}
        {...input}
      />
      {error ? <AppText variant="caption" color={colors.danger}>{error}</AppText> : null}
    </View>
  );
}

/** Segmented control (image 2 "Today / Weekly" style). */
export function Segmented<T extends string>({
  options, value, onChange, accessibilityLabel,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; accessibilityLabel?: string }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={[styles.segmented, { backgroundColor: colors.cardAlt }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
          >
            <AppText variant="label" color={on ? 'text' : 'muted'}>{o.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pressable with tactile feedback: dips to 96% scale and 85% opacity while pressed. */
export function PressableScale({ style, children, ...rest }: Omit<PressableProps, 'style'> & { style?: ViewProps['style']; children: ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => { animate(0.96); rest.onPressIn?.(e); }}
      onPressOut={(e) => { animate(1); rest.onPressOut?.(e); }}
    >
      {({ pressed }) => (
        <Animated.View style={[style, { transform: [{ scale }], opacity: pressed ? 0.85 : 1 }]}>{children}</Animated.View>
      )}
    </Pressable>
  );
}

/** Status / risk badge using the approved badge colour pairs. */
export function Badge({ kind, label, style }: { kind: BadgeName; label: string; style?: ViewProps['style'] }) {
  const { badges } = useTheme();
  const c = badges[kind];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }, style]}>
      <AppText variant="pillBadge" color={c.fg} style={{ includeFontPadding: false, textAlignVertical: 'center' }}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: size.touch + 8,
    borderRadius: radius.button,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: size.touch + 6,
    borderRadius: radius.input,
    borderWidth: 1,
    paddingHorizontal: space.lg,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    padding: space.xs,
    gap: space.xs,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    minHeight: 24,
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
});
