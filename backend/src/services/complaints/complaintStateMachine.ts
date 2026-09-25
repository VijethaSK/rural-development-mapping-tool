import mongoose from 'mongoose';
import { Complaint, ComplaintDoc, StatusHistoryItem, ComplaintStatus } from '../../models/Complaint.js';
import { Infrastructure } from '../../models/Infrastructure.js';
import { Assignment } from '../../models/Assignment.js';
import { AssignmentStateMachineService } from '../assignments/assignmentStateMachine.js';
import { UserRole } from '../../models/User.js';

/**
 * Canonical complaint status values stored in MongoDB and returned by APIs.
 */
export type ComplaintState =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'PRIORITY_SET'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'VERIFIED'
  | 'CLOSED'
  | 'REJECTED'
  | 'REASSIGNED';

export const ALL_COMPLAINT_STATES: ComplaintState[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'PRIORITY_SET',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'VERIFIED',
  'CLOSED',
  'REJECTED',
  'REASSIGNED'
];

/**
 * Compatibility mapping for records written before canonical statuses were enforced.
 * `Resolved` maps to COMPLETED so it cannot bypass evidence verification and closure.
 */
export function normalizeState(rawStatus: string): ComplaintState {
  if (typeof rawStatus !== 'string' || !rawStatus.trim()) {
    throw new ComplaintStatusError('Complaint status is missing');
  }
  const clean = rawStatus.trim().toUpperCase().replace(/\s+/g, '_');
  if (clean === 'NEW') return 'SUBMITTED';
  if (clean === 'RESOLVED') return 'COMPLETED';
  if (ALL_COMPLAINT_STATES.includes(clean as ComplaintState)) {
    return clean as ComplaintState;
  }
  throw new ComplaintStatusError(`Unknown complaint status '${rawStatus}'`);
}

export class ComplaintStatusError extends Error {
  statusCode = 400;
  errorCode = 'INVALID_STATUS';
}

export const toComplaintStatus = (rawStatus: string): ComplaintStatus => normalizeState(rawStatus);

export interface TransitionRule {
  from: ComplaintState;
  to: ComplaintState;
  allowedRoles: UserRole[];
  description: string;
}

/**
 * Controlled State Machine Transition Matrix.
 * Defines every single valid transition and the precise authorized roles allowed to trigger it.
 */
export const TRANSITION_RULES: TransitionRule[] = [
  // 1. SUBMITTED transitions
  {
    from: 'SUBMITTED',
    to: 'UNDER_REVIEW',
    allowedRoles: ['admin', 'pdo'],
    description: 'Panchayat official/PDO acknowledges and begins formal review of grievance'
  },
  {
    from: 'SUBMITTED',
    to: 'REJECTED',
    allowedRoles: ['admin'],
    description: 'Immediate rejection of obviously fraudulent, duplicate, or out-of-scope report'
  },

  // 2. UNDER_REVIEW transitions
  {
    from: 'UNDER_REVIEW',
    to: 'PRIORITY_SET',
    allowedRoles: ['admin', 'pdo'],
    description: 'Priority score and urgency determined by SAW algorithm or administration'
  },
  {
    from: 'UNDER_REVIEW',
    to: 'REJECTED',
    allowedRoles: ['admin', 'pdo'],
    description: 'Grievance rejected with audit justification (e.g. private property / out of mandate)'
  },

  // 3. PRIORITY_SET transitions
  {
    from: 'PRIORITY_SET',
    to: 'ASSIGNED',
    allowedRoles: ['admin', 'pdo'],
    description: 'Maintenance work order created and dispatched to a field officer/worker'
  },
  {
    from: 'PRIORITY_SET',
    to: 'UNDER_REVIEW',
    allowedRoles: ['admin'],
    description: 'Priority sent back for reassessment or weight adjustment'
  },
  {
    from: 'PRIORITY_SET',
    to: 'REJECTED',
    allowedRoles: ['admin'],
    description: 'Rejected after administrative feasibility review'
  },

  // 4. ASSIGNED transitions
  {
    from: 'ASSIGNED',
    to: 'IN_PROGRESS',
    allowedRoles: ['pdo', 'admin'],
    description: 'Assigned field worker/contractor accepts and initiates repair on site'
  },
  {
    from: 'ASSIGNED',
    to: 'REASSIGNED',
    allowedRoles: ['admin', 'pdo'],
    description: 'Task reassigned to alternative worker or jurisdiction due to scheduling'
  },
  {
    from: 'ASSIGNED',
    to: 'PRIORITY_SET',
    allowedRoles: ['admin'],
    description: 'Assignment revoked or put on hold prior to field execution'
  },

  // 5. REASSIGNED transitions
  {
    from: 'REASSIGNED',
    to: 'IN_PROGRESS',
    allowedRoles: ['pdo', 'admin'],
    description: 'Newly assigned field crew begins work on site'
  },
  {
    from: 'REASSIGNED',
    to: 'ASSIGNED',
    allowedRoles: ['admin', 'pdo'],
    description: 'Reset assignment to regular queue'
  },

  // 6. IN_PROGRESS transitions
  {
    from: 'IN_PROGRESS',
    to: 'COMPLETED',
    allowedRoles: ['pdo', 'admin'],
    description: 'Field officer completes repair and submits photo evidence with geotag'
  },
  {
    from: 'IN_PROGRESS',
    to: 'ASSIGNED',
    allowedRoles: ['pdo', 'admin'],
    description: 'Work paused due to inclement weather, material shortage, or shift end'
  },

  // 7. COMPLETED transitions
  {
    from: 'COMPLETED',
    to: 'VERIFIED',
    allowedRoles: ['admin'],
    description: 'Panchayat administrator verifies physical repair and approves completion proof'
  },
  {
    from: 'COMPLETED',
    to: 'IN_PROGRESS',
    allowedRoles: ['admin'],
    description: 'Verification failed: Administrator orders corrective rework'
  },
  {
    from: 'COMPLETED',
    to: 'REJECTED',
    allowedRoles: ['admin'],
    description: 'Completion proof rejected as substandard or fraudulent'
  },

  // 8. VERIFIED transitions
  {
    from: 'VERIFIED',
    to: 'CLOSED',
    allowedRoles: ['admin'],
    description: 'Formal sign-off and permanent archival of resolved grievance'
  },
  {
    from: 'VERIFIED',
    to: 'IN_PROGRESS',
    allowedRoles: ['admin'],
    description: 'Reopened for additional repair work'
  },

  // 9. Reopening pathways from terminal states
  {
    from: 'CLOSED',
    to: 'UNDER_REVIEW',
    allowedRoles: ['admin'],
    description: 'Reopened by Administrator upon citizen appeal or recurring issue'
  },
  {
    from: 'REJECTED',
    to: 'UNDER_REVIEW',
    allowedRoles: ['admin'],
    description: 'Reopened by Administrator following successful citizen dispute/appeal'
  }
];

