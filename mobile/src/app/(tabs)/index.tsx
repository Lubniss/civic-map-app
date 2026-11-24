import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertPreview, AlertPreviewHeader } from '@/components/AlertPreview';
import { SummaryButton, SummaryDetails, SummaryHeader, type PillState } from '@/components/AreaSummary';
import { AppText } from '@/components/AppText';
import { BottomSheet } from '@/components/BottomSheet';
import { useTabBarTop } from '@/components/FloatingTabBar';
import { AlertMarker, HeatLayer } from '@/components/MapLayers';
import { SosButton } from '@/components/SosButton';
import { ZoneBanner } from '@/components/ZoneBanner';
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
  const controlsTop = insets.top + space.sm;
  const bottomRowY = tabBarTop + size.fabLift + space.lg;

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

      {/* Zone warning banner: between the SOS button and the right-hand controls, so neither is covered */}
      <View style={[styles.banner, { top: controlsTop }]} pointerEvents="box-none">
        <ZoneBanner onOpen={setSelected} />
      </View>

      {/* Top-left, apart from the map controls: SOS (hold to call 112) */}
      <View style={[styles.left, { top: controlsTop }]} pointerEvents="box-none">
        <SosButton onHint={showHint} />
      </View>

      {/* Right column: Alerts / Heat mode switch (active one filled + labelled), my location */}
      <View style={[styles.right, { top: controlsTop }]} pointerEvents="box-none">
        <ModeSwitch mode={mode} onChange={setMode} />
        <RoundButton icon="navigate" label="Go to my location" onPress={goToMe} />
      </View>

      {/* Bottom-left: Safe Route (phase 6) */}
      <Pressable
        onPress={() => router.navigate('/routes')}
        accessibilityRole="button"
        accessibilityLabel="Safe route"
        accessibilityHint="Compare the fastest and the safest route to a destination"
        style={({ pressed }) => [
          styles.safeRoute,
          { bottom: bottomRowY, backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
          !isDark && { shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
        ]}
      >
        <Ionicons name="navigate-circle" size={20} color={colors.accentText} />
        <AppText variant="label" style={{ fontFamily: 'Inter-SemiBold' }}>Safe Route</AppText>
      </Pressable>

      {/* Bottom-right: area summary, colour-coded by risk (replaces the old top pill) */}
      <View style={[styles.areaWrap, { bottom: bottomRowY }]} pointerEvents="box-none">
        <SummaryButton state={pillState} onPress={() => setSummaryOpen(true)} onHint={showHint} />
      </View>

      {location.status === 'denied' ? (
        <Pressable
          onPress={refresh}
          accessibilityRole="button"
          style={[styles.notice, { bottom: bottomRowY + 56, backgroundColor: colors.card, borderColor: colors.border }]}
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

      <BottomSheet
        visible={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        accessibilityLabel="Area summary"
        header={pillState.kind === 'ready' ? <SummaryHeader summary={pillState.summary} /> : null}
      >
        {pillState.kind === 'ready' ? <SummaryDetails summary={pillState.summary} /> : null}
      </BottomSheet>

      <BottomSheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        accessibilityLabel="Alert details"
        header={selected ? <AlertPreviewHeader alert={selected} /> : null}
      >
        {selected ? (
          <AlertPreview
            alert={selected}
            onOpen={() => {
              const id = selected.id;
              setSelected(null);
              router.push({ pathname: '/alert/[id]', params: { id } });
            }}
          />
        ) : null}
      </BottomSheet>
    </View>
  );
}

/** Vertical two-option switch: the active mode is filled green and both options are labelled. */
function ModeSwitch({ mode, onChange }: { mode: 'alerts' | 'heat'; onChange: (m: 'alerts' | 'heat') => void }) {
  const { colors, isDark } = useTheme();
  const options: { value: 'alerts' | 'heat'; icon: React.ComponentProps<typeof Ionicons>['name']; label: string; a11y: string }[] = [
    { value: 'alerts', icon: 'location', label: 'Alerts', a11y: 'Show alert pins and zones' },
    { value: 'heat', icon: 'flame', label: 'Heat', a11y: 'Show heatmap' },
  ];
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Map mode"
      style={[
        styles.switch,
        { backgroundColor: colors.card, borderColor: colors.border },
        !isDark && { shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
      ]}
    >
      {options.map((o) => {
        const on = mode === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.a11y}
            style={[styles.switchOption, on && { backgroundColor: colors.accent }]}
          >
            <Ionicons name={on ? o.icon : (`${o.icon}-outline` as typeof o.icon)} size={18} color={on ? colors.onAccent : colors.textMuted} />
            <AppText variant="tabLabel" color={on ? colors.onAccent : colors.textMuted} style={{ fontSize: 10, lineHeight: 12 }}>{o.label}</AppText>
          </Pressable>
        );
      })}
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
  areaWrap: { position: 'absolute', right: space.lg },
  banner: { position: 'absolute', left: space.lg + size.mapButton + space.md, right: space.lg + size.mapButton + 4 + space.md },
  left: { position: 'absolute', left: space.lg },
  right: { position: 'absolute', right: space.lg, gap: space.md },
  switch: {
    width: size.mapButton + 4,
    borderRadius: (size.mapButton + 4) / 2,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
  switchOption: {
    height: 50,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  round: {
    width: size.mapButton,
    height: size.mapButton,
    borderRadius: size.mapButton / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeRoute: {
    position: 'absolute',
    left: space.lg,
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  notice: {
    position: 'absolute',
    left: space.lg,
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
