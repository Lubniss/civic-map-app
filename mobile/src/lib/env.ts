// EXPO_PUBLIC_* values are inlined at build time, and only with dot notation (process.env.EXPO_PUBLIC_X).
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, ''),
};

export const missingEnv: string[] = [
  !env.supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
  !env.supabaseKey && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  (!env.apiUrl || env.apiUrl.includes('YOUR-PC-IP')) && 'EXPO_PUBLIC_API_URL',
].filter((v): v is string => Boolean(v));