export interface TransitionCheckResult {
  allowed: boolean;
  errorCode?: 'UNAUTHORIZED_ROLE' | 'INVALID_TRANSITION';
  reason?: string;
  rule?: TransitionRule;
  allowedTargets?: ComplaintState[];
}

export interface TransitionActor {
  id?: string;
  name: string;
  role: UserRole;
}

export class ComplaintStateMachineService {
  /**
   * Evaluates if a given state transition is permissible for the caller's role.
   */
  static canTransition(
    fromState: string,
    toState: string,
    userRole: UserRole
  ): TransitionCheckResult {
    let from: ComplaintState;
    let to: ComplaintState;
    try {
      from = normalizeState(fromState);
      to = normalizeState(toState);
    } catch (error: any) {
      return {
        allowed: false,
        errorCode: 'INVALID_TRANSITION',
        reason: error.message || 'Unknown complaint status'
      };
    }

    // Rule 1: Citizens are NEVER allowed to execute administrative transitions
    if (userRole === 'citizen') {
      return {
        allowed: false,
        errorCode: 'UNAUTHORIZED_ROLE',
        reason:
          "Citizens are not authorized to perform state transitions. Citizens may only lodge grievances, upvote, and post comments."
      };
    }

    // Find if a transition rule exists from `from` to `to`
    const rule = TRANSITION_RULES.find((r) => r.from === from && r.to === to);

    // Find all valid target states from `from` for diagnostics
    const allowedTargets = TRANSITION_RULES.filter((r) => r.from === from).map((r) => r.to);

    if (!rule) {
      return {
        allowed: false,
        errorCode: 'INVALID_TRANSITION',
        allowedTargets,
        reason: `Invalid state transition: Cannot transition from '${from}' to '${to}'. Valid next states from '${from}' are: [${allowedTargets.join(
          ', '
        )}]`
      };
    }

    // Rule 2: Check role authorization for this specific transition
    if (!rule.allowedRoles.includes(userRole)) {
      return {
        allowed: false,
        errorCode: 'UNAUTHORIZED_ROLE',
        allowedTargets,
        reason: `Role '${userRole}' is not authorized to transition from '${from}' to '${to}'. Permitted role(s): [${rule.allowedRoles.join(
          ', '
        )}]`
      };
    }

    return {
      allowed: true,
      rule,
      allowedTargets
    };
  }

