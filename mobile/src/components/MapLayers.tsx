import { memo, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Circle, Heatmap, Marker } from 'react-native-maps';
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
 * Heatmap. Android (Google Maps) uses the real heatmap; iPhone in Expo Go uses Apple Maps,
 * which has no heatmap, so it falls back to soft overlapping circles.
 */
export function HeatLayer({ points }: { points: HeatPoint[] }) {
  const { zones } = useTheme();
  if (Platform.OS === 'android') {
    if (!points.length) return null;
    return (
      <Heatmap
        points={points.map((p) => ({ latitude: p.lat, longitude: p.lng, weight: p.weight }))}
        radius={40}
        opacity={0.75}
        gradient={{ colors: ['#86EFAC', '#FACC15', '#F97316', '#DC2626'], startPoints: [0.1, 0.4, 0.7, 1], colorMapSize: 256 }}
      />
    );
  }
  return (
    <>
      {points.slice(0, 400).map((p, i) => (
        <Circle
          key={`${p.lat},${p.lng},${i}`}
          center={{ latitude: p.lat, longitude: p.lng }}
          radius={60 + p.weight * 60}
          strokeWidth={0}
          fillColor={zones.redFill}
        />
      ))}
    </>
  );
}
