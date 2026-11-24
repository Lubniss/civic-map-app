// Routing + geocoding providers (swappable). PLAN.md → phase 6.
// Primary: OpenRouteService through HeiGIT's unified API (api.heigit.org; the old api.openrouteservice.org
//          was shut down in Nov 2026). Fallback without a key: OSRM run by FOSSGIS (routing.openstreetmap.de).
import { env } from './env.js';
import { ApiError } from './errors.js';

export type TravelMode = 'walking' | 'driving';

export interface ProviderRoute {
  coordinates: [number, number][]; // [lng, lat]
  distanceM: number;
  durationS: number;
}

const HEIGIT = 'https://api.heigit.org';
const ORS_PROFILE: Record<TravelMode, string> = { walking: 'foot-walking', driving: 'driving-car' };
const OSRM_HOST: Record<TravelMode, string> = {
  walking: 'https://routing.openstreetmap.de/routed-foot',
  driving: 'https://routing.openstreetmap.de/routed-car',
};
const USER_AGENT = 'CivicMapAlerting/0.1 (server)';
const TIMEOUT_MS = 15_000;

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) } });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

interface OrsFeature {
  geometry: { coordinates: [number, number][] };
  properties: { summary: { distance?: number; duration?: number } };
}

/** ORS directions. `avoid` is a GeoJSON Polygon/MultiPolygon string to route around. */
async function orsRoutes(mode: TravelMode, from: [number, number], to: [number, number], opts: { alternatives: boolean; avoid?: string }) {
  const body: Record<string, unknown> = { coordinates: [from, to] };
  if (opts.alternatives) body.alternative_routes = { target_count: 3, share_factor: 0.6, weight_factor: 1.6 };
  if (opts.avoid) body.options = { avoid_polygons: JSON.parse(opts.avoid) };
  const { status, data } = await fetchJson(`${HEIGIT}/openrouteservice/v2/directions/${ORS_PROFILE[mode]}/geojson`, {
    method: 'POST',
    headers: { Authorization: env.ORS_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/geo+json, application/json' },
    body: JSON.stringify(body),
  });
  if (status === 404 || (status === 400 && JSON.stringify(data).includes('Could not find routable point'))) return [];
  if (status !== 200) throw new Error(`ORS ${status}: ${JSON.stringify(data).slice(0, 200)}`);
  const features = (data as { features?: OrsFeature[] }).features ?? [];
  return features.map((f) => ({
    coordinates: f.geometry.coordinates.map((c) => [c[0], c[1]] as [number, number]),
    distanceM: f.properties.summary.distance ?? 0,
    durationS: f.properties.summary.duration ?? 0,
  }));
}

async function osrmRoutes(mode: TravelMode, from: [number, number], to: [number, number]): Promise<ProviderRoute[]> {
  const url = `${OSRM_HOST[mode]}/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?alternatives=3&overview=full&geometries=geojson`;
  const { status, data } = await fetchJson(url, { method: 'GET' });
  const d = data as { code?: string; routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[] };
  if (d?.code === 'NoRoute') return [];
  if (status !== 200 || d?.code !== 'Ok') throw new Error(`OSRM ${status}: ${JSON.stringify(data).slice(0, 200)}`);
  return (d.routes ?? []).map((r) => ({ coordinates: r.geometry.coordinates, distanceM: r.distance, durationS: r.duration }));
}

/** Normal routes (fastest + alternatives). Uses ORS when a key is set, otherwise OSRM. */
export async function getRoutes(mode: TravelMode, from: [number, number], to: [number, number]): Promise<ProviderRoute[]> {
  if (env.ORS_API_KEY) {
    try {
      return await orsRoutes(mode, from, to, { alternatives: true });
    } catch (e) {
      console.error('ORS directions failed, falling back to OSRM:', (e as Error).message);
    }
  }
  try {
    return await osrmRoutes(mode, from, to);
  } catch (e) {
    console.error('OSRM failed:', (e as Error).message);
    throw new ApiError(503, 'ROUTING_UNAVAILABLE', "Couldn't get routes right now. Try again.");
  }
}

/** One route that avoids the given polygons (ORS only). Returns null on any failure; never breaks planning. */
export async function getAvoidRoute(mode: TravelMode, from: [number, number], to: [number, number], avoid: string): Promise<ProviderRoute | null> {
  if (!env.ORS_API_KEY) return null;
  try {
    const routes = await orsRoutes(mode, from, to, { alternatives: false, avoid });
    return routes[0] ?? null;
  } catch (e) {
    console.error('Avoid-hazards route failed (continuing without it):', (e as Error).message);
    return null;
  }
}

// ---------------- Geocoding (Pelias via HeiGIT), with a small in-memory cache ----------------
export interface Place {
  label: string;
  lat: number;
  lng: number;
}

const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 500;

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return value;
}

interface PeliasResponse {
  features?: { geometry: { coordinates: [number, number] }; properties: { label?: string; name?: string } }[];
}

function requireKey() {
  if (!env.ORS_API_KEY) throw new ApiError(503, 'SEARCH_UNAVAILABLE', 'Place search is not set up on the server.');
}

export async function searchPlaces(text: string, focus?: { lat: number; lng: number }): Promise<Place[]> {
  requireKey();
  const q = text.trim().slice(0, 100);
  const params = new URLSearchParams({ text: q, size: '6' });
  if (focus) {
    params.set('focus.point.lat', focus.lat.toFixed(3));
    params.set('focus.point.lon', focus.lng.toFixed(3));
  }
  return cached(`search:${params}`, async () => {
    const { status, data } = await fetchJson(`${HEIGIT}/pelias/v1/autocomplete?${params}`, { method: 'GET', headers: { Authorization: env.ORS_API_KEY! } });
    if (status !== 200) throw new ApiError(503, 'SEARCH_UNAVAILABLE', "Place search isn't working right now. Try again or pick on the map.");
    return ((data as PeliasResponse).features ?? []).map((f) => ({
      label: f.properties.label ?? f.properties.name ?? 'Unnamed place',
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
  });
}

export async function reversePlace(lat: number, lng: number): Promise<Place | null> {
  requireKey();
  const key = `rev:${lat.toFixed(4)},${lng.toFixed(4)}`;
  return cached(key, async () => {
    const params = new URLSearchParams({ 'point.lat': String(lat), 'point.lon': String(lng), size: '1' });
    const { status, data } = await fetchJson(`${HEIGIT}/pelias/v1/reverse?${params}`, { method: 'GET', headers: { Authorization: env.ORS_API_KEY! } });
    if (status !== 200) return null;
    const f = (data as PeliasResponse).features?.[0];
    return f ? { label: f.properties.label ?? f.properties.name ?? 'Selected spot', lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] } : null;
  });
}
