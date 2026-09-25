import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signToken(payload: object): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): any {
  return jwt.verify(token, env.JWT_SECRET);
}

