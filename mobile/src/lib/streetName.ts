// Readable street / area names via the phone's own geocoder (free, no key). Debounced and cached.
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

const cache = new Map<string, string>();
const keyFor = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

function format(a: Location.LocationGeocodedAddress | undefined): string | null {
  if (!a) return null;
  const first = a.street ?? a.name ?? null;
  const area = a.district ?? a.subregion ?? a.city ?? null;
  if (first && area && first !== area) return `${first}, ${area}`;
  return first ?? area ?? a.city ?? null;
}

export async function lookupStreetName(lat: number, lng: number): Promise<string | null> {
  const key = keyFor(lat, lng);
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const name = format(results[0]);
    if (name) cache.set(key, name);
    return name;
  } catch {
    return null;
  }
}

/** Street name for a point, updated `delay` ms after it stops changing. */
export function useStreetName(point: { lat: number; lng: number } | null, delay = 600) {
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lat = point?.lat;
  const lng = point?.lng;

  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    const cached = cache.get(keyFor(lat, lng));
    if (cached) {
      setName(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    let active = true;
    const t = setTimeout(async () => {
      const n = await lookupStreetName(lat, lng);
      if (active) {
        setName(n);
        setLoading(false);
      }
    }, delay);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [lat, lng, delay]);

  return { name, loading };
}
