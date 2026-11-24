import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Server-side client with the secret key. Never expose this to the app.
export const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const PHOTO_BUCKET = 'photos';
