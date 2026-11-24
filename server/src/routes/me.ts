import { Router } from 'express';
import { z } from 'zod';
import { me } from '../auth.js';
import { db } from '../db.js';
import { fromDbError } from '../errors.js';
import { parsePointEwkb } from '../geo.js';
import { signedPhotoUrls } from '../photos.js';
import { parse } from '../schemas.js';
import { myReportStatus } from './myReportStatus.js';

export const ME_PAGE_SIZE = 20;
export const meRouter = Router();

const pageQuery = z.object({ page: z.coerce.number().int().min(0).max(500).default(0) });

interface Row {
  id: string;
  alert_id: string;
  category: string;
  severity: number;
  note: string | null;
  photo_path: string | null;
  timing: string | null;
  location: string;
  created_at: string;
  alerts: {
    status: string;
    reporter_count: number;
    fix_count: number;
    expires_at: string | null;
    hot_until: string | null;
  } | null;
}

// GET /me/reports?page=0 → the signed-in user's own reports, newest first, 20 per page.
// The only place pending alerts are visible, and only your own.
meRouter.get('/reports', async (req, res) => {
  const { page } = parse(pageQuery, req.query);
  const user = me(req);
  const from = page * ME_PAGE_SIZE;

  const { data, error } = await db
    .from('reports')
    .select('id, alert_id, category, severity, note, photo_path, timing, location, created_at, alerts(status, reporter_count, fix_count, expires_at, hot_until)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, from + ME_PAGE_SIZE); // one extra row tells us if there's another page
  if (error) throw fromDbError(error);

  const rows = (data ?? []) as unknown as Row[];
  const pageRows = rows.slice(0, ME_PAGE_SIZE);
  const urls = await signedPhotoUrls(pageRows.map((r) => r.photo_path).filter((p): p is string => !!p));

  res.json({
    reports: pageRows.map((r) => {
      const point = parsePointEwkb(r.location);
      return {
        id: r.id,
        alertId: r.alert_id,
        category: r.category,
        severity: r.severity,
        note: r.note,
        timing: r.timing,
        lat: point.lat,
        lng: point.lng,
        createdAt: r.created_at,
        photoUrl: r.photo_path ? urls.get(r.photo_path) ?? null : null,
        status: myReportStatus(r.alerts),
        reporterCount: r.alerts?.reporter_count ?? 1,
        fixCount: r.alerts?.fix_count ?? 0,
      };
    }),
    nextPage: rows.length > ME_PAGE_SIZE ? page + 1 : null,
  });
});
