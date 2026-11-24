import { memo, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { Circle, Heatmap, Marker } from 'react-native-maps';
import { buildHeatClouds } from '@/lib/heatClouds';
import type { HeatPoint, MapAlert } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { CategoryPin } from './CategoryIcon';

/** Zones are drawn as 150 m circles around emergency alerts. */
export const ZONE_RADIUS_M = 150;

/**
 * One alert on the map: a category pin, plus a red (active) or grey (cooled) circle for
 * red zones and grey zones. Custom marker views are redrawn briefly, then frozen for speed.
 */
export const AlertMarker = memo(function AlertMarker({ alert, onPress }: { alert: MapAlert; onPress: (a: MapAlert) => void }) {
  const { zones, scheme } = useTheme();
  const [track, setTrack] = useState(true);

  // Let the custom view render (fixes blank markers on Android), then stop tracking for performance.
  useEffect(() => {
    setTrack(true);
    const t = setTimeout(() => setTrack(false), 600);
    return () => clearTimeout(t);
  }, [scheme, alert.status, alert.hot]);

  const isZone = alert.status === 'red_zone' || alert.status === 'grey_zone';
  const coordinate = { latitude: alert.lat, longitude: alert.lng };

  return (
    <>
      {isZone ? (
        <Circle
          center={coordinate}
          radius={ZONE_RADIUS_M}
          strokeWidth={2}
          strokeColor={alert.hot ? zones.red : zones.grey}
          fillColor={alert.hot ? zones.redFill : zones.greyFill}
          zIndex={1}
        />
      ) : null}
      <Marker
        coordinate={coordinate}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={track}
        onPress={() => onPress(alert)}
        accessibilityLabel={`${alert.category} alert`}
      >
        <CategoryPin category={alert.category} dimmed={alert.status === 'grey_zone' && !alert.hot} />
      </Marker>
    </>
  );
});

/**
 * Google's native smooth heatmap (Android), as in the first version, with more room for green and
 * yellow: maximum spread (radius 50 px, the Android limit) and colour stops shifted so green covers
 * the outer 0–35% of each hotspot and yellow the next 35–65%, before orange and a red core.
 */
const HEAT_GRADIENT = {
  colors: ['#86EFAC', '#4ADE80', '#FACC15', '#F97316', '#DC2626'],
  startPoints: [0.01, 0.12, 0.35, 0.65, 1],
  colorMapSize: 256,
};

export const HeatLayer = memo(function HeatLayer({ points }: { points: HeatPoint[] }) {
  if (Platform.OS === 'android') {
    if (!points.length) return null;
    return (
      <Heatmap
        points={points.map((p) => ({ latitude: p.lat, longitude: p.lng, weight: p.weight }))}
        radius={50}
        opacity={0.8}
        gradient={HEAT_GRADIENT}
      />
    );
  }
  // iPhone in Expo Go only has Apple Maps, which has no heatmap: soft fallback until the
  // phase 8 app build brings Google Maps (and this native heatmap) to iPhone.
  return <HeatCloudsFallback points={points} />;
});

const HeatCloudsFallback = memo(function HeatCloudsFallback({ points }: { points: HeatPoint[] }) {
  const { isDark } = useTheme();
  const clouds = useMemo(() => buildHeatClouds(points, isDark), [points, isDark]);
  return (
    <>
      {clouds.map((c) =>
        c.rings.map((ring, i) => (
          <Circle
            key={`${c.key}-${i}-${isDark ? 'd' : 'l'}`}
            center={{ latitude: c.lat, longitude: c.lng }}
            radius={ring.radius}
            strokeWidth={0}
            strokeColor="transparent"
            fillColor={ring.fill}
            zIndex={i}
          />
        )),
      )}
    </>
  );
});