  /**
   * Retrieves all available next states that a specific user role can transition a complaint into.
   */
  static getAvailableTransitions(
    currentState: string,
    userRole: UserRole
  ): { targetState: ComplaintState; description: string }[] {
    const from = normalizeState(currentState);
    if (userRole === 'citizen') return [];

    return TRANSITION_RULES.filter(
      (r) => r.from === from && r.allowedRoles.includes(userRole)
    ).map((r) => ({
      targetState: r.to,
      description: r.description
    }));
  }

  /**
   * Executes a controlled state transition, updates complaint state, records audit log,
   * and triggers linked entity cascades.
   */
  static async executeTransition(
    complaintId: string,
    targetState: string,
    changedBy: TransitionActor,
    comment?: string
  ): Promise<{ complaint: ComplaintDoc; historyItem: StatusHistoryItem }> {
    if (!changedBy.id || !mongoose.Types.ObjectId.isValid(changedBy.id)) {
      const err: any = new Error('Authenticated user identity is required for complaint transitions');
      err.statusCode = 401;
      err.errorCode = 'AUTHENTICATION_REQUIRED';
      throw err;
    }
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      throw new Error(`Complaint with ID ${complaintId} not found`);
    }

    const storedStatus = complaint.status;
    const currentNormalized = normalizeState(complaint.status);
    const targetNormalized = normalizeState(targetState);

    // Validate via State Machine
    const check = this.canTransition(currentNormalized, targetNormalized, changedBy.role);
    if (!check.allowed) {
      const err: any = new Error(check.reason);
      err.statusCode = check.errorCode === 'UNAUTHORIZED_ROLE' ? 403 : 400;
      err.errorCode = check.errorCode;
      throw err;
    }

    if (targetNormalized === 'ASSIGNED' || targetNormalized === 'IN_PROGRESS' || targetNormalized === 'COMPLETED' || targetNormalized === 'VERIFIED') {
      const linkedAssignment = await Assignment.findOne({ complaintId: complaint._id, panchayatId: complaint.panchayatId }).sort({ createdAt: -1 });
      const expectedAssignmentStatus = {
        ASSIGNED: ['Assigned', 'Accepted'],
        IN_PROGRESS: ['In_Progress'],
        COMPLETED: ['Completed'],
        VERIFIED: ['Verified']
      }[targetNormalized];
      if (!linkedAssignment || !expectedAssignmentStatus.includes(AssignmentStateMachineService.normalizeStatus(linkedAssignment.status))) {
        const err: any = new Error(`Complaint cannot enter ${targetNormalized} without a linked assignment in the matching lifecycle state`);
        err.statusCode = 400;
        err.errorCode = 'ASSIGNMENT_STATE_REQUIRED';
        throw err;
      }
      if (targetNormalized === 'COMPLETED' || targetNormalized === 'VERIFIED') {
        AssignmentStateMachineService.assertCompletionEvidence(linkedAssignment);
      }
    }

    // Build formal transition record
    const historyItem: StatusHistoryItem = {
      oldStatus: currentNormalized,
      fromStatus: currentNormalized,
      newStatus: targetNormalized,
      toStatus: targetNormalized,
      status: targetNormalized,
      changedBy: changedBy.id ? (new mongoose.Types.ObjectId(changedBy.id) as any) : undefined,
      changedByName: changedBy.name || 'System Official',
      changedByRole: changedBy.role,
      comment: comment?.trim() || check.rule?.description || `Transitioned to ${targetNormalized}`,
      notes: comment?.trim() || check.rule?.description || `Transitioned to ${targetNormalized}`,
      timestamp: new Date()
    };

    // Record known legacy-current normalization separately before the requested transition.
    if (storedStatus !== currentNormalized) {
      complaint.statusHistory.push({
        oldStatus: storedStatus,
        fromStatus: storedStatus,
        newStatus: currentNormalized,
        toStatus: currentNormalized,
        status: currentNormalized,
        changedBy: new mongoose.Types.ObjectId(changedBy.id) as any,
        changedByName: changedBy.name || 'System Official',
        changedByRole: changedBy.role,
        comment: `Legacy complaint status normalized from '${storedStatus}' to '${currentNormalized}' before transition.`,
        notes: `Legacy complaint status normalized from '${storedStatus}' to '${currentNormalized}' before transition.`,
        timestamp: new Date()
      });
    }

    // Update status and push history item
    complaint.status = targetNormalized;
    complaint.statusHistory.push(historyItem);

    // Linked Infrastructure cascade:
    // Admin verification restores the linked asset condition after evidence checks.
    if (targetNormalized === 'VERIFIED' && complaint.infrastructureId) {
      await Infrastructure.findOneAndUpdate({ _id: complaint.infrastructureId, panchayatId: complaint.panchayatId }, {
        status: 'Operational',
        condition: 'Good',
        lastMaintenanceDate: new Date()
      });
    }

    await complaint.save();

    return {
      complaint,
      historyItem
    };
  }
}
