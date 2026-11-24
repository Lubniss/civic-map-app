// Turns heat points into a few soft "heat clouds" (hotspots), each drawn as 5 concentric circles in metres,
// in the original Google-heatmap colours (green → yellow → orange → red) with wide green and yellow bands.
// Used on both Android and iPhone (Google's <Heatmap> caps its radius at 50 px, far too small here).
import type { HeatPoint } from './types';

export interface HeatRing {
  radius: number;
  fill: string;
}

export interface HeatCloud {
  key: string;
  lat: number;
  lng: number;
  /** Sum of point weights (severity / 3 each). */
  weight: number;
  count: number;
  rings: HeatRing[];
}

/** Hotspot grouping cell, ~150 m. */
const CELL_M = 150;
const METRES_PER_DEG = 111_320;
/** Base ring radii in metres: wide green haze → larger yellow band → orange → deep orange → red core. */
const BASE_RADII = [380, 270, 160, 100, 55];
/** The original Google-heatmap colours: green → yellow → orange → deep orange → red. */
const RING_RGB = ['74, 222, 128', '250, 204, 21', '249, 115, 22', '234, 88, 12', '220, 38, 38'];
const BASE_ALPHA = [0.1, 0.13, 0.17, 0.22, 0.3];
export const MAX_CLOUDS = 50;

export function buildHeatClouds(points: HeatPoint[], isDark: boolean): HeatCloud[] {
  if (!points.length) return [];

  // 1. Group points into ~150 m grid cells.
  const cells = new Map<string, { latSum: number; lngSum: number; weight: number; count: number }>();
  for (const p of points) {
    const dLng = CELL_M / (METRES_PER_DEG * Math.max(Math.cos((p.lat * Math.PI) / 180), 0.1));
    const key = `${Math.round(p.lat / (CELL_M / METRES_PER_DEG))}:${Math.round(p.lng / dLng)}`;
    const c = cells.get(key) ?? { latSum: 0, lngSum: 0, weight: 0, count: 0 };
    c.latSum += p.lat * p.weight;
    c.lngSum += p.lng * p.weight;
    c.weight += p.weight;
    c.count += 1;
    cells.set(key, c);
  }

  // 2. Biggest hotspots first, capped for smooth panning.
  const sorted = [...cells.entries()].sort((a, b) => b[1].weight - a[1].weight).slice(0, MAX_CLOUDS);
  const maxWeight = sorted[0]?.[1].weight ?? 1;

  return sorted.map(([key, c]) => {
    const w = c.weight || 0.01;
    // Size grows with total severity: a single low report ≈ 0.7×, a busy hotspot up to 1.5×.
    const scale = Math.min(1.5, 0.6 + 0.35 * Math.sqrt(w));
    // Stronger hotspots are a little more opaque (relative to the strongest on screen).
    const intensity = 0.75 + 0.25 * (w / maxWeight);
    const darkBoost = isDark ? 1.15 : 1;
    return {
      key,
      lat: c.latSum / w,
      lng: c.lngSum / w,
      weight: w,
      count: c.count,
      rings: BASE_RADII.map((r, i) => ({
        radius: Math.round(r * scale),
        fill: `rgba(${RING_RGB[i]}, ${Math.min(0.36, BASE_ALPHA[i]! * intensity * darkBoost).toFixed(3)})`,
      })),
    };
  });
}
