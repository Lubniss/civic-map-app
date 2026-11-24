import { Router } from 'express';
import { me } from '../auth.js';
import { db } from '../db.js';
import { ApiError, fromDbError } from '../errors.js';
import { assertOwnPhoto } from '../photos.js';
import { parse, reportBody } from '../schemas.js';
import { reportMessage, type SubmitResult } from './reportMessage.js';

export const DAILY_REPORT_LIMIT = 20;
export const reportsRouter = Router();

// POST /reports  { lat, lng, category, severity, note?, photo_path }
reportsRouter.post('/', async (req, res) => {
  const body = parse(reportBody, req.body);
  const user = me(req);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: countError } = await db
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since);
  if (countError) throw fromDbError(countError);
  if ((count ?? 0) >= DAILY_REPORT_LIMIT) {
    throw new ApiError(429, 'DAILY_LIMIT', `You can send up to ${DAILY_REPORT_LIMIT} reports a day. Try again tomorrow.`);
  }

  await assertOwnPhoto(user.id, body.photo_path);

  const { data, error } = await db.rpc('submit_report', {
    p_user_id: user.id,
    p_lat: body.lat,
    p_lng: body.lng,
    p_category: body.category,
    p_severity: body.severity,
    p_note: body.note ?? null,
    p_photo_path: body.photo_path,
  });
  if (error) throw fromDbError(error);
  const row = (data as SubmitResult[])[0]!;

  res.status(201).json({
    alertId: row.alert_id,
    status: row.status,
    reporterCount: row.reporter_count,
    reportCount: row.report_count,
    isNewAlert: row.is_new_alert,
    expiresAt: row.expires_at,
    shownOnMap: row.status !== 'pending',
    message: reportMessage(row),
  });
});
