import { db, PHOTO_BUCKET } from './db.js';
import { ApiError } from './errors.js';

/** The app uploads photos to "<user_id>/<file>" first; this checks the file is really there. */
export async function assertOwnPhoto(userId: string, path: string): Promise<void> {
  const prefix = `${userId}/`;
  const name = path.startsWith(prefix) ? path.slice(prefix.length) : '';
  if (!name || name.includes('/') || name.includes('..')) {
    throw new ApiError(400, 'INVALID_PHOTO_PATH', 'The photo must be uploaded to your own folder.');
  }
  const { data, error } = await db.storage.from(PHOTO_BUCKET).list(userId, { search: name, limit: 100 });
  if (error) {
    console.error('Storage list failed:', error);
    throw new ApiError(500, 'SERVER_ERROR', 'Could not check the photo. Try again.');
  }
  if (!data?.some((f) => f.name === name)) {
    throw new ApiError(400, 'PHOTO_NOT_FOUND', 'The photo did not finish uploading. Try again.');
  }
}

/** Short-lived (1 hour) links to view private photos. */
export async function signedPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const urls = new Map<string, string>();
  if (!unique.length) return urls;
  const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(unique, 3600);
  if (error) {
    console.error('Signing photo links failed:', error);
    return urls;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return urls;
}
