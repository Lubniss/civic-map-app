import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { me } from '../auth.js';
import { db } from '../db.js';
import { ApiError, fromDbError } from '../errors.js';
import { distanceM } from '../geo.js';
import { alertPoints, scoreRoute, type NearbyAlert } from '../risk.js';
import { circlesToGeoJson, hazardCircles, mergeCircles, pickRoutes, simplify, type ScoredRoute } from '../routePlanner.js';
import { getAvoidRoute, getRoutes, reversePlace, searchPlaces, type ProviderRoute } from '../routing.js';
import { parse } from '../schemas.js';

export const MAX_TRIP_M = 50_000;
/** How many times to try the "avoid hazards" route, dropping the least dangerous circles each time. */
export const AVOID_ATTEMPTS = 3;
export const routePlanRouter = Router();

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const planBody = z.object({
  origin: point,
  destination: point,
  mode: z.enum(['walking', 'driving']),
  /** Phone's local hour (0–23), for the night-time boost. */
  localHour: z.number().int().min(0).max(23),
});

// At most 30 route plans an hour per user (the routing provider has a daily quota).
const planLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 30,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'TOO_MANY_ROUTES', message: 'Too many route searches. Try again in a little while.' } });
  },
});

async function alertsNear(route: ProviderRoute): Promise<NearbyAlert[]> {
  const { data, error } = await db.rpc('alerts_near_route', {
    p_route: JSON.stringify({ type: 'LineString', coordinates: route.coordinates }),
    p_buffer_m: 150,
  });
  if (error) throw fromDbError(error);
  return (data ?? []) as NearbyAlert[];
}

/** Very similar routes (same length and time) are only scored once. */
function dedupe(routes: (ProviderRoute & { source: 'normal' | 'avoid' })[]) {
  const out: typeof routes = [];
  for (const r of routes) {
    const dup = out.some((o) => Math.abs(o.distanceM - r.distanceM) < 15 && Math.abs(o.durationS - r.durationS) < 15);
    if (!dup) out.push(r);
  }
  return out;
}

// POST /routes/plan { origin, destination, mode, localHour }
routePlanRouter.post('/routes/plan', planLimiter, async (req, res) => {
  const body = parse(planBody, req.body);
  me(req);
  const trip = distanceM(body.origin.lat, body.origin.lng, body.destination.lat, body.destination.lng);
  if (trip < 30) throw new ApiError(400, 'TOO_SHORT', 'Start and destination are almost the same place.');
  if (trip > MAX_TRIP_M) throw new ApiError(400, 'TOO_FAR', 'Routes can be at most 50 km. Pick a closer destination.');

  const from: [number, number] = [body.origin.lng, body.origin.lat];
  const to: [number, number] = [body.destination.lng, body.destination.lat];

  const score = async (r: ProviderRoute & { source: 'normal' | 'avoid' }): Promise<ScoredRoute> => {
    const alerts = await alertsNear(r);
    const { score: s, level } = scoreRoute(alerts, body.localHour);
    return { source: r.source, coordinates: r.coordinates, distanceM: r.distanceM, durationS: r.durationS, riskScore: s, riskLevel: level, alerts };
  };

  // 1. Normal routes (fastest + alternatives), scored against live alerts (PostGIS finds them, TypeScript scores them).
  const normal = await getRoutes(body.mode, from, to);
  if (!normal.length) throw new ApiError(404, 'NO_ROUTE', "We couldn't find a route between these places.");
  const scored: ScoredRoute[] = await Promise.all(dedupe(normal.map((r) => ({ ...r, source: 'normal' as const }))).map(score));

  // 2. One extra "avoid hazards" route around the dangerous alerts actually on the fastest route.
  //    Circles reach the road (distance + 25 m), overlaps are merged, start/destination are never covered.
  //    If no way round exists, the least dangerous circles are dropped and it retries (max 3 tries).
  //    Failure never breaks planning.
  const fastest = [...scored].sort((a, b) => a.durationS - b.durationS)[0]!;
  let circles = hazardCircles(
    fastest.alerts.map((a) => ({ ...a, points: alertPoints(a, body.localHour) })),
    body.origin,
    body.destination,
  );
  for (let attempt = 0; attempt < AVOID_ATTEMPTS && circles.length; attempt++) {
    const avoid = await getAvoidRoute(body.mode, from, to, circlesToGeoJson(mergeCircles(circles))!);
    if (avoid) {
      const isNew = !scored.some((s) => Math.abs(s.distanceM - avoid.distanceM) < 15 && Math.abs(s.durationS - avoid.durationS) < 15);
      if (isNew) scored.push(await score({ ...avoid, source: 'avoid' }));
      break;
    }
    circles = circles.slice(0, Math.max(0, circles.length - Math.max(1, Math.ceil(circles.length / 3))));
  }

  const plan = pickRoutes(scored)!;
  const toJson = (r: ScoredRoute) => ({
    coordinates: simplify(r.coordinates).map(([lng, lat]) => ({ lat, lng })),
    distanceM: Math.round(r.distanceM),
    durationS: Math.round(r.durationS),
    riskScore: r.riskScore,
    riskLevel: r.riskLevel,
    alerts: r.alerts.map((a) => ({ id: a.id, category: a.category, status: a.status, hot: a.hot, lat: a.lat, lng: a.lng })),
  });

  res.json({
    mode: body.mode,
    fastest: toJson(plan.fastest),
    safest: toJson(plan.safest),
    sameRoute: plan.sameRoute,
    explanation: plan.explanation,
    candidates: scored.length,
  });
});

const searchQuery = z.object({
  q: z.string().trim().min(2, 'Type at least 2 letters.').max(100),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

// GET /geocode?q=…&lat=&lng=  (lat/lng = focus point, e.g. the user's location)
routePlanRouter.get('/geocode', async (req, res) => {
  const q = parse(searchQuery, req.query);
  const focus = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined;
  res.json({ places: await searchPlaces(q.q, focus) });
});

const reverseQuery = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

// GET /geocode/reverse?lat=&lng=
routePlanRouter.get('/geocode/reverse', async (req, res) => {
  const q = parse(reverseQuery, req.query);
  res.json({ place: await reversePlace(q.lat, q.lng) });
});
