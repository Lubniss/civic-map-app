// Android picks its map engine when the app starts:
// - Expo Go doesn't include MapLibre, so it uses react-native-maps (Google Maps works in Expo Go without a key).
// - The installed Civic Map app (dev build / APK) uses MapLibre + OpenFreeMap (no key needed).
// require() instead of import, so Expo Go never loads MapLibre's native module.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { Ref } from 'react';
import type { AppMapProps, AppMapRef } from './types';

type AppMapComponent = (props: AppMapProps & { ref?: Ref<AppMapRef> }) => React.ReactElement;

const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const AppMap: AppMapComponent = inExpoGo
  ? require('./AppMap.rnmaps').AppMap
  : require('./AppMap.maplibre').AppMap;
