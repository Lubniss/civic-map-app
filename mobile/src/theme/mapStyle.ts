// Google map styles (Android) — lively but slightly muted (~15–20% below Google's defaults) so
// parks, water, highways and street / neighbourhood names stay readable while our alert pins and
// red zones still stand out. iPhone in Expo Go uses Apple Maps, which follows light/dark via
// `userInterfaceStyle` and can't be custom-styled.
// Google's built-in POI *icons* are hidden (we'll draw our own place icons); their names stay.
import type { MapStyleElement } from 'react-native-maps';
import type { SchemeName } from './tokens';

interface MapPalette {
  land: string;
  landMan: string;
  park: string;
  parkLabel: string;
  water: string;
  waterLabel: string;
  highway: string;
  highwayStroke: string;
  arterial: string;
  local: string;
  roadStroke: string;
  roadLabel: string;
  areaLabel: string;
  poiLabel: string;
  labelHalo: string;
  border: string;
  transit: string;
}

const palettes: Record<SchemeName, MapPalette> = {
  light: {
    land: '#F3F1EC',
    landMan: '#EEEBE4',
    park: '#CDE6C6',
    parkLabel: '#4F7A4A',
    water: '#AACFE4',
    waterLabel: '#4A7A99',
    highway: '#F5D9A6',
    highwayStroke: '#E3BE80',
    arterial: '#FFFFFF',
    local: '#FFFFFF',
    roadStroke: '#E2DED5',
    roadLabel: '#5B6470',
    areaLabel: '#6B6F7A',
    poiLabel: '#7A7468',
    labelHalo: '#F7F5F0',
    border: '#C9C3B8',
    transit: '#D9D4CB',
  },
  dark: {
    land: '#172422',
    landMan: '#1B2927',
    park: '#1E382E',
    parkLabel: '#7FAE8E',
    water: '#123241',
    waterLabel: '#6F9CB3',
    highway: '#544A35',
    highwayStroke: '#3E372A',
    arterial: '#2E3C3A',
    local: '#263432',
    roadStroke: '#1B2826',
    roadLabel: '#A7B8B3',
    areaLabel: '#93A7A2',
    poiLabel: '#8D9E99',
    labelHalo: '#121C1B',
    border: '#3A4A47',
    transit: '#2B3836',
  },
};

export function googleMapStyle(scheme: SchemeName): MapStyleElement[] {
  const c = palettes[scheme];
  return [
    { elementType: 'geometry', stylers: [{ color: c.land }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: c.areaLabel }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: c.labelHalo }, { weight: 3 }] },

    { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: c.landMan }] },
    { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: c.border }] },
    { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: c.areaLabel }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: c.roadLabel }] },

    // Places: names visible, Google's icons hidden (our own icons come later).
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: c.poiLabel }] },
    { featureType: 'poi.business', stylers: [{ visibility: 'simplified' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: c.park }] },
    { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: c.parkLabel }] },

    { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: c.local }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: c.roadStroke }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: c.roadLabel }] },
    { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: c.arterial }] },
    { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: c.highway }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: c.highwayStroke }] },

    { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: c.transit }] },
    { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: c.poiLabel }] },

    { featureType: 'water', elementType: 'geometry', stylers: [{ color: c.water }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: c.waterLabel }] },
  ];
}
