import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { readSetting, writeSetting } from '@/lib/storage';
import { badges, categories, mapColors, palettes, zones, type SchemeName } from './tokens';

export type AppearancePref = 'system' | 'light' | 'dark';
const PREF_KEY = 'appearance';

function buildTheme(scheme: SchemeName) {
  return {
    scheme,
    isDark: scheme === 'dark',
    colors: palettes[scheme],
    badges: badges[scheme],
    zones: zones[scheme],
    map: mapColors[scheme],
    categoryColor: (key: keyof typeof categories) => categories[key][scheme],
  };
}
export type Theme = ReturnType<typeof buildTheme>;

interface ThemeContextValue {
  theme: Theme;
  pref: AppearancePref;
  setPref: (pref: AppearancePref) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readPref(): AppearancePref {
  const saved = readSetting(PREF_KEY);
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<AppearancePref>(readPref);

  const setPref = useCallback((next: AppearancePref) => {
    setPrefState(next);
    writeSetting(PREF_KEY, next);
  }, []);

  const scheme: SchemeName = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const value = useMemo(() => ({ theme: buildTheme(scheme), pref, setPref }), [scheme, pref, setPref]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx.theme;
}

export function useAppearance() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppearance must be used inside ThemeProvider');
  return { pref: ctx.pref, setPref: ctx.setPref };
}
