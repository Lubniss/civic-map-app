import Ionicons from '@expo/vector-icons/Ionicons';
import type { Tabs } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, size, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { dial112, HOLD_MS } from './SosButton';

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

/** How far the bar's top edge sits above the bottom of the screen. */
export function useTabBarTop(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + space.md + size.tabBarHeight;
}

/** Bottom padding for scrolling screens: clears the bar and the raised "+" with room to spare. */
export function useTabBarSpace(): number {
  return useTabBarTop() + size.fabLift + space.xxxl;
}

// ---------- the bar ----------
type IconName = ComponentProps<typeof Ionicons>['name'];
const TABS: { name: string; on: IconName; off: IconName; label: string }[] = [
  { name: 'index', on: 'map', off: 'map-outline', label: 'Map' },
  { name: 'routes', on: 'git-branch', off: 'git-branch-outline', label: 'Routes' },
  { name: 'reports', on: 'document-text', off: 'document-text-outline', label: 'My Reports' },
  { name: 'profile', on: 'person', off: 'person-outline', label: 'Profile' },
];

/**
 * Sleek floating bar: white with a hairline border in light mode, dark slate in dark mode.
 * Symmetric 2–1–2 layout so the raised "+" sits exactly in the centre:
 * Map · Routes · (+) · My Reports · Profile.
 */
export function FloatingTabBar({ state, navigateToTab, onPressCreate }: TabBarProps & { onPressCreate: () => void }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { hidden } = useTabBarVisibility();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, { toValue: hidden ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [hidden, slide]);

  const bottom = insets.bottom + space.md;
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [0, size.tabBarHeight + bottom + size.fabLift + 12] });

  const tab = (name: string) => {
    const meta = TABS.find((t) => t.name === name)!;
    const index = state.routes.findIndex((r) => r.name === name);
    const route = state.routes[index];
    if (!route) return <View key={name} style={styles.slot} />;
    const focused = state.index === index;
    const color = focused ? colors.tabIcon : colors.tabIconOff;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        onPress={() => { if (!focused) navigateToTab(route.key); }}
        style={styles.slot}
      >
        <Ionicons name={focused ? meta.on : meta.off} size={22} color={color} />
        <AppText variant="tabLabel" color={color} numberOfLines={1}>{meta.label}</AppText>
      </Pressable>
    );
  };

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[styles.wrap, { bottom, transform: [{ translateY }] }]}
    >
      <View
        style={[
          styles.bar,
          { backgroundColor: colors.tabBar, borderColor: colors.tabBorder },
          !isDark && { shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
        ]}
      >
        {tab('index')}
        {tab('routes')}
        <View style={styles.slot}>
          <CreateOrSosButton onPressCreate={onPressCreate} />
        </View>
        {tab('reports')}
        {tab('profile')}
      </View>
    </Animated.View>
  );
}

/** A press longer than this is a hold (SOS), not a tap (report). */
const TAP_MAX_MS = 250;

/**
 * The raised centre button. Tap = report a problem. Hold = SOS: after a short moment the button
 * fills red with a phone icon; keep holding for 1.5 s to open the dialer with 112. Releasing early cancels.
 */
function CreateOrSosButton({ onPressCreate }: { onPressCreate: () => void }) {
  const { colors, isDark } = useTheme();
  const fill = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  const startedAt = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const reset = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    fill.stopAnimation();
    Animated.timing(fill, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    setHolding(false);
  };

  const onPressIn = () => {
    fired.current = false;
    startedAt.current = Date.now();
    holdTimer.current = setTimeout(() => {
      setHolding(true);
      Animated.timing(fill, { toValue: 1, duration: HOLD_MS - TAP_MAX_MS, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
        if (finished) {
          fired.current = true;
          reset();
          dial112();
        }
      });
    }, TAP_MAX_MS);
  };

  const onPressOut = () => {
    const quick = Date.now() - startedAt.current < TAP_MAX_MS;
    reset();
    if (quick && !fired.current) onPressCreate();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Report a problem"
      accessibilityHint="Tap to report. Press and hold to call 112."
      accessibilityActions={[{ name: 'activate' }, { name: 'longpress', label: 'Call 112' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'longpress') {
          Alert.alert('Call 112?', 'This opens your phone dialer with 112.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Call 112', style: 'destructive', onPress: dial112 },
          ]);
        } else {
          onPressCreate();
        }
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        styles.fab,
        { backgroundColor: colors.accent, borderColor: colors.tabBar },
        !isDark && { shadowColor: colors.shadow, shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
      ]}
    >
      {/* Red SOS fill grows from the centre while holding */}
      <Animated.View
        pointerEvents="none"
        style={[styles.sosFill, { backgroundColor: colors.sos, transform: [{ scale: fill }] }]}
      />
      <Ionicons name={holding ? 'call' : 'add'} size={holding ? 24 : 28} color={holding ? colors.onSos : colors.onAccent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sosFill: { position: 'absolute', width: size.fab, height: size.fab, borderRadius: size.fab / 2 },
  wrap: { position: 'absolute', left: space.lg, right: space.lg },
  bar: {
    height: size.tabBarHeight,
    borderRadius: radius.tabBar,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xs,
  },
  slot: { flex: 1, minHeight: size.touch, alignItems: 'center', justifyContent: 'center', gap: 2 },
  fab: {
    marginTop: -size.fabLift * 2,
    width: size.fab,
    height: size.fab,
    borderRadius: size.fab / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
