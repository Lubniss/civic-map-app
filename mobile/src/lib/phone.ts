import { useQuery } from '@tanstack/react-query';
import { getHealth } from './api';
import { useAuth } from './auth';

/** Whether the server currently requires a verified phone to report (REQUIRE_PHONE_VERIFICATION). */
export function useRequirePhone(): boolean {
  const q = useQuery({ queryKey: ['health'], queryFn: getHealth, staleTime: 5 * 60_000 });
  return q.data?.requirePhone === true;
}

/** The signed-in user's phone, and whether it has been confirmed by SMS code. */
export function useMyPhone(): { phone: string | null; confirmed: boolean } {
  const { session } = useAuth();
  const u = session?.user;
  const phone = u?.phone ? `+${u.phone.replace(/^\+/, '')}` : null;
  return { phone, confirmed: Boolean(u?.phone && u?.phone_confirmed_at) };
}

/** "+91" + "98765 43210" → "+919876543210" (drops spaces, dashes and a leading trunk 0). */
export function toE164(countryCode: string, number: string): string | null {
  const cc = countryCode.replace(/[^\d]/g, '');
  let n = number.replace(/[^\d]/g, '');
  if (number.trim().startsWith('+')) return n.length >= 8 && n.length <= 15 ? `+${n}` : null;
  n = n.replace(/^0+/, '');
  const full = `${cc}${n}`;
  return cc && n.length >= 6 && full.length <= 15 ? `+${full}` : null;
}

/** Friendly wording for Supabase phone errors. */
export function phoneErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already') && (m.includes('registered') || m.includes('exists') || m.includes('in use'))) {
    return 'This phone number is already used by another account.';
  }
  if (m.includes('provider') || m.includes('sms') && m.includes('not')) {
    return "Phone verification isn't switched on yet. Try again later.";
  }
  if (m.includes('expired') || m.includes('invalid') && m.includes('token')) {
    return 'That code is wrong or has expired. Check it, or send a new one.';
  }
  if (m.includes('rate') || m.includes('too many') || m.includes('seconds')) {
    return 'Too many codes requested. Wait a minute and try again.';
  }
  if (m.includes('invalid') && m.includes('phone')) return 'That phone number looks wrong. Check it and try again.';
  return message;
}
