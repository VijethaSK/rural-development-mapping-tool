import 'express';
import { UserRole } from '../models/User.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      role: UserRole;
      name?: string;
      email?: string;
      ward?: string;
      panchayatId?: string;
    };
  }
}
