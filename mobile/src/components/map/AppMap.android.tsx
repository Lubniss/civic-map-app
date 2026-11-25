// Android picks its map engine when the app starts:
// - The installed Civic Map app (dev build / APK) has MapLibre's native module: MapLibre + OpenFreeMap (no key needed).
// - Expo Go doesn't include it: react-native-maps (Google Maps works in Expo Go without a key).
// We check for the native module itself (not "am I in Expo Go?", which proved unreliable), and use require()
// so Expo Go never loads MapLibre's JS, which throws at import when its native module is missing.
import type { Ref } from 'react';
import { TurboModuleRegistry } from 'react-native';
import type { AppMapProps, AppMapRef } from './types';

type AppMapComponent = (props: AppMapProps & { ref?: Ref<AppMapRef> }) => React.ReactElement;

function hasMapLibre(): boolean {
  try {
    return TurboModuleRegistry.get('MLRNCameraModule') != null;
  } catch {
    return false;
  }
}

export const AppMap: AppMapComponent = hasMapLibre()
  ? require('./AppMap.maplibre').AppMap
  : require('./AppMap.rnmaps').AppMap;
