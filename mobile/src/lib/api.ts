// Client for our Express API. Sends the Supabase login token on every request.
import { env } from './env';
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

/** Render's free plan sleeps when idle and can take up to ~1 minute to wake, so allow for that. */
const TIMEOUT_MS = 75_000;

export async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.auth !== false) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(env.apiUrl + path, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(
      0,
      'NETWORK',
      timedOut
        ? 'The Civic Map server is taking too long (it may be waking up). Try again in a moment.'
        : "Can't reach the Civic Map server. Check your internet connection.",
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? 'Something went wrong. Try again.');
  }
  return data as T;
}

export interface Health {
  ok: boolean;
  service: string;
  time: string;
  /** Phase 5: a verified phone is needed to report / confirm fixes. */
  requirePhone?: boolean;
}

export const getHealth = () => api<Health>('/health', { auth: false });
