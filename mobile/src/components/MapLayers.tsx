import { memo, useEffect, useMemo, useState } from 'react';
import { Circle, Marker } from 'react-native-maps';
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
 * Heatmap as wide, soft "heat clouds" (same on Android and iPhone): nearby points are grouped into
 * hotspots, each drawn as 4 strokeless concentric circles sized in metres (~320 → 65 m, scaled by
 * severity) with a warm yellow → red gradient at 8–22% opacity, so overlaps blend and names stay readable.
 */
export const HeatLayer = memo(function HeatLayer({ points }: { points: HeatPoint[] }) {
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
