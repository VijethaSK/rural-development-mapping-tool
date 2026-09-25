import mongoose from 'mongoose';
import { Assignment, AssignmentDoc, AssignmentStatus } from '../../models/Assignment.js';
import { UserRole } from '../../models/User.js';

const STATUSES: AssignmentStatus[] = ['Assigned', 'Accepted', 'In_Progress', 'Completed', 'Verified', 'Rejected'];

export function normalizeAssignmentStatus(value: string): AssignmentStatus {
  const normalized = String(value || '').trim().replace(/\s+/g, '_');
  const canonical = normalized.toLowerCase() === 'in_progress'
    ? 'In_Progress'
    : STATUSES.find((status) => status.toLowerCase() === normalized.toLowerCase());
  if (!canonical) throw new AssignmentStatusError(`Unknown assignment status '${value}'`);
  return canonical;
}

export class AssignmentStatusError extends Error {
  statusCode = 400;
  errorCode = 'INVALID_ASSIGNMENT_STATUS';
}

export function assertCompletionEvidence(assignment: AssignmentDoc): void {
  const notes = assignment.completionNotes?.trim();
  const point = assignment.completionLocation;
  const coords = point?.coordinates;
  if (!notes || !assignment.completionImages?.some((image) => typeof image.url === 'string' && Boolean(image.url.trim())) ||
      !coords || coords.length !== 2 || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1]) ||
      coords[0] < -180 || coords[0] > 180 || coords[1] < -90 || coords[1] > 90) {
    const err: any = new Error('Completion requires notes, at least one evidence image, and a valid geotagged location');
    err.statusCode = 400;
    err.errorCode = 'COMPLETION_EVIDENCE_REQUIRED';
    throw err;
  }
}

const ALLOWED: Record<AssignmentStatus, Partial<Record<AssignmentStatus, UserRole[]>>> = {
  Assigned: { Accepted: ['pdo', 'admin'], Rejected: ['admin'] },
  Accepted: { In_Progress: ['pdo', 'admin'], Rejected: ['admin'] },
  In_Progress: { Accepted: ['pdo', 'admin'], Completed: ['pdo'], Rejected: ['admin'] },
  Completed: { Verified: ['admin'], In_Progress: ['admin'], Rejected: ['admin'] },
  Verified: {},
  Rejected: {}
};

export interface AssignmentActor { id: string; name: string; role: UserRole }

export class AssignmentStateMachineService {
  static normalizeStatus = normalizeAssignmentStatus;
  static assertCompletionEvidence = assertCompletionEvidence;

  static async transition(
    assignment: AssignmentDoc,
    targetValue: string,
    actor: AssignmentActor,
    options: { notes?: string; completionImages?: Array<{url: string; caption?: string}>; completionLocation?: {type?: 'Point'; coordinates: number[]}; actualCost?: number; verificationNotes?: string } = {}
  ): Promise<AssignmentDoc> {
    if (!mongoose.Types.ObjectId.isValid(actor.id)) {
      const err: any = new Error('Authenticated user identity is required'); err.statusCode = 401; throw err;
    }
    const from = normalizeAssignmentStatus(assignment.status);
    const to = normalizeAssignmentStatus(targetValue);
    const roles = ALLOWED[from][to];
    if (!roles?.includes(actor.role)) {
      const err: any = new Error(`Assignment transition ${from} -> ${to} is not allowed for role '${actor.role}'`);
      err.statusCode = roles ? 403 : 400;
      err.errorCode = roles ? 'UNAUTHORIZED_ROLE' : 'INVALID_TRANSITION';
      throw err;
    }
    if (to === 'Completed') {
      assignment.completionNotes = options.notes?.trim() || '';
      assignment.completionImages = (options.completionImages || []).map((image) => ({
        url: image.url, caption: image.caption || 'Work Completion Evidence', uploadedAt: new Date()
      }));
      assignment.completionLocation = options.completionLocation as any;
      if (options.actualCost != null) assignment.actualCost = Number(options.actualCost);
      assertCompletionEvidence(assignment);
      assignment.completedAt = new Date();
    }
    if (to === 'Verified') {
      assertCompletionEvidence(assignment);
      if (!assignment.completedAt) {
        const err: any = new Error('Assignment must be completed before verification'); err.statusCode = 400; throw err;
      }
      assignment.verifiedBy = actor.id as any;
      assignment.verifiedAt = new Date();
      assignment.verificationNotes = options.verificationNotes?.trim() || '';
    }
    if (to === 'In_Progress' && options.completionLocation?.coordinates) {
      assignment.startLocation = options.completionLocation as any;
    }
    if (to === 'Accepted' && options.notes?.trim()) assignment.completionNotes = options.notes.trim();
    assignment.statusHistory = assignment.statusHistory || [];
    assignment.statusHistory.push({
      fromStatus: from,
      toStatus: to,
      changedBy: actor.id as any,
      changedByName: actor.name || 'Authenticated official',
      changedByRole: actor.role,
      notes: options.notes?.trim() || options.verificationNotes?.trim() || '',
      timestamp: new Date()
    });
    assignment.status = to;
    await assignment.save();
    return assignment;
  }
}
