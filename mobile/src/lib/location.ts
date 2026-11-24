import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

export type LocationState =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'ready'; coords: { latitude: number; longitude: number; accuracy: number | null }; timestamp: number };

/** Asks for foreground location once, then returns the phone's position (fast last-known first, then a fresh fix). */
export function useMyLocation() {
  const [state, setState] = useState<LocationState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      setState({ status: 'denied' });
      return null;
    }
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    if (last) setState({ status: 'ready', coords: last.coords, timestamp: last.timestamp });
    try {
      const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setState({ status: 'ready', coords: fresh.coords, timestamp: fresh.timestamp });
      return fresh.coords;
    } catch {
      if (!last) setState({ status: 'denied' });
      return last?.coords ?? null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { location: state, refresh };
}
