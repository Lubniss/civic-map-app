// Android map: MapLibre + OpenFreeMap (phase 7c). Free, no API key, no card.
// The map data credit (OpenFreeMap / OpenMapTiles / OpenStreetMap) is shown by MapLibre's ⓘ button.
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  NativeUserLocation,
  type CameraRef,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import { CategoryPin } from '@/components/CategoryIcon';
import type { MapAlert } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { circleRing, deltaToZoom, ZONE_RADIUS_M, type AppMapProps, type AppMapRef, type LatLng, type RouteLineSpec } from './types';

/** OpenFreeMap styles: calm and pale for light mode (no shop/place icons), dark for dark mode. */
const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

/** Same colours and stops as the Google heatmap from phase 3: big green and yellow areas, red core. */
const HEAT_COLOR: ExpressionSpecification = [
  'interpolate', ['linear'], ['heatmap-density'],
  0, 'rgba(134, 239, 172, 0)',
  0.01, 'rgba(134, 239, 172, 0.55)',
  0.12, '#4ADE80',
  0.35, '#FACC15',
  0.65, '#F97316',
  1, '#DC2626',
];

const round = (n: number) => Math.round(n * 10_000) / 10_000;

export function AppMap({ ref, ...p }: AppMapProps & { ref?: Ref<AppMapRef> }) {
  const { colors, zones, isDark } = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const padding = p.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };

  useImperativeHandle(ref, () => ({
    moveTo(center, delta, durationMs = 400) {
      cameraRef.current?.easeTo({ center: [center.lng, center.lat], zoom: deltaToZoom(delta), duration: durationMs });
    },
    fitTo(coords, pad) {
      if (!coords.length) return;
      const lngs = coords.map((c) => c.lng);
      const lats = coords.map((c) => c.lat);
      cameraRef.current?.fitBounds(
        [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
        { padding: pad, duration: 600 },
      );
    },
  }), []);

  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { center, bounds } = e.nativeEvent;
    const [west, south, east, north] = bounds;
    p.onRegionChange?.({
      center: { lat: center[1], lng: center[0] },
      bbox: {
        minLng: round(Math.max(west, -180)),
        minLat: round(Math.max(south, -90)),
        maxLng: round(Math.min(east, 180)),
        maxLat: round(Math.min(north, 90)),
      },
    });
  };

  // Red / grey zones: real 150 m circles, so they keep their size at every zoom.
  const zoneData = useMemo(() => featureCollection(
    (p.alerts ?? [])
      .filter((a) => a.status === 'red_zone' || a.status === 'grey_zone')
      .map((a) => polygonFeature(a.id, { lat: a.lat, lng: a.lng }, ZONE_RADIUS_M, {
        fill: a.hot ? zones.redFill : zones.greyFill,
        stroke: a.hot ? zones.red : zones.grey,
        width: 2,
      })),
  ), [p.alerts, zones]);

  const ringData = useMemo(() => featureCollection(
    (p.rings ?? []).map((r) => polygonFeature(r.key, r.center, r.radiusM, {
      fill: r.fill,
      stroke: r.stroke ?? 'rgba(0,0,0,0)',
      width: r.strokeWidth ?? 0,
    })),
  ), [p.rings]);

  const heatData = useMemo(() => featureCollection(
    (p.heat ?? []).map((h, i) => ({
      type: 'Feature' as const,
      id: i,
      properties: { weight: h.weight },
      geometry: { type: 'Point' as const, coordinates: [h.lng, h.lat] },
    })),
  ), [p.heat]);

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <Map
        style={styles.fill}
        mapStyle={isDark ? STYLE_DARK : STYLE_LIGHT}
        contentInset={padding}
        onRegionDidChange={onRegionDidChange}
        compass={false}
        logo={false}
        attribution
        attributionPosition={p.attributionPosition ?? { bottom: 8, left: 8 }}
        tintColor={colors.textMuted}
        touchPitch={false}
        touchRotate={p.rotate ?? true}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: [p.initialCenter.lng, p.initialCenter.lat], zoom: deltaToZoom(p.initialDelta) }}
        />

        {p.heat && p.heat.length ? (
          <GeoJSONSource id="heat" data={heatData}>
            <Layer
              type="heatmap"
              id="heat-layer"
              source="heat"
              paint={{
                'heatmap-weight': ['get', 'weight'],
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1.2, 18, 2],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 14, 13, 30, 15, 50, 18, 90],
                'heatmap-opacity': 0.8,
                'heatmap-color': HEAT_COLOR,
              }}
            />
          </GeoJSONSource>
        ) : null}

        <GeoJSONSource id="rings" data={ringData}>
          <Layer type="fill" id="rings-fill" source="rings" paint={{ 'fill-color': ['get', 'fill'] }} />
          <Layer type="line" id="rings-line" source="rings" paint={{ 'line-color': ['get', 'stroke'], 'line-width': ['get', 'width'] }} />
        </GeoJSONSource>

        <GeoJSONSource id="zones" data={zoneData}>
          <Layer type="fill" id="zones-fill" source="zones" paint={{ 'fill-color': ['get', 'fill'] }} />
          <Layer type="line" id="zones-line" source="zones" paint={{ 'line-color': ['get', 'stroke'], 'line-width': ['get', 'width'] }} />
        </GeoJSONSource>

        {(p.routes ?? []).map((r, i) => <RouteLine key={`route-${i}`} id={`route-${i}`} route={r} />)}

        {p.showsUser ? <NativeUserLocation /> : null}

        {(p.alerts ?? []).map((a) => <AlertPin key={a.id} alert={a} onPress={p.onAlertPress} />)}

        {(p.pins ?? []).map((pin) => (
          <Marker key={pin.key} id={pin.key} lngLat={[pin.lng, pin.lat]}>
            <View collapsable={false}>
              <CategoryPin category={pin.category} size={pin.small ? 22 : 30} dimmed={pin.small} />
            </View>
          </Marker>
        ))}

        {p.flag ? (
          <Marker id="flag" lngLat={[p.flag.lng, p.flag.lat]} anchor="bottom">
            <View collapsable={false}>
              <Ionicons name="flag" size={30} color={colors.text} />
            </View>
          </Marker>
        ) : null}
      </Map>
    </View>
  );
}

