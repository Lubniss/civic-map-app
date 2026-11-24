// Photo compression + upload to the private bucket, then POST /reports.
import { decode } from 'base64-arraybuffer';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { api, ApiError } from './api';
import { supabase } from './supabase';
import type { AlertStatus } from './types';
import type { Category } from '@/theme/tokens';

export interface ReporterLocation {
  lat: number;
  lng: number;
  accuracy: number | null;
  /** ms since epoch, when the GPS reading was taken */
  t: number;
}

export interface ReportInput {
  spot: { lat: number; lng: number };
  category: Category;
  severity: 1 | 2 | 3;
  note: string;
  timing: 'now' | 'recent' | null;
  photoUri: string | null;
  reporter: ReporterLocation;
}

export interface ReportResult {
  alertId: string;
  status: Exclude<AlertStatus, 'resolved'>;
  reporterCount: number;
  reportCount: number;
  isNewAlert: boolean;
  expiresAt: string | null;
  hotUntil: string | null;
  shownOnMap: boolean;
  message: string;
}

/** Shrinks the camera photo (max 1600 px wide, JPEG 70%) and uploads it to photos/<user_id>/<file>.jpg. */
export async function uploadPhoto(uri: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new ApiError(401, 'NOT_SIGNED_IN', 'Please sign in again.');

  const rendered = await ImageManipulator.manipulate(uri).resize({ width: 1600 }).renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new ApiError(0, 'PHOTO', 'Could not prepare the photo. Try again.');

  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const { error } = await supabase.storage.from('photos').upload(path, decode(saved.base64), {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw new ApiError(0, 'UPLOAD', 'The photo did not upload. Check your connection and try again.');
  return path;
}

export interface ConfirmFixResult {
  status: string;
  fixCount: number;
  needed: number;
  resolved: boolean;
  message: string;
}

/** Uploads the proof photo, then POST /alerts/:id/confirm-fix. */
export async function confirmFix(alertId: string, photoUri: string, note: string, reporter: ReporterLocation): Promise<ConfirmFixResult> {
  const photo_path = await uploadPhoto(photoUri);
  return api<ConfirmFixResult>(`/alerts/${alertId}/confirm-fix`, {
    method: 'POST',
    body: {
      photo_path,
      note: note.trim() || null,
      reporter_lat: reporter.lat,
      reporter_lng: reporter.lng,
      gps_accuracy_m: reporter.accuracy,
      location_at: new Date(reporter.t).toISOString(),
    },
  });
}

export async function submitReport(input: ReportInput): Promise<ReportResult> {
  const photo_path = input.photoUri ? await uploadPhoto(input.photoUri) : null;
  return api<ReportResult>('/reports', {
    method: 'POST',
    body: {
      lat: input.spot.lat,
      lng: input.spot.lng,
      category: input.category,
      severity: input.severity,
      note: input.note.trim() || null,
      photo_path,
      timing: input.timing,
      reporter_lat: input.reporter.lat,
      reporter_lng: input.reporter.lng,
      gps_accuracy_m: input.reporter.accuracy,
      location_at: new Date(input.reporter.t).toISOString(),
    },
  });
}
