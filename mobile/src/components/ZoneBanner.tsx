import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { api } from '@/lib/api';
import { distanceM } from '@/lib/distance';
import { useLocationHistory } from '@/lib/locationHistory';
import type { MapAlert } from '@/lib/types';
import { findZoneWarning, markSeen, readSeen, type WarningTone, type ZoneWarning } from '@/lib/zoneWarning';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { CategoryIcon } from './CategoryIcon';

const RECHECK_MOVE_M = 40;
const RECHECK_MS = 60_000;
const SHOW_MS = 10_000;

/**
 * Slides in when the user walks into a red/grey zone, an unhealthy area or (at night) a dark street,
 * while the app is open. Each zone warns at most once every 6 hours. Tapping opens that alert.
 */
export function ZoneBanner({ onOpen }: { onOpen: (a: MapAlert) => void }) {
  const { colors, zones, badges } = useTheme();
  const { latest } = useLocationHistory();
  const [warning, setWarning] = useState<ZoneWarning | null>(null);
  const lastCheck = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!latest) return;
    const prev = lastCheck.current;
    if (prev && distanceM(prev.lat, prev.lng, latest.lat, latest.lng) < RECHECK_MOVE_M && Date.now() - prev.t < RECHECK_MS) return;
    lastCheck.current = { lat: latest.lat, lng: latest.lng, t: Date.now() };

    // Alerts in a ~1 km box around the user (independent of where the map is scrolled).
    const dLat = 0.005;
    const dLng = 0.005 / Math.max(Math.cos((latest.lat * Math.PI) / 180), 0.1);
    const bbox = `${latest.lng - dLng},${latest.lat - dLat},${latest.lng + dLng},${latest.lat + dLat}`;
    let active = true;
    api<{ alerts: MapAlert[] }>(`/alerts?bbox=${bbox}`)
      .then(({ alerts }) => {
        if (!active) return;
        const w = findZoneWarning(alerts, latest, readSeen());
        if (w) {
          markSeen(w.alert.id);
          show(w);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [latest]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  function show(w: ZoneWarning) {
    setWarning(w);
    Animated.timing(slide, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(hide, SHOW_MS);
  }

  function hide() {
    Animated.timing(slide, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setWarning(null));
  }

  if (!warning) return null;

  const accent: Record<WarningTone, string> = {
    danger: zones.red,
    history: zones.grey,
    dark: badges.riskModerate.fg,
    unhealthy: badges.riskModerate.fg,
  };

  return (
    <Animated.View
      style={{ opacity: slide, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }}
      accessibilityLiveRegion={warning.tone === 'danger' ? 'assertive' : 'polite'}
    >
      <Pressable
        onPress={() => { hide(); onOpen(warning.alert); }}
        accessibilityRole="button"
        accessibilityLabel={`${warning.message}. Opens details.`}
        style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: accent[warning.tone] }]}
      >
        <CategoryIcon category={warning.alert.category} size={32} />
        <AppText variant="label" style={{ flex: 1 }} numberOfLines={3}>{warning.message}</AppText>
        <Pressable onPress={hide} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </Pressable>
      <View />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.input,
    borderWidth: 1,
    borderLeftWidth: 4,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
});
