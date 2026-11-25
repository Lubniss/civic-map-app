// iPhone map: react-native-maps (Apple Maps), unchanged behaviour from phases 3–6, so it runs in Expo Go.
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Circle, Marker, Polyline, type Region } from 'react-native-maps';
import { CategoryPin } from '@/components/CategoryIcon';
import { AlertMarker, HeatLayer } from '@/components/MapLayers';
import { regionToBbox } from '@/lib/geo';
import { useTheme } from '@/theme/ThemeProvider';
import type { AppMapProps, AppMapRef, PinSpec, RouteLineSpec } from './types';

export function AppMap({ ref, ...p }: AppMapProps & { ref?: Ref<AppMapRef> }) {
  const { colors, isDark } = useTheme();
  const mapRef = useRef<MapView>(null);

  useImperativeHandle(ref, () => ({
    moveTo(center, delta, durationMs = 400) {
      mapRef.current?.animateToRegion({ latitude: center.lat, longitude: center.lng, latitudeDelta: delta, longitudeDelta: delta }, durationMs);
    },
    fitTo(coords, padding) {
      mapRef.current?.fitToCoordinates(
        coords.map((c) => ({ latitude: c.lat, longitude: c.lng })),
        { edgePadding: padding, animated: true },
      );
    },
  }), []);

  const onRegionChangeComplete = (r: Region) =>
    p.onRegionChange?.({ center: { lat: r.latitude, lng: r.longitude }, bbox: regionToBbox(r) });

  return (
    <MapView
      ref={mapRef}
      style={styles.fill}
      userInterfaceStyle={isDark ? 'dark' : 'light'}
      initialRegion={{ latitude: p.initialCenter.lat, longitude: p.initialCenter.lng, latitudeDelta: p.initialDelta, longitudeDelta: p.initialDelta }}
      onRegionChangeComplete={onRegionChangeComplete}
      showsUserLocation={!!p.showsUser}
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      pitchEnabled={false}
      rotateEnabled={p.rotate ?? true}
      moveOnMarkerPress={false}
      mapPadding={p.padding}
    >
      {p.heat ? <HeatLayer points={p.heat} /> : null}
      {(p.rings ?? []).map((r) => (
        <Circle
          key={r.key}
          center={{ latitude: r.center.lat, longitude: r.center.lng }}
          radius={r.radiusM}
          strokeWidth={r.strokeWidth ?? 0}
          strokeColor={r.stroke ?? 'transparent'}
          fillColor={r.fill}
        />
      ))}
      {(p.routes ?? []).map((r, i) => <RouteLine key={`route-${i}`} route={r} z={i + 1} />)}
      {(p.alerts ?? []).map((a) => <AlertMarker key={a.id} alert={a} onPress={(x) => p.onAlertPress?.(x)} />)}
      {(p.pins ?? []).map((pin) => <SmallPin key={pin.key} pin={pin} />)}
      {p.flag ? (
        <Marker coordinate={{ latitude: p.flag.lat, longitude: p.flag.lng }} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
          <Ionicons name="flag" size={30} color={colors.text} />
        </Marker>
      ) : null}
    </MapView>
  );
}

const RouteLine = memo(function RouteLine({ route, z }: { route: RouteLineSpec; z: number }) {
  return (
    <Polyline
      coordinates={route.coords.map((c) => ({ latitude: c.lat, longitude: c.lng }))}
      strokeColor={route.faded ? `${route.color}88` : route.color}
      strokeWidth={route.faded ? 4 : 6}
      lineDashPattern={route.dashed ? [12, 8] : undefined}
      lineCap="round"
      lineJoin="round"
      zIndex={z}
      tappable={!!route.onPress}
      onPress={route.onPress}
    />
  );
});

function SmallPin({ pin }: { pin: PinSpec }) {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    setTrack(true);
    const t = setTimeout(() => setTrack(false), 600);
    return () => clearTimeout(t);
  }, [pin.small]);
  return (
    <Marker coordinate={{ latitude: pin.lat, longitude: pin.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} zIndex={pin.small ? 3 : 4}>
      <CategoryPin category={pin.category} size={pin.small ? 22 : 30} dimmed={pin.small} />
    </Marker>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
