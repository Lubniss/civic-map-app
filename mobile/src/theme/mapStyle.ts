// Calm Google map styles (Android) built from the approved map colours.
// Points of interest and transit are muted so pins and zones stand out.
// iPhone in Expo Go uses Apple Maps, which follows light/dark through `userInterfaceStyle` instead.
import type { MapStyleElement } from 'react-native-maps';
import { mapColors, type SchemeName } from './tokens';

export function googleMapStyle(scheme: SchemeName): MapStyleElement[] {
  const c = mapColors[scheme];
  const dark = scheme === 'dark';
  return [
    { elementType: 'geometry', stylers: [{ color: c.land }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: c.label }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: c.land }, { weight: 3 }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: dark ? '#1C2E2A' : '#E3EEE6' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: c.road }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: dark ? '#1F2D2B' : '#E5E7EB' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: dark ? '#32433F' : '#FFFFFF' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: c.label }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: c.water }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: c.label }] },
  ];
}
