// Picks the fastest and the safest route and explains the difference. Pure; tests/routePlanner.test.ts.
import type { Category } from './categories.js';
import type { NearbyAlert, RouteRiskLevel } from './risk.js';

export interface ScoredRoute {
  /** Where the route came from: 'normal' alternatives or the 'avoid' (avoid-hazards) request. */
  source: 'normal' | 'avoid';
  coordinates: [number, number][]; // [lng, lat]
  distanceM: number;
  durationS: number;
  riskScore: number;
  riskLevel: RouteRiskLevel;
  alerts: NearbyAlert[];
}

export interface Plan {
  fastest: ScoredRoute;
  safest: ScoredRoute;
  sameRoute: boolean;
  explanation: string;
}

/** Two routes are "the same" if their length and time are within 3% / 30 s and they share most of their shape. */
export function isSameRoute(a: ScoredRoute, b: ScoredRoute): boolean {
  if (a === b) return true;
  if (Math.abs(a.distanceM - b.distanceM) > Math.max(30, a.distanceM * 0.03)) return false;
  if (Math.abs(a.durationS - b.durationS) > 30) return false;
  const idsA = new Set(a.alerts.map((x) => x.id));
  return b.alerts.every((x) => idsA.has(x.id)) && a.alerts.length === b.alerts.length;
}

/** A safer route is only offered if it cuts risk by ≥ 25% and ≥ 5 points… */
export const MIN_RISK_CUT_RATIO = 0.25;
export const MIN_RISK_CUT_POINTS = 5;
/** …and adds no more than max(15 min, 60% of the fastest trip). */
export const MAX_EXTRA_S = 15 * 60;
export const MAX_EXTRA_RATIO = 0.6;

/** Is this safer route worth the extra time compared with the fastest? */
export function worthTheDetour(fastest: ScoredRoute, candidate: ScoredRoute): boolean {
  const cut = fastest.riskScore - candidate.riskScore;
  if (cut < MIN_RISK_CUT_POINTS || cut < fastest.riskScore * MIN_RISK_CUT_RATIO) return false;
  const extra = candidate.durationS - fastest.durationS;
  return extra <= Math.max(MAX_EXTRA_S, fastest.durationS * MAX_EXTRA_RATIO);
}

export function pickRoutes(routes: ScoredRoute[]): Plan | null {
  if (!routes.length) return null;
  const fastest = [...routes].sort((a, b) => a.durationS - b.durationS || a.riskScore - b.riskScore)[0]!;
  // Safest = lowest risk among the routes that are worth the detour (ties → shorter).
  const worth = routes.filter((r) => r !== fastest && !isSameRoute(fastest, r) && worthTheDetour(fastest, r));
  const safest = worth.sort((a, b) => a.riskScore - b.riskScore || a.durationS - b.durationS)[0];
  if (!safest) {
    // Mention a rejected detour so the user knows we looked.
    const rejected = routes
      .filter((r) => r !== fastest && !isSameRoute(fastest, r) && r.riskScore < fastest.riskScore)
      .sort((a, b) => a.riskScore - b.riskScore)[0];
    return { fastest, safest: fastest, sameRoute: true, explanation: explainSame(fastest, rejected) };
  }
  return { fastest, safest, sameRoute: false, explanation: explain(fastest, safest, false) };
}

function explainSame(fastest: ScoredRoute, rejected: ScoredRoute | undefined): string {
  if (rejected) {
    return `No safer route is worth the detour (best option: ${timeDiffText(rejected, fastest)}). Take care on this route.`;
  }
  return explain(fastest, fastest, true);
}

const PHRASE: Record<Category, [string, string]> = {
  unsafe: ['unsafe-area alert', 'unsafe-area alerts'],
  harassment: ['harassment report', 'harassment reports'],
  fire: ['fire incident', 'fire incidents'],
  accident: ['accident spot', 'accident spots'],
  light: ['poorly lit stretch', 'poorly lit stretches'],
  road: ['damaged road', 'damaged roads'],
  water: ['drainage problem', 'drainage problems'],
  garbage: ['waste spot', 'waste spots'],
  other: ['other issue', 'other issues'],
};

const ORDER: Category[] = ['unsafe', 'harassment', 'fire', 'accident', 'light', 'road', 'water', 'garbage', 'other'];

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function timeDiffText(safest: ScoredRoute, fastest: ScoredRoute): string {
  const mins = Math.round((safest.durationS - fastest.durationS) / 60);
  if (mins === 0) return 'same time';
  return mins > 0 ? `+${mins} min` : `${mins} min`;
}

