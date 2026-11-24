import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertPreview } from '@/components/AlertPreview';
import { SummaryDetails, SummaryPill, type PillState } from '@/components/AreaSummary';
import { AppText } from '@/components/AppText';
import { BottomSheet } from '@/components/BottomSheet';
import { useTabBarTop } from '@/components/FloatingTabBar';
import { AlertMarker, HeatLayer } from '@/components/MapLayers';
import { SosButton } from '@/components/SosButton';
import { ApiError } from '@/lib/api';
import { FALLBACK_REGION, isBboxTooLarge, regionToBbox } from '@/lib/geo';
import { useMyLocation } from '@/lib/location';
import { useAreaSummary, useHeatmap, useMapAlerts } from '@/lib/queries';
import type { Bbox, MapAlert } from '@/lib/types';
import { googleMapStyle } from '@/theme/mapStyle';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, size, space } from '@/theme/tokens';

const NEARBY_DELTA = 0.02; // ~2 km across

export default function MapScreen() {
  const { colors, scheme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarTop = useTabBarTop();
  const mapRef = useRef<MapView>(null);
  const { location, refresh } = useMyLocation();

  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [mode, setMode] = useState<'alerts' | 'heat'>('alerts');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [selected, setSelected] = useState<MapAlert | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const centredOnce = useRef(false);

  const alerts = useMapAlerts(bbox);
  const heat = useHeatmap(bbox, mode === 'heat');
  const summary = useAreaSummary(bbox);

  // Centre on the user the first time we know where they are.
  useEffect(() => {
    if (location.status === 'ready' && !centredOnce.current) {
      centredOnce.current = true;
      mapRef.current?.animateToRegion(
        { latitude: location.coords.latitude, longitude: location.coords.longitude, latitudeDelta: NEARBY_DELTA, longitudeDelta: NEARBY_DELTA },
        500,
      );
    }
  }, [location]);

  const onRegionChangeComplete = useCallback((r: Region) => setBbox(regionToBbox(r)), []);

  const goToMe = useCallback(async () => {
    const coords = location.status === 'ready' ? location.coords : await refresh();
    if (!coords) {
      showHint('Turn on location to see alerts around you');
      return;
    }
    mapRef.current?.animateToRegion({ latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: NEARBY_DELTA, longitudeDelta: NEARBY_DELTA }, 400);
  }, [location, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // Small toast for hints ("Hold to call 112", location off…)
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showHint(message: string) {
    setHint(message);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    Animated.timing(hintOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    hintTimer.current = setTimeout(() => {
      Animated.timing(hintOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setHint(null));
    }, 2200);
  }
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);

  const pillState: PillState = useMemo(() => {
    if (!bbox || summary.isPending) return bbox && isBboxTooLarge(bbox) ? { kind: 'tooLarge' } : { kind: 'loading' };
    if (isBboxTooLarge(bbox)) return { kind: 'tooLarge' };
    if (summary.isError) {
      const e = summary.error;
      return { kind: 'error', message: e instanceof ApiError && e.status === 0 ? "Can't reach the server" : 'Summary unavailable' };
    }
    return summary.data ? { kind: 'ready', summary: summary.data } : { kind: 'loading' };
  }, [bbox, summary.isPending, summary.isError, summary.error, summary.data]);

  const mapStyle = useMemo(() => googleMapStyle(scheme), [scheme]);
  const pillTop = insets.top + space.sm;
  const controlsTop = pillTop + 52 + space.md;

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <MapView
        ref={mapRef}
        style={styles.fill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={Platform.OS === 'android' ? mapStyle : undefined}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        initialRegion={FALLBACK_REGION}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation={location.status === 'ready'}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        moveOnMarkerPress={false}
        mapPadding={{ top: controlsTop, right: 0, bottom: tabBarTop + size.fabLift, left: 0 }}
      >
        {mode === 'alerts'
          ? (alerts.data ?? []).map((a) => <AlertMarker key={a.id} alert={a} onPress={setSelected} />)
          : <HeatLayer points={heat.data ?? []} />}
      </MapView>

      {/* Top: always-visible Area Summary pill */}
      <View style={[styles.pillWrap, { top: pillTop }]} pointerEvents="box-none">
        <SummaryPill state={pillState} onPress={() => setSummaryOpen(true)} />
      </View>

      {/* Left, under the pill and apart from the map controls: SOS (hold to call 112) */}
      <View style={[styles.left, { top: controlsTop }]} pointerEvents="box-none">
        <SosButton onHint={showHint} />
      </View>

      {/* Right column: Alerts / Heatmap toggle, my location */}
      <View style={[styles.right, { top: controlsTop }]} pointerEvents="box-none">
        <RoundButton
          icon={mode === 'alerts' ? 'flame-outline' : 'location-outline'}
          label={mode === 'alerts' ? 'Show heatmap' : 'Show alerts'}
          onPress={() => setMode((m) => (m === 'alerts' ? 'heat' : 'alerts'))}
        />
        <RoundButton icon="navigate" label="Go to my location" onPress={goToMe} />
      </View>

      {/* Bottom-left is kept empty on purpose: reserved for the phase 6 "Safe Route" button. */}

      {mode === 'heat' && Platform.OS === 'ios' ? (
        <View style={[styles.notice, { bottom: tabBarTop + size.fabLift + space.lg, backgroundColor: colors.card, borderColor: colors.border }]}>
          <AppText variant="caption" color="muted">Simplified heatmap on iPhone (full heatmap in the app build)</AppText>
        </View>
      ) : null}

      {location.status === 'denied' ? (
        <Pressable
          onPress={refresh}
          accessibilityRole="button"
          style={[styles.notice, { bottom: tabBarTop + size.fabLift + space.lg, backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <AppText variant="caption" color="muted">Location is off. Tap to allow it so the map can show alerts around you.</AppText>
        </Pressable>
      ) : null}

      {hint ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[styles.toast, { top: controlsTop + size.mapButton + space.md, backgroundColor: colors.text, opacity: hintOpacity }]}
        >
          <AppText variant="label" color={colors.bg}>{hint}</AppText>
        </Animated.View>
      ) : null}

      <BottomSheet visible={summaryOpen} onClose={() => setSummaryOpen(false)} accessibilityLabel="Area summary">
        {pillState.kind === 'ready' ? <SummaryDetails summary={pillState.summary} /> : null}
      </BottomSheet>

      <BottomSheet visible={selected !== null} onClose={() => setSelected(null)} accessibilityLabel="Alert details">
        {selected ? <AlertPreview alert={selected} /> : null}
      </BottomSheet>
    </View>
  );
}

function RoundButton({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const { colors, isDark } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
        !isDark && { shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
      ]}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pillWrap: { position: 'absolute', left: space.lg, right: space.lg },
  left: { position: 'absolute', left: space.lg },
  right: { position: 'absolute', right: space.lg, gap: space.md },
  round: {
    width: size.mapButton,
    height: size.mapButton,
    borderRadius: size.mapButton / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    position: 'absolute',
    left: space.lg + size.mapButton + space.md,
    right: space.lg,
    borderRadius: radius.input,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
});
