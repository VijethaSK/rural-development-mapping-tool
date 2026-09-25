import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { User, UserRole } from '../models/User.js';

async function resolveUser(token: string): Promise<NonNullable<Request['user']> | null> {
  const decoded = verifyToken(token) as { id?: string };
  if (!decoded?.id) return null;
  const user = await User.findById(decoded.id).select('_id role name email ward panchayatId isActive');
  if (!user || !user.isActive) return null;
  return {
    id: user._id.toString(),
    role: user.role,
    name: user.name,
    email: user.email,
    ward: user.ward,
    panchayatId: user.panchayatId?.toString()
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      res.status(401).json({ error: 'Unauthorized: missing bearer token' });
      return;
    }
    const user = await resolveUser(token);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized: invalid token' });
      return;
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: session expired or token invalid' });
  }
}

export function requireRole(allowedRoles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await requireAuth(req, res, () => {
      if (!req.user || !allowedRoles.includes(req.user.role)) {
        res.status(403).json({
          error: `Forbidden: role '${req.user?.role}' does not have permission to perform this action`
        });
        return;
      }
      next();
    });
  };
}

export const requireAdmin = requireRole(['admin']);
export const requireMemberOrAdmin = requireRole(['pdo', 'admin']);

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token) {
      req.user = (await resolveUser(token)) || undefined;
    }
  } catch {
    // Proceed unauthenticated if token invalid
  }
  next();
}
