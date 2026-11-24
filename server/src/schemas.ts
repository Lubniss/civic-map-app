import { z } from 'zod';
import { CATEGORY_KEYS, isEmergency } from './categories.js';
import { ApiError } from './errors.js';

const note = z.string().trim().max(500, 'Keep the note under 500 characters.').optional().nullable();
const photoPath = z.string().min(3, 'Add a photo.').max(300);

/** Where the phone was, for the 300 m rule. */
const reporterLocation = {
  reporter_lat: z.number('Turn on location to report.').min(-90).max(90),
  reporter_lng: z.number('Turn on location to report.').min(-180).max(180),
  gps_accuracy_m: z.number().min(0).max(100_000).optional().nullable(),
  location_at: z.string().datetime({ offset: true, message: 'location_at must be an ISO date-time.' }),
};

export const reportBody = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    category: z.enum(CATEGORY_KEYS, 'Pick one of the listed categories.'),
    severity: z.number().int().min(1, 'Severity must be 1, 2 or 3.').max(3, 'Severity must be 1, 2 or 3.'),
    note,
    photo_path: photoPath.optional().nullable(),
    timing: z.enum(['now', 'recent']).optional().nullable(),
    ...reporterLocation,
  })
  .superRefine((b, ctx) => {
    if (isEmergency(b.category) && !b.timing) {
      ctx.addIssue({ code: 'custom', path: ['timing'], message: 'Say whether this is happening now or happened recently.' });
    }
    if (!isEmergency(b.category) && b.timing === 'recent') {
      ctx.addIssue({ code: 'custom', path: ['timing'], message: 'Only emergencies can be reported after leaving.' });
    }
    if (!isEmergency(b.category) && !b.photo_path) {
      ctx.addIssue({ code: 'custom', path: ['photo_path'], message: 'Take a photo of the problem.' });
    }
  });
export type ReportBody = z.infer<typeof reportBody>;

export const confirmFixBody = z.object({
  photo_path: photoPath,
  note,
  ...reporterLocation,
});

export const alertIdParam = z.object({
  id: z.string().uuid('That alert id is not valid.'),
});

export const radiusQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(50).max(2000).default(300),
});

/** Validates input, turning the first problem into a 400 with a readable message. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new ApiError(400, 'INVALID_INPUT', `${where}${issue?.message ?? 'Invalid input.'}`);
  }
  return result.data;
}
