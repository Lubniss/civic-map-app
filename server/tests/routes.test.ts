import { describe, expect, it } from 'vitest';
import type { Category } from '../src/categories.js';
import { alertPoints, closenessFactor, riskLevel, scoreRoute, statusFactor, type NearbyAlert } from '../src/risk.js';
import { explain, isSameRoute, pickRoutes, simplify, timeDiffText, type ScoredRoute } from '../src/routePlanner.js';

let n = 0;
const alert = (category: Category, extra: Partial<NearbyAlert> = {}): NearbyAlert => ({
  id: `a${n++}`, category, status: 'verified', hot: false, avg_severity: 2, lat: 0, lng: 0, distance_m: 0, ...extra,
});
const DAY = 12;
const NIGHT = 22;

describe('risk scoring', () => {
  it('weights categories as planned (severity 2, on the route, daytime)', () => {
    expect(alertPoints(alert('unsafe'), DAY)).toBe(20);
    expect(alertPoints(alert('harassment'), DAY)).toBe(20);
    expect(alertPoints(alert('fire'), DAY)).toBe(20);
    expect(alertPoints(alert('accident'), DAY)).toBe(12);
    expect(alertPoints(alert('light'), DAY)).toBe(12);
    expect(alertPoints(alert('road'), DAY)).toBe(4);
    expect(alertPoints(alert('water'), DAY)).toBe(3);
    expect(alertPoints(alert('garbage'), DAY)).toBe(2);
  });

  it('closeness falls from 1.0 on the route to 0.5 at 150 m', () => {
    expect(closenessFactor(0)).toBe(1);
    expect(closenessFactor(75)).toBe(0.75);
    expect(closenessFactor(150)).toBe(0.5);
    expect(closenessFactor(400)).toBe(0.5);
  });

  it('cooled grey zones count half; red zones, hot grey zones and verified count fully', () => {
    expect(statusFactor({ status: 'grey_zone', hot: false })).toBe(0.5);
    expect(statusFactor({ status: 'grey_zone', hot: true })).toBe(1);
    expect(statusFactor({ status: 'red_zone', hot: true })).toBe(1);
    expect(statusFactor({ status: 'verified', hot: false })).toBe(1);
  });

  it('boosts unsafe, harassment and streetlight ×1.5 between 8 PM and 5 AM only', () => {
    expect(alertPoints(alert('unsafe'), NIGHT)).toBe(30);
    expect(alertPoints(alert('light'), 3)).toBe(18);
    expect(alertPoints(alert('harassment'), 20)).toBe(30);
    expect(alertPoints(alert('unsafe'), 5)).toBe(20);
    expect(alertPoints(alert('garbage'), NIGHT)).toBe(2);
  });

  it('levels: Safe under 5, Moderate under 15, High at 15+', () => {
    expect(riskLevel(0)).toBe('Safe');
    expect(riskLevel(4.9)).toBe('Safe');
    expect(riskLevel(5)).toBe('Moderate');
    expect(riskLevel(14.9)).toBe('Moderate');
    expect(riskLevel(15)).toBe('High');
    expect(scoreRoute([alert('garbage'), alert('road', { distance_m: 150 })], DAY)).toEqual({ score: 4, level: 'Safe' });
  });
});

const route = (durationS: number, distanceM: number, alerts: NearbyAlert[], source: 'normal' | 'avoid' = 'normal'): ScoredRoute => {
  const { score, level } = scoreRoute(alerts, DAY);
  return { source, coordinates: [[0, 0], [1, 1]], distanceM, durationS, riskScore: score, riskLevel: level, alerts };
};

describe('route selection', () => {
  it('fastest = shortest time; safest = lowest risk', () => {
    const u1 = alert('unsafe');
    const u2 = alert('unsafe');
    const l1 = alert('light');
    const fast = route(600, 800, [u1, u2, l1]);
    const safe = route(840, 1100, [], 'avoid');
    const plan = pickRoutes([fast, safe])!;
    expect(plan.fastest).toBe(fast);
    expect(plan.safest).toBe(safe);
    expect(plan.sameRoute).toBe(false);
    expect(plan.explanation).toBe('Avoids 2 unsafe-area alerts and 1 poorly lit stretch; +4 min');
  });

  it('ties on risk go to the shorter route', () => {
    const a = route(700, 900, []);
    const b = route(650, 850, []);
    const plan = pickRoutes([a, b])!;
    expect(plan.fastest).toBe(b);
    expect(plan.safest).toBe(b);
    expect(plan.sameRoute).toBe(true);
  });

  it('says so when the fastest route is also the safest', () => {
    const only = route(600, 800, []);
    const plan = pickRoutes([only])!;
    expect(plan.sameRoute).toBe(true);
    expect(plan.explanation).toBe('The fastest route is also the safest. No reported problems along it.');
    const risky = route(600, 800, [alert('garbage')]);
    expect(pickRoutes([risky])!.explanation).toBe('The fastest route is also the safest one available.');
  });

  it('treats near-identical routes as the same', () => {
    const a = route(600, 1000, []);
    const b = route(610, 1010, []);
    expect(isSameRoute(a, b)).toBe(true);
    expect(isSameRoute(a, route(900, 1400, []))).toBe(false);
  });

  it('describes time differences', () => {
    expect(timeDiffText(route(600, 1, []), route(600, 1, []))).toBe('same time');
    expect(timeDiffText(route(900, 1, []), route(600, 1, []))).toBe('+5 min');
  });

  it('mentions lower-risk streets when it avoids nothing specific', () => {
    const fast = route(600, 800, [alert('garbage', { id: 'g', distance_m: 0 })]);
    const safe = route(660, 900, [alert('garbage', { id: 'g', distance_m: 140 })]);
    expect(explain(fast, safe, false)).toBe('Lower-risk streets; +1 min');
  });

  it('returns nothing when there are no routes', () => {
    expect(pickRoutes([])).toBeNull();
  });
});

describe('simplify', () => {
  it('keeps the ends and drops points on a straight line', () => {
    const line: [number, number][] = Array.from({ length: 50 }, (_, i) => [i * 0.0001, 0]);
    const s = simplify(line);
    expect(s[0]).toEqual([0, 0]);
    expect(s[s.length - 1]).toEqual(line[49]);
    expect(s.length).toBe(2);
  });
  it('keeps corners', () => {
    const l: [number, number][] = [[0, 0], [0.001, 0], [0.001, 0.001]];
    expect(simplify(l)).toHaveLength(3);
  });
});
