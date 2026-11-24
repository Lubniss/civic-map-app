import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { categories, radius, type Category } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Soft category chip for lists and forms: tinted background, coloured icon. (Solid circles are for map pins only.) */
export function CategoryIcon({ category, size = 36 }: { category: Category; size?: number }) {
  const { categoryColor } = useTheme();
  const c = categoryColor(category);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: size,
        height: size,
        borderRadius: Math.min(radius.input, size / 2),
        backgroundColor: c.tint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={categories[category].icon as IconName} size={Math.round(size * 0.5)} color={c.tintIcon} />
    </View>
  );
}

/** Solid map pin: category fill, white (or dark) icon, theme ring. Used only on the map. */
export function CategoryPin({ category, size = 34, dimmed = false }: { category: Category; size?: number; dimmed?: boolean }) {
  const { categoryColor, colors, isDark } = useTheme();
  const c = categoryColor(category);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.fill,
        borderWidth: 2,
        borderColor: colors.pinRing,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dimmed ? 0.85 : 1,
        ...(isDark
          ? {}
          : { shadowColor: colors.shadow, shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 }),
      }}
    >
      <Ionicons name={categories[category].icon as IconName} size={Math.round(size * 0.47)} color={c.icon} />
    </View>
  );
}
