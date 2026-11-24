// Route risk scoring (PLAN.md → phase 6). Pure functions, covered by tests/risk.test.ts.
import type { Category } from './categories.js';

export interface NearbyAlert {
  id: string;
  category: Category;
  status: string;
  /** Red zone or recent grey zone. */
  hot: boolean;
  avg_severity: number | string;
  lat: number;
  lng: number;
  distance_m: number;
}

export type RouteRiskLevel = 'Safe' | 'Moderate' | 'High';

export const CATEGORY_WEIGHT: Record<Category, number> = {
  unsafe: 10,
  harassment: 10,
  fire: 10,
  accident: 6,
  light: 6,
  road: 2,
  water: 1.5,
  garbage: 1,
  other: 1,
};

/** Night-time boost applies to these between 8 PM and 5 AM (phone's local time). */
const NIGHT_BOOSTED: ReadonlySet<Category> = new Set(['unsafe', 'harassment', 'light']);
export const BUFFER_M = 150;

export const isNightHour = (hour: number) => hour >= 20 || hour < 5;

/** verified 1.0 · red zone 1.0 · hot grey zone 1.0 · cooled grey zone 0.5 */
export function statusFactor(a: Pick<NearbyAlert, 'status' | 'hot'>): number {
  if (a.status === 'grey_zone' && !a.hot) return 0.5;
  return 1;
}

/** 1.0 on the route, falling linearly to 0.5 at 150 m. */
export function closenessFactor(distanceM: number): number {
  const d = Math.min(Math.max(distanceM, 0), BUFFER_M);
  return 1 - 0.5 * (d / BUFFER_M);
}

export function alertPoints(a: NearbyAlert, localHour: number): number {
  const night = isNightHour(localHour) && NIGHT_BOOSTED.has(a.category) ? 1.5 : 1;
  const sev = Number(a.avg_severity) || 1;
  return CATEGORY_WEIGHT[a.category] * sev * statusFactor(a) * closenessFactor(a.distance_m) * night;
}

export function riskLevel(score: number): RouteRiskLevel {
  if (score < 5) return 'Safe';
  if (score < 15) return 'Moderate';
  return 'High';
}

export function scoreRoute(alerts: NearbyAlert[], localHour: number): { score: number; level: RouteRiskLevel } {
  const score = Math.round(alerts.reduce((sum, a) => sum + alertPoints(a, localHour), 0) * 10) / 10;
  return { score, level: riskLevel(score) };
}
