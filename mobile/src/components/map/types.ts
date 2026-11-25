import type { Bbox, HeatPoint, MapAlert } from '@/lib/types';
import type { Category } from '@/theme/tokens';
export { ZONE_RADIUS_M } from '@/lib/zoneWarning';

/**
 * One map component, two engines (phase 7c):
 * - Android: MapLibre + OpenFreeMap (AppMap.android.tsx), no Google key needed.
 * - iPhone:  react-native-maps / Apple Maps (AppMap.ios.tsx), so it keeps working in Expo Go.
 * Screens describe what to draw with these plain props; each engine draws it its own way.
 */

export type LatLng = { lat: number; lng: number };
export type Insets = { top: number; right: number; bottom: number; left: number };

export interface RouteLineSpec {
  coords: LatLng[];
  color: string;
  dashed?: boolean;
  /** Drawn thinner and see-through (the route that isn't selected). */
  faded?: boolean;
  onPress?: () => void;
}

export interface PinSpec {
  key: string;
  lat: number;
  lng: number;
  category: Category;
  small?: boolean;
}

/** A real-size circle in metres (report screen: "you must be within 300 m"). */
export interface RingSpec {
  key: string;
  center: LatLng;
  radiusM: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface MapRegion {
  center: LatLng;
  bbox: Bbox;
}

export interface AppMapProps {
  initialCenter: LatLng;
  /** Degrees of longitude across the screen at start (0.02 ≈ 2 km). */
  initialDelta: number;
  /** Space covered by floating controls, so "centre" and "fit" mean the visible part of the map. */
  padding?: Insets;
  /** Where the small map-data credit (ⓘ) goes on Android; it must stay visible. */
  attributionPosition?: { top: number; left: number } | { top: number; right: number } | { bottom: number; left: number } | { bottom: number; right: number };
  showsUser?: boolean;
  rotate?: boolean;
  /** Called when the map stops moving. */
  onRegionChange?: (r: MapRegion) => void;
  /** Alert pins plus red/grey zone circles. */
  alerts?: MapAlert[];
  onAlertPress?: (a: MapAlert) => void;
  heat?: HeatPoint[] | null;
  /** Drawn in order: later ones on top. */
  routes?: RouteLineSpec[];
  pins?: PinSpec[];
  flag?: LatLng | null;
  rings?: RingSpec[];
}

export interface AppMapRef {
  /** Move to a spot, showing about `delta` degrees across. */
  moveTo(center: LatLng, delta: number, durationMs?: number): void;
  /** Fit all these points on screen, with extra space on each side. */
  fitTo(coords: LatLng[], padding: Insets): void;
}

/** Degrees across → MapLibre zoom level (360° = zoom 0). */
export const deltaToZoom = (delta: number) => Math.log2(360 / Math.max(delta, 1e-6));

/** A circle of `radiusM` metres as a polygon ring (lng/lat pairs), for maps that draw circles in pixels. */
export function circleRing(center: LatLng, radiusM: number, steps = 48): [number, number][] {
  const ring: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([center.lng + dLng * Math.cos(a), center.lat + dLat * Math.sin(a)]);
  }
  return ring;
}
