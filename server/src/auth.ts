import type { NextFunction, Request, Response } from 'express';
import { db } from './db.js';
import { ApiError } from './errors.js';

export interface AuthUser {
  id: string;
  email: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Checks the Supabase login token sent as "Authorization: Bearer <token>". */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new ApiError(401, 'NOT_SIGNED_IN', 'Please sign in.');

  const { data, error } = await db.auth.getUser(header.slice('Bearer '.length).trim());
  if (error || !data.user) {
    throw new ApiError(401, 'NOT_SIGNED_IN', 'Your session has expired. Please sign in again.');
  }
  req.user = { id: data.user.id, email: data.user.email ?? null };
  next();
}

/** The signed-in user (requireAuth must have run). */
export function me(req: Request): AuthUser {
  if (!req.user) throw new ApiError(401, 'NOT_SIGNED_IN', 'Please sign in.');
  return req.user;
}
