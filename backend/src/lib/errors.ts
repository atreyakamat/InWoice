import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { reportError } from './alerts';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const conflict = (message: string) => new HttpError(409, message);

/** Central error handler: every route can simply `throw`. Express 5 forwards async rejections here. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, error: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = details[0];
    res.status(400).json({
      success: false,
      error: first ? `${first.path || 'input'}: ${first.message}` : 'Invalid input',
      details,
    });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      res.status(404).json({ success: false, error: 'Record not found' });
      return;
    }
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      res.status(409).json({ success: false, error: `A record with this ${target} already exists` });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({ success: false, error: 'This record is referenced by other records and cannot be changed' });
      return;
    }
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    res.status(400).json({ success: false, error: 'Malformed JSON body' });
    return;
  }
  console.error(err);
  void reportError(`${req.method} ${req.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id')}`, err);
  res.status(500).json({ success: false, error: 'Internal server error' });
}
