// Supabase client for login only (the app never reads tables directly; data goes through our API).
// Session storage follows Expo's Supabase guide: expo-sqlite localStorage. No URL polyfill needed.
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { env } from './env';

export const supabase = createClient(env.supabaseUrl || 'https://invalid.local', env.supabaseKey || 'missing', {
  auth: {
    storage: globalThis.localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the login token only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
