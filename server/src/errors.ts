// Errors the API sends back as { error: { code, message } }.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// Error codes raised by the database functions in 001_init.sql.
const DB_ERRORS: Record<string, [status: number, message: string]> = {
  USER_REQUIRED: [401, 'Please sign in.'],
  INVALID_LOCATION: [400, 'That location is not valid.'],
  INVALID_CATEGORY: [400, 'Pick one of the listed categories.'],
  INVALID_SEVERITY: [400, 'Severity must be Low, Medium or High.'],
  INVALID_PHOTO_PATH: [400, 'The photo must be uploaded to your own folder.'],
  ALERT_NOT_FOUND: [404, 'This alert does not exist.'],
  ALREADY_RESOLVED: [409, 'This problem is already marked as fixed.'],
  ALERT_NOT_ACTIVE: [409, 'This alert is not active, so it cannot be confirmed.'],
  REPORTER_CANNOT_CONFIRM: [403, 'You reported this problem, so 3 other people need to confirm the fix.'],
  ALREADY_CONFIRMED: [409, 'You have already confirmed this fix.'],
};

export function fromDbError(err: { message?: string } | null | undefined): ApiError {
  const code = err?.message ?? '';
  const known = DB_ERRORS[code];
  if (known) return new ApiError(known[0], code, known[1]);
  console.error('Database error:', err);
  return new ApiError(500, 'SERVER_ERROR', 'Something went wrong. Try again.');
}