function AlertPin({ alert, onPress }: { alert: MapAlert; onPress?: (a: MapAlert) => void }) {
  return (
    <Marker
      id={`alert-${alert.id}`}
      lngLat={[alert.lng, alert.lat]}
      onPress={() => onPress?.(alert)}
      accessibilityLabel={`${alert.category} alert`}
    >
      <View collapsable={false}>
        <CategoryPin category={alert.category} dimmed={alert.status === 'grey_zone' && !alert.hot} />
      </View>
    </Marker>
  );
}

function RouteLine({ id, route }: { id: string; route: RouteLineSpec }) {
  const data = useMemo(() => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: route.coords.map((c) => [c.lng, c.lat]) },
  }), [route.coords]);
  return (
    <GeoJSONSource
      id={id}
      data={data}
      hitbox={{ top: 12, right: 12, bottom: 12, left: 12 }}
      onPress={route.onPress ? (e) => { e.stopPropagation(); route.onPress?.(); } : undefined}
    >
      <Layer
        type="line"
        id={`${id}-line`}
        source={id}
        layout={{ 'line-cap': route.dashed ? 'butt' : 'round', 'line-join': 'round' }}
        paint={{
          'line-color': route.color,
          'line-width': route.faded ? 4 : 6,
          'line-opacity': route.faded ? 0.55 : 1,
          ...(route.dashed ? { 'line-dasharray': [2, 1.3] } : {}),
        }}
      />
    </GeoJSONSource>
  );
}

type Props = Record<string, string | number>;

function polygonFeature(id: string, center: LatLng, radiusM: number, properties: Props) {
  return {
    type: 'Feature' as const,
    id,
    properties,
    geometry: { type: 'Polygon' as const, coordinates: [circleRing(center, radiusM)] },
  };
}

function featureCollection<F>(features: F[]) {
  return { type: 'FeatureCollection' as const, features };
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
