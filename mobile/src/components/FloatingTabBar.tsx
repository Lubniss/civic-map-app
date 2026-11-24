import Ionicons from '@expo/vector-icons/Ionicons';
import type { Tabs } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, size, space } from '@/theme/tokens';
import { AppText } from './AppText';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// ---------- show / hide (sheets hide the tab bar while open) ----------
const TabBarContext = createContext<{ hidden: boolean; setHidden: (h: boolean) => void }>({
  hidden: false,
  setHidden: () => {},
});

export function TabBarVisibilityProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const value = useMemo(() => ({ hidden, setHidden }), [hidden]);
  return <TabBarContext.Provider value={value}>{children}</TabBarContext.Provider>;
}

/** Call setHidden(true) when a bottom sheet opens, false when it closes. */
export const useTabBarVisibility = () => useContext(TabBarContext);

/** Bottom padding a scrolling screen needs so its content isn't hidden behind the tab bar. */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + space.md + size.tabBarHeight + space.lg;
}

// ---------- the bar ----------
const ICONS: Record<string, { on: ComponentProps<typeof Ionicons>['name']; off: ComponentProps<typeof Ionicons>['name']; label: string }> = {
  index: { on: 'map', off: 'map-outline', label: 'Map' },
  reports: { on: 'document-text', off: 'document-text-outline', label: 'My Reports' },
  profile: { on: 'person', off: 'person-outline', label: 'Profile' },
};

export function FloatingTabBar({ state, navigateToTab, onPressCreate }: TabBarProps & { onPressCreate: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { hidden } = useTabBarVisibility();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, { toValue: hidden ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [hidden, slide]);

  const bottom = insets.bottom + space.md;
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [0, size.tabBarHeight + bottom + size.fabLift + 8] });

  const renderTab = (routeName: string) => {
    const index = state.routes.findIndex((r) => r.name === routeName);
    const route = state.routes[index];
    const meta = ICONS[routeName];
    if (!route || !meta) return null;
    const focused = state.index === index;
    const onPress = () => {
      if (!focused) navigateToTab(route.key);
    };
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        onPress={onPress}
        style={styles.tab}
      >
        <Ionicons name={focused ? meta.on : meta.off} size={22} color={focused ? colors.tabIcon : colors.tabIconOff} />
        <AppText variant="tabLabel" color={focused ? colors.tabIcon : colors.tabIconOff} numberOfLines={1}>{meta.label}</AppText>
      </Pressable>
    );
  };

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[styles.wrap, { bottom, transform: [{ translateY }] }]}
    >
      <View style={[styles.bar, { backgroundColor: colors.tabBar, shadowColor: colors.shadow }]}>
        <View style={styles.half}>{renderTab('index')}{renderTab('reports')}</View>
        <View style={{ width: size.fab + space.lg }} />
        <View style={styles.half}>{renderTab('profile')}</View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report a problem"
        onPress={onPressCreate}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: colors.accent, borderColor: colors.bg, opacity: pressed ? 0.9 : 1, shadowColor: colors.shadow },
        ]}
      >
        <Ionicons name="add" size={32} color={colors.onAccent} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  bar: {
    alignSelf: 'stretch',
    height: size.tabBarHeight,
    borderRadius: radius.tabBar,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  half: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  tab: { minWidth: 64, minHeight: size.touch, alignItems: 'center', justifyContent: 'center', gap: 2 },
  fab: {
    position: 'absolute',
    top: -size.fabLift - 4,
    width: size.fab,
    height: size.fab,
    borderRadius: size.fab / 2,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
});
