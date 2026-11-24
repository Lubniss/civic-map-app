/** Photos must be taken and uploaded shortly before the report (the app only allows the camera). */
export const PHOTO_MAX_AGE_MINUTES = 15;

/** Was the photo uploaded within the last PHOTO_MAX_AGE_MINUTES? (1 minute of clock leeway.) */
export function isPhotoFresh(uploadedAt: string | null | undefined, now = Date.now()): boolean {
  if (!uploadedAt) return false;
  const t = Date.parse(uploadedAt);
  if (Number.isNaN(t)) return false;
  const ageMs = now - t;
  return ageMs >= -60_000 && ageMs <= PHOTO_MAX_AGE_MINUTES * 60_000;
}
