import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { useTabBarTop } from '@/components/FloatingTabBar';
import { AppMap } from '@/components/map/AppMap';
import type { AppMapRef, PinSpec, RouteLineSpec } from '@/components/map/types';
import { Badge, Button, Card } from '@/components/ui';
import { api } from '@/lib/api';
import { FALLBACK_REGION } from '@/lib/geo';
import { useHeatmap } from '@/lib/queries';
import { useStreetName } from '@/lib/streetName';
import type { Bbox, Place, PlannedRoute, RoutePlan, RouteRiskLevel } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, size, space, type as typeScale, type BadgeName } from '@/theme/tokens';

type Mode = 'walking' | 'driving';
type Which = 'safest' | 'fastest';

const RISK_BADGE: Record<RouteRiskLevel, { kind: BadgeName; label: string }> = {
  Safe: { kind: 'riskLow', label: 'Safe' },
  Moderate: { kind: 'riskModerate', label: 'Moderate risk' },
  High: { kind: 'riskHigh', label: 'High risk' },
};

const minutes = (s: number) => {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const km = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function RoutesScreen() {
  const { colors, badges, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarTop = useTabBarTop();
  const mapRef = useRef<AppMapRef>(null);

  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState(false);
  const [mode, setMode] = useState<Mode>('walking');
  const [query, setQuery] = useState('');
  const [destination, setDestination] = useState<Place | null>(null);
  const [picking, setPicking] = useState(false);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<Which>('safest');
  const debounced = useDebounced(query.trim(), 350);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const { focus } = useLocalSearchParams<{ focus?: string }>();

  // Arriving from the map's search bar: put the cursor straight into "Where to?".
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [focus]);
  const pickedName = useStreetName(picking ? center : null);

  useEffect(() => {
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return setLocError(true);
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const here = { lat: p.coords.latitude, lng: p.coords.longitude };
      setMe(here);
      mapRef.current?.moveTo(here, 0.03, 400);
    })().catch(() => setLocError(true));
  }, []);

  const suggestions = useQuery({
    queryKey: ['geocode', debounced, me && `${me.lat.toFixed(2)},${me.lng.toFixed(2)}`],
    queryFn: () => {
      const focus = me ? `&lat=${me.lat}&lng=${me.lng}` : '';
      return api<{ places: Place[] }>(`/geocode?q=${encodeURIComponent(debounced)}${focus}`).then((r) => r.places);
    },
    enabled: debounced.length >= 2 && !destination && !picking,
    staleTime: 5 * 60_000,
  });

  const plan = useMutation({
    mutationFn: (args: { origin: { lat: number; lng: number }; destination: Place; mode: Mode }) =>
      api<RoutePlan>('/routes/plan', {
        method: 'POST',
        body: { origin: args.origin, destination: { lat: args.destination.lat, lng: args.destination.lng }, mode: args.mode, localHour: new Date().getHours() },
      }),
    onSuccess: (p) => {
      setSelected('safest');
      mapRef.current?.fitTo(
        [...p.fastest.coordinates, ...p.safest.coordinates],
        { top: insets.top + 190, right: 40, bottom: tabBarTop + 260, left: 40 },
      );
    },
  });

  // Re-plan when the destination or the travel mode changes.
  useEffect(() => {
    if (me && destination) plan.mutate({ origin: me, destination, mode });
  }, [destination, mode, me?.lat, me?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(place: Place) {
    Keyboard.dismiss();
    setDestination(place);
    setQuery(place.label);
  }

  function clear() {
    setDestination(null);
    setQuery('');
    plan.reset();
  }

  function startPicking() {
    Keyboard.dismiss();
    setDestination(null);
    plan.reset();
    setPicking(true);
  }

  function confirmPick() {
    if (!center) return;
    setPicking(false);
    choose({ label: pickedName.name ?? 'Selected spot', lat: center.lat, lng: center.lng });
  }

  const p = plan.data;
  const shown: PlannedRoute | null = p ? (selected === 'safest' ? p.safest : p.fastest) : null;
  const other: PlannedRoute | null = p && !p.sameRoute ? (selected === 'safest' ? p.fastest : p.safest) : null;
  const routeColors = { safest: colors.accent, fastest: isDark ? '#60A5FA' : '#2563EB' };

  // Heatmap around the whole trip (both routes) for context.
  const tripBbox: Bbox | null = useMemo(() => {
    if (!p) return null;
    const pts = [...p.fastest.coordinates, ...p.safest.coordinates];
    const lats = pts.map((c) => c.lat);
    const lngs = pts.map((c) => c.lng);
    const m = 0.006;
    return { minLat: Math.min(...lats) - m, maxLat: Math.max(...lats) + m, minLng: Math.min(...lngs) - m, maxLng: Math.max(...lngs) + m };
  }, [p]);
  const heat = useHeatmap(tripBbox, !!p);

  // Alert symbols: everything near the selected route (full size), plus what only the other route passes (smaller).
  const pins: PinSpec[] = useMemo(() => {
    if (!shown) return [];
    const mine = new Set(shown.alerts.map((a) => a.id));
    return [
      ...shown.alerts.map((a) => ({ key: `${a.id}-s`, lat: a.lat, lng: a.lng, category: a.category, small: false })),
      ...(other?.alerts.filter((a) => !mine.has(a.id)).map((a) => ({ key: `${a.id}-o`, lat: a.lat, lng: a.lng, category: a.category, small: true })) ?? []),
    ];
  }, [shown, other]);

  // The unselected route is drawn first (underneath) and faded; tapping it selects it.
  const lines: RouteLineSpec[] = useMemo(() => {
    if (!p) return [];
    if (p.sameRoute) return [{ coords: p.safest.coordinates, color: routeColors.safest }];
    const otherWhich: Which = selected === 'safest' ? 'fastest' : 'safest';
    return [
      { coords: p[otherWhich].coordinates, color: routeColors[otherWhich], dashed: otherWhich === 'fastest', faded: true, onPress: () => setSelected(otherWhich) },
      { coords: p[selected].coordinates, color: routeColors[selected], dashed: selected === 'fastest' },
    ];
  }, [p, selected, routeColors.safest, routeColors.fastest]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.fill}>
      <AppMap
        ref={mapRef}
        initialCenter={{ lat: FALLBACK_REGION.latitude, lng: FALLBACK_REGION.longitude }}
        initialDelta={FALLBACK_REGION.longitudeDelta}
        showsUser
        attributionPosition={{ bottom: tabBarTop + 6, left: space.lg }}
        onRegionChange={(r) => setCenter(r.center)}
        heat={p ? heat.data ?? [] : null}
        routes={lines}
        pins={pins}
        flag={destination && !picking ? { lat: destination.lat, lng: destination.lng } : null}
      />

      {picking ? (
        <View pointerEvents="none" style={styles.crosshair}>
          <Ionicons name="flag" size={34} color={colors.text} style={{ transform: [{ translateY: -16 }] }} />
        </View>
      ) : null}

      {/* Top: where to + mode */}
      <View style={[styles.top, { top: insets.top + space.sm }]} pointerEvents="box-none">
        <Card style={{ gap: space.md, padding: space.md }}>
          {/* From → To with a connecting rail */}
          <View style={styles.fromTo}>
            <View style={styles.rail}>
              <View style={[styles.dotFrom, { borderColor: colors.accent, backgroundColor: colors.card }]} />
              <View style={[styles.railLine, { backgroundColor: colors.border }]} />
              <Ionicons name="flag" size={16} color={colors.text} />
            </View>
            <View style={{ flex: 1, gap: space.sm }}>
              <View style={[styles.fromRow, { borderBottomColor: colors.border }]}>
                <AppText variant="label" color={locError ? colors.danger : 'muted'} numberOfLines={1}>
                  {locError ? 'Location is off: allow it to plan routes' : 'Your location'}
                </AppText>
              </View>
              <View style={[styles.searchBox, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                <TextInput
                  ref={inputRef}
                  value={query}
                  onChangeText={(t) => { setQuery(t); if (destination) { setDestination(null); plan.reset(); } }}
                  placeholder="Where to?"
                  placeholderTextColor={colors.textMuted}
                  maxFontSizeMultiplier={typeScale.body.maxScale}
                  style={[styles.searchInput, { color: colors.text, fontFamily: typeScale.bodyStrong.fontFamily }]}
                  returnKeyType="search"
                  accessibilityLabel="Destination"
                />
                {query ? (
                  <Pressable onPress={clear} accessibilityRole="button" accessibilityLabel="Clear destination" hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </Pressable>
                ) : (
                  <Ionicons name="search" size={18} color={colors.textMuted} />
                )}
              </View>
            </View>
          </View>
          {/* Travel mode chips + pick on map */}
          <View style={styles.row}>
            <ModeChip icon="walk" label="Walk" on={mode === 'walking'} onPress={() => setMode('walking')} />
            <ModeChip icon="car" label="Drive" on={mode === 'driving'} onPress={() => setMode('driving')} />
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={startPicking}
              accessibilityRole="button"
              accessibilityLabel="Pick destination on the map"
              style={({ pressed }) => [styles.chip, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}
            >
              <Ionicons name="pin" size={15} color={colors.text} />
              <AppText variant="label">On map</AppText>
            </Pressable>
          </View>
        </Card>

        {suggestions.data && suggestions.data.length > 0 && !destination && !picking && query.trim().length >= 2 ? (
          <Card style={{ padding: 0, marginTop: space.sm, maxHeight: 260 }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {suggestions.data.map((s, i) => (
                <Pressable key={`${s.label}-${i}`} onPress={() => choose(s)} accessibilityRole="button" style={[styles.suggestion, { borderBottomColor: colors.border }]}>
                  <Ionicons name="location-outline" size={18} color={colors.textMuted} />
                  <AppText variant="body" numberOfLines={2} style={{ flex: 1 }}>{s.label}</AppText>
                </Pressable>
              ))}
            </ScrollView>
          </Card>
        ) : null}
        {suggestions.isError && !destination ? (
          <Card style={{ marginTop: space.sm }}>
            <AppText variant="caption" color="muted">{suggestions.error instanceof Error ? suggestions.error.message : 'Search failed.'} You can pick on the map instead.</AppText>
          </Card>
        ) : null}
      </View>

      {/* Bottom: pick confirmation, loading, error or the route comparison */}
      <View style={[styles.bottom, { bottom: tabBarTop + size.fabLift + space.md }]} pointerEvents="box-none">
        {picking ? (
          <Card style={{ gap: space.md }}>
            <AppText variant="label" color="muted">DRAG THE MAP TO PUT THE FLAG ON YOUR DESTINATION</AppText>
            <AppText variant="h2" numberOfLines={2}>{pickedName.name ?? (pickedName.loading ? 'Finding street name…' : 'Unnamed road')}</AppText>
            <View style={styles.row}>
              <View style={{ flex: 1 }}><Button title="Cancel" variant="secondary" onPress={() => setPicking(false)} /></View>
              <View style={{ flex: 1 }}><Button title="Go here" onPress={confirmPick} /></View>
            </View>
          </Card>
        ) : plan.isPending ? (
          <Card style={[styles.row, { justifyContent: 'center' }]}>
            <ActivityIndicator color={colors.textMuted} />
            <AppText variant="body" color="muted">Checking routes for reported dangers…</AppText>
          </Card>
        ) : plan.isError ? (
          <Card style={{ gap: space.sm }}>
            <AppText variant="bodyStrong">Couldn't plan a route</AppText>
            <AppText variant="caption" color="muted">{plan.error instanceof Error ? plan.error.message : 'Try again.'}</AppText>
            {me && destination ? <Button title="Try again" variant="secondary" onPress={() => plan.mutate({ origin: me, destination, mode })} /> : null}
          </Card>
        ) : p ? (
          <Card style={{ gap: space.md }}>
            <View style={[styles.callout, { backgroundColor: badges[RISK_BADGE[p.safest.riskLevel].kind].bg }]}>
              <Ionicons
                name={p.sameRoute ? 'checkmark-circle' : 'shield-checkmark'}
                size={20}
                color={badges[RISK_BADGE[p.safest.riskLevel].kind].fg}
              />
              <AppText variant="bodyStrong" color={badges[RISK_BADGE[p.safest.riskLevel].kind].fg} style={{ flex: 1 }}>{p.explanation}</AppText>
            </View>
            {p.sameRoute ? (
              <RouteCard which="safest" title="Fastest & safest" route={p.safest} color={routeColors.safest} selected onPress={() => {}} />
            ) : (
              <View style={styles.row}>
                <RouteCard which="safest" title="Safest" route={p.safest} color={routeColors.safest} selected={selected === 'safest'} onPress={() => setSelected('safest')} />
                <RouteCard which="fastest" title="Fastest" route={p.fastest} color={routeColors.fastest} selected={selected === 'fastest'} onPress={() => setSelected('fastest')} />
              </View>
            )}
            <AppText variant="caption" color="muted">Tap a route to see the alerts along it. Not turn-by-turn directions.</AppText>
          </Card>
        ) : !query ? (
          <Card style={{ gap: space.xs }}>
            <AppText variant="bodyStrong">Fastest vs. safest route</AppText>
            <AppText variant="caption" color="muted">Search a destination or pick it on the map. We'll compare the quickest route with one that avoids reported danger.</AppText>
          </Card>
        ) : null}
      </View>
    </View>
  );
}

function RouteCard({ which, title, route, color, selected, onPress }: {
  which: Which; title: string; route: PlannedRoute; color: string; selected: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  const badge = RISK_BADGE[route.riskLevel];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title} route: ${minutes(route.durationS)}, ${km(route.distanceM)}, ${badge.label}`}
      style={({ pressed }) => [
        styles.routeCard,
        { borderColor: selected ? color : colors.border, backgroundColor: selected ? colors.cardAlt : colors.card, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.routeIcon, { backgroundColor: color }]}>
          <Ionicons name={which === 'safest' ? 'shield-checkmark' : 'flash'} size={13} color="#FFFFFF" />
        </View>
        <AppText variant="label" color="muted">{title.toUpperCase()}</AppText>
      </View>
      <AppText variant="stat">{minutes(route.durationS)}</AppText>
      <AppText variant="caption" color="muted">{km(route.distanceM)} · {route.alerts.length} alert{route.alerts.length === 1 ? '' : 's'}</AppText>
      <Badge kind={badge.kind} label={badge.label} />
    </Pressable>
  );
}

function ModeChip({ icon, label, on, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; on: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: on ? colors.accent : colors.card, borderColor: on ? colors.accent : colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons name={icon} size={16} color={on ? colors.onAccent : colors.text} />
      <AppText variant="label" color={on ? colors.onAccent : colors.text}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { position: 'absolute', left: space.lg, right: space.lg },
  bottom: { position: 'absolute', left: space.lg, right: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderRadius: radius.input, paddingHorizontal: space.md, minHeight: 46 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: space.sm },
  fromTo: { flexDirection: 'row', gap: space.md },
  rail: { alignItems: 'center', paddingTop: 4, paddingBottom: 14, width: 18 },
  dotFrom: { width: 12, height: 12, borderRadius: 6, borderWidth: 3 },
  railLine: { flex: 1, width: 2, marginVertical: 3, borderRadius: 1 },
  fromRow: { minHeight: 22, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.md, minHeight: 36 },
  callout: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, borderRadius: radius.input, padding: space.md },
  routeIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  crosshair: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  routeCard: { flex: 1, borderWidth: 2, borderRadius: radius.card, padding: space.md, gap: space.xs },
});
