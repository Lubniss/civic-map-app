// Google map styles (Android). iPhone in Expo Go uses Apple Maps, which follows light/dark via
// `userInterfaceStyle` and can't be custom-styled.
//
// Light: Google's own full-colour default (an empty style array resets any previous custom style),
//        so parks, water, warm highways and Google's colour-coded place icons all show.
// Dark:  rich, higher-contrast night style: deep blue water, forest-green parks, clearly separated
//        roads with warm amber highways, and category-coloured place names. Google's place icons stay on.
import type { MapStyleElement } from 'react-native-maps';
import type { SchemeName } from './tokens';

const LIGHT: MapStyleElement[] = [];

const DARK: MapStyleElement[] = [
  // Base
  { elementType: 'geometry', stylers: [{ color: '#1B2622' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#A9BAB4' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111A18' }, { weight: 3 }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#202C29' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#1C2A25' }] },

  // Boundaries and area names
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#4A5A56' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#D2DDD9' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#9FB2AC' }] },

  // Water: rich deep blue
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#173D5C' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#8CB8D9' }] },

  // Parks: distinct forest green
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#183D2D' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#7CC49A' }] },
  { featureType: 'poi.sports_complex', elementType: 'geometry', stylers: [{ color: '#1A3A2C' }] },

  // Roads: higher contrast, warm amber highways
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2D3A46' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1E2731' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#B7C4CF' }] },
  { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: '#3A4A5A' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#8A6A2E' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#5E4A24' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#E8C987' }] },

  // Category-coloured place names (Google's colour icons stay visible)
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#B5C2BD' }] },
  { featureType: 'poi.business', elementType: 'labels.text.fill', stylers: [{ color: '#E0A85C' }] },
  { featureType: 'poi.attraction', elementType: 'labels.text.fill', stylers: [{ color: '#E0A85C' }] },
  { featureType: 'poi.school', elementType: 'labels.text.fill', stylers: [{ color: '#7FD1C4' }] },
  { featureType: 'poi.government', elementType: 'labels.text.fill', stylers: [{ color: '#B9A8F2' }] },
  { featureType: 'poi.place_of_worship', elementType: 'labels.text.fill', stylers: [{ color: '#B9A8F2' }] },
  { featureType: 'poi.medical', elementType: 'labels.text.fill', stylers: [{ color: '#F2998A' }] },
  { featureType: 'poi.sports_complex', elementType: 'labels.text.fill', stylers: [{ color: '#7CC49A' }] },

  // Transit: blue
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#3A4E66' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#7FB2F0' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#24364A' }] },
];

export function googleMapStyle(scheme: SchemeName): MapStyleElement[] {
  return scheme === 'dark' ? DARK : LIGHT;
}
