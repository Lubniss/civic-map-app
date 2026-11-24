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

export function pickRoutes(routes: ScoredRoute[]): Plan | null {
  if (!routes.length) return null;
  const fastest = [...routes].sort((a, b) => a.durationS - b.durationS || a.riskScore - b.riskScore)[0]!;
  const safest = [...routes].sort((a, b) => a.riskScore - b.riskScore || a.durationS - b.durationS)[0]!;
  const same = isSameRoute(fastest, safest) || safest.riskScore >= fastest.riskScore;
  const chosenSafest = same ? fastest : safest;
  return { fastest, safest: chosenSafest, sameRoute: same, explanation: explain(fastest, chosenSafest, same) };
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
