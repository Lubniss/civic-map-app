// Small on-device key/value store. Expo's recommended localStorage (backed by expo-sqlite);
// Supabase also keeps the login session here.
import 'expo-sqlite/localStorage/install';

export function readSetting(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // Not fatal: the setting just won't be remembered.
  }
}
