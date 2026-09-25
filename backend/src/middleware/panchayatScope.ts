import { Request, Response } from 'express';

export class PanchayatScopeError extends Error {
  statusCode = 403;
  constructor(message = 'Forbidden: this account cannot access the requested Panchayat') {
    super(message);
  }
}

/** Resolve a requested Panchayat against the authenticated user's assigned scope. */
export function resolvePanchayatScope(req: Request, requested?: unknown): string | undefined {
  const requestedId = requested == null || requested === '' ? undefined : String(requested);
  const user = req.user;
  if (!user) return requestedId;

  // An admin with no assigned Panchayat is the existing system-wide administrator.
  if (user.role === 'admin' && !user.panchayatId) return requestedId;
  if (!user.panchayatId) throw new PanchayatScopeError('Forbidden: no Panchayat is assigned to this account');
  if (requestedId && requestedId !== user.panchayatId) throw new PanchayatScopeError();
  return user.panchayatId;
}

export function assertPanchayatAccess(req: Request, panchayatId?: unknown): void {
  const target = panchayatId == null ? undefined : String(panchayatId);
  const allowed = resolvePanchayatScope(req, target);
  if (target && allowed && target !== allowed) throw new PanchayatScopeError();
  if (target && req.user && !allowed) throw new PanchayatScopeError();
}

export function panchayatFilter(req: Request, requested?: unknown): Record<string, string> {
  const panchayatId = resolvePanchayatScope(req, requested);
  return panchayatId ? { panchayatId } : {};
}

export function denyIfPanchayatOutOfScope(req: Request, res: Response, panchayatId?: unknown): boolean {
  try {
    assertPanchayatAccess(req, panchayatId);
    return false;
  } catch (err: any) {
    res.status(err.statusCode || 403).json({ error: err.message || 'Forbidden: Panchayat access denied' });
    return true;
  }
}