/** e.g. "Avoids 2 unsafe-area alerts and 1 poorly lit stretch; +4 min" */
export function explain(fastest: ScoredRoute, safest: ScoredRoute, sameRoute: boolean): string {
  if (sameRoute) {
    return fastest.alerts.length ? 'The fastest route is also the safest one available.' : 'The fastest route is also the safest. No reported problems along it.';
  }
  const onSafest = new Set(safest.alerts.map((a) => a.id));
  const avoided = fastest.alerts.filter((a) => !onSafest.has(a.id));
  const counts = new Map<Category, number>();
  for (const a of avoided) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  const parts = ORDER.filter((c) => counts.has(c)).map((c) => {
    const n = counts.get(c)!;
    return `${n} ${PHRASE[c][n === 1 ? 0 : 1]}`;
  });
  const time = timeDiffText(safest, fastest);
  if (!parts.length) return `Lower-risk streets; ${time}`;
  return `Avoids ${joinList(parts)}; ${time}`;
}

// ---------------- Avoid circles (steer around hazards on the fastest route) ----------------
export interface AvoidCircle {
  lat: number;
  lng: number;
  radiusM: number;
  weight: number;
}

const M_PER_DEG = 111_320;
const metresBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const dLat = (a.lat - b.lat) * M_PER_DEG;
  const dLng = (a.lng - b.lng) * M_PER_DEG * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
};

/**
 * Circles around the most dangerous alerts on a route, sized to reach the road
 * (distance from the route + 25 m, 50–160 m), skipping any that would cover the start or destination.
 */
export function hazardCircles(
  alerts: (NearbyAlert & { points: number })[],
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  max = 8,
): AvoidCircle[] {
  return alerts
    .filter((a) => a.points >= 2)
    .sort((a, b) => b.points - a.points)
    .map((a) => ({ lat: a.lat, lng: a.lng, radiusM: Math.min(160, Math.max(50, a.distance_m + 25)), weight: a.points }))
    .filter((c) => metresBetween(c, origin) > c.radiusM + 15 && metresBetween(c, destination) > c.radiusM + 15)
    .slice(0, max);
}

/** Overlapping circles are merged into one circle covering both (valid, non-overlapping polygons). */
export function mergeCircles(circles: AvoidCircle[]): AvoidCircle[] {
  const out = circles.map((c) => ({ ...c }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!;
        const b = out[j]!;
        const d = metresBetween(a, b);
        if (d < a.radiusM + b.radiusM) {
          const r = (d + a.radiusM + b.radiusM) / 2;
          const t = d === 0 ? 0 : (r - a.radiusM) / d;
          out[i] = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, radiusM: Math.min(r, 400), weight: a.weight + b.weight };
          out.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return out;
}

/** 16-sided circles as a GeoJSON MultiPolygon string for the routing provider's avoid_polygons. */
export function circlesToGeoJson(circles: AvoidCircle[], segments = 16): string | null {
  if (!circles.length) return null;
  const polys = circles.map((c) => {
    const ring: [number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * 2 * Math.PI;
      const dLat = (c.radiusM * Math.sin(a)) / M_PER_DEG;
      const dLng = (c.radiusM * Math.cos(a)) / (M_PER_DEG * Math.cos((c.lat * Math.PI) / 180));
      ring.push([Number((c.lng + dLng).toFixed(6)), Number((c.lat + dLat).toFixed(6))]);
    }
    return [ring];
  });
  return JSON.stringify({ type: 'MultiPolygon', coordinates: polys });
}

/** Douglas–Peucker simplification (~tolerance in degrees; 0.00005 ≈ 5 m) to keep responses small. */
export function simplify(coords: [number, number][], tolerance = 0.00005, maxPoints = 600): [number, number][] {
  if (coords.length <= 2) return coords;
  const keep = new Uint8Array(coords.length);
  keep[0] = 1;
  keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [x1, y1] = coords[s]!;
    const [x2, y2] = coords[e]!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const [x, y] = coords[i]!;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len)) : 0;
      const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx > 0 && maxD > tolerance) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = coords.filter((_, i) => keep[i]);
  if (out.length <= maxPoints) return out;
  const step = Math.ceil(out.length / maxPoints);
  return out.filter((_, i) => i % step === 0 || i === out.length - 1);
}
