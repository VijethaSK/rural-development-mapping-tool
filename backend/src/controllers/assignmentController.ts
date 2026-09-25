import { Request, Response } from 'express';
import { Assignment } from '../models/Assignment.js';
import { Infrastructure } from '../models/Infrastructure.js';
import { Complaint } from '../models/Complaint.js';
import { User } from '../models/User.js';
import { PriorityScoringService } from '../services/priorityScoringService.js';
import { assertPanchayatAccess, panchayatFilter } from '../middleware/panchayatScope.js';
import { AssignmentStateMachineService } from '../services/assignments/assignmentStateMachine.js';
import { ComplaintStateMachineService, normalizeState } from '../services/complaints/complaintStateMachine.js';

/**
 * Lists assignments specifically assigned to the currently authenticated Member / PDO.
 */
export async function getMyWork(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: authentication required' });
      return;
    }

    const { status, priority } = req.query;
    const filter: any = { ...panchayatFilter(req, req.query.panchayatId) };

    // Member/PDO can ONLY see work assigned to them
    if (userRole === 'pdo' || userRole === 'citizen') {
      filter.assignedMember = userId;
    } else if (userRole === 'admin') {
      // Admin can filter by memberId or see all
      if (req.query.memberId) {
        filter.assignedMember = req.query.memberId;
      }
    }

    if (status && status !== 'All') {
      filter.status = status;
    }
    if (priority && priority !== 'All') {
      filter.priority = priority;
    }

    const assignments = await Assignment.find(filter)
      .populate('infrastructureId')
      .populate('complaintId')
      .populate('assignedMember', 'name phone designation assignedWard')
      .populate('assignedBy', 'name role')
      .sort({ updatedAt: -1 });

    // Calculate status card counts for the Member's dashboard
    const baseMemberFilter: any = { ...panchayatFilter(req, req.query.panchayatId) };
    if (!(userRole === 'admin' && !req.query.memberId)) baseMemberFilter.assignedMember = req.query.memberId || userId;
    const allMemberAssignments = await Assignment.find(baseMemberFilter).select('status priority').lean();

    const counts = {
      assigned: allMemberAssignments.filter((a) => a.status === 'Assigned').length,
      accepted: allMemberAssignments.filter((a) => a.status === 'Accepted').length,
      inProgress: allMemberAssignments.filter((a) => a.status === 'In_Progress').length,
      completed: allMemberAssignments.filter((a) => a.status === 'Completed').length,
      verified: allMemberAssignments.filter((a) => a.status === 'Verified').length,
      total: allMemberAssignments.length
    };

    res.json({
      counts,
      assignments
    });
  } catch (err: any) {
    console.error('Error fetching member work orders:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch assigned tasks' });
  }
}

/**
 * Fetches single assignment details with authorization check, populated infrastructure, and priority explanation.
 */
export async function getAssignmentById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    const assignment = await Assignment.findById(id)
      .populate('infrastructureId')
      .populate('complaintId')
      .populate('assignedMember', 'name phone designation assignedWard')
      .populate('assignedBy', 'name role')
      .populate('verifiedBy', 'name role');

    if (!assignment) {
      res.status(404).json({ error: 'Assignment not found' });
      return;
    }
    assertPanchayatAccess(req, assignment.panchayatId);

    // Authorization check: Only assigned member or Admin can view
    if (userRole === 'pdo' && assignment.assignedMember && assignment.assignedMember._id.toString() !== userId) {
      res.status(403).json({ error: 'Forbidden: You are not authorized to view this assignment' });
      return;
    }

    // Compute real-time priority explanation for the linked infrastructure
    let priorityExplanation = null;
    if (assignment.infrastructureId) {
      const config = await PriorityScoringService.getActiveConfig(String(assignment.panchayatId));
      priorityExplanation = PriorityScoringService.calculate(assignment.infrastructureId, config);
    }

    res.json({
      assignment,
      priorityExplanation
    });
  } catch (err: any) {
    console.error('Error fetching assignment details:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch assignment details' });
  }
}

/**
 * Handles workflow actions (accept, start, pause, complete, verify) with strict authorization.
 */
export async function handleAction(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { action, notes, completionImages, completionLocation, actualCost } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: missing authentication credentials' });
      return;
    }

    const assignment = await Assignment.findById(id);
    if (!assignment) {
      res.status(404).json({ error: 'Assignment not found' });
      return;
    }
    assertPanchayatAccess(req, assignment.panchayatId);

    // Strict Authorization:
    // Only the assigned member or an administrator can update this task!
    const isAssignedMember = userRole === 'pdo' && assignment.assignedMember && assignment.assignedMember.toString() === userId;
    const isAdmin = userRole === 'admin';

    if (!isAssignedMember && !isAdmin) {
      res.status(403).json({
        error: 'Forbidden: You cannot update assignments assigned to another member'
      });
      return;
    }

    const validActions = ['accept', 'start', 'pause', 'complete', 'verify', 'reject'];
    if (!validActions.includes(action)) {
      res.status(400).json({ error: `Invalid action. Supported: ${validActions.join(', ')}` });
      return;
    }

    const targetByAction: Record<string, string> = {
      accept: 'Accepted', start: 'In_Progress', pause: 'Accepted', complete: 'Completed', verify: 'Verified', reject: 'Rejected'
    };
    if ((action === 'complete' || action === 'verify' || action === 'reject') && !isAdmin && action !== 'complete') {
      res.status(403).json({ error: 'Forbidden: This action is restricted to administrators' });
      return;
    }
    const completionPoint = completionLocation?.coordinates?.length === 2
      ? { type: 'Point' as const, coordinates: [Number(completionLocation.coordinates[0]), Number(completionLocation.coordinates[1])] }
      : undefined;
    const linkedComplaint = assignment.complaintId
      ? await Complaint.findOne({ _id: assignment.complaintId, panchayatId: assignment.panchayatId })
      : null;
    const complaintTarget: Record<string, string> = { start: 'IN_PROGRESS', pause: 'ASSIGNED', complete: 'COMPLETED', verify: 'VERIFIED' };
    if (linkedComplaint && complaintTarget[action]) {
      const check = ComplaintStateMachineService.canTransition(linkedComplaint.status, complaintTarget[action], userRole!);
      if (!check.allowed) {
        const err: any = new Error(check.reason); err.statusCode = check.errorCode === 'UNAUTHORIZED_ROLE' ? 403 : 400; throw err;
      }
    }
    await AssignmentStateMachineService.transition(assignment, targetByAction[action], {
      id: userId, name: req.user?.name || '', role: userRole!
    }, {
      notes,
      verificationNotes: action === 'verify' ? notes : undefined,
      completionImages: Array.isArray(completionImages) ? completionImages : undefined,
      completionLocation: completionPoint,
      actualCost
    });
    if (linkedComplaint && complaintTarget[action]) {
      await ComplaintStateMachineService.executeTransition(String(linkedComplaint._id), complaintTarget[action], {
        id: userId, name: req.user?.name || '', role: userRole!
      }, notes);
    }
    if (action === 'verify' && assignment.infrastructureId) {
      await Infrastructure.findOneAndUpdate({ _id: assignment.infrastructureId, panchayatId: assignment.panchayatId }, {
        status: 'Operational', condition: 'Good', lastMaintenanceDate: new Date()
      });
    }

    // Re-populate and return updated record
    const updated = await Assignment.findById(assignment._id)
      .populate('infrastructureId')
      .populate('complaintId')
      .populate('assignedMember', 'name phone designation')
      .populate('verifiedBy', 'name role');

    res.json({
      message: `Assignment successfully updated with action: ${action}`,
      assignment: updated
    });
  } catch (err: any) {
    console.error('Error executing assignment action:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update assignment' });
  }
}

/**
 * Standard list assignments endpoint (for Admin dashboard or overview).
 */
export async function listAssignments(req: Request, res: Response): Promise<void> {
  try {
    const { status, priority, panchayatId, limit } = req.query;
    const filter: any = { ...panchayatFilter(req, panchayatId) };
    if (req.user?.role === 'pdo') filter.assignedMember = req.user.id;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const items = await Assignment.find(filter)
      .populate('infrastructureId', 'name type ward location priorityScore estimatedRepairCost estimatedMaintenanceCost')
      .populate('complaintId', 'title description priority category')
      .populate('assignedMember', 'name phone designation')
      .sort({ updatedAt: -1 })
      .limit(Number(limit) || 50);

    res.json(items);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to list maintenance assignments' });
  }
}

/**
 * Create new assignment (Admin or PDO dispatch).
 */
export async function createAssignment(req: Request, res: Response): Promise<void> {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'pdo') {
      res.status(403).json({ error: 'Only administrators and PDOs may create maintenance assignments' });
      return;
    }

    const {
      panchayatId,
      title,
      description,
      infrastructureId,
      complaintId,
      assignedMemberId,
      priority,
      scheduledDate,
      targetCompletionDate,
      allocatedBudget
    } = req.body;

    if (!title || !infrastructureId) {
      res.status(400).json({ error: 'Title and Infrastructure ID are required' });
      return;
    }

    const infrastructure = await Infrastructure.findById(infrastructureId).select('panchayatId');
    if (!infrastructure) {
      res.status(404).json({ error: 'Infrastructure not found' });
      return;
    }
    assertPanchayatAccess(req, infrastructure.panchayatId);
    if (panchayatId && String(panchayatId) !== infrastructure.panchayatId.toString()) {
      res.status(400).json({ error: 'Assignment Panchayat must match the infrastructure Panchayat' });
      return;
    }
    const scopedPanchayatId = infrastructure.panchayatId;

    const linkedComplaint = complaintId
      ? await Complaint.findOne({ _id: complaintId, infrastructureId, panchayatId: scopedPanchayatId })
      : null;
    if (complaintId && !linkedComplaint) {
      res.status(400).json({ error: 'Complaint must belong to the same Panchayat and infrastructure' });
      return;
    }
    if (linkedComplaint && normalizeState(linkedComplaint.status) !== 'PRIORITY_SET') {
      res.status(400).json({ error: 'Only priority-set complaints can be assigned' });
      return;
    }

    const count = await Assignment.countDocuments({ panchayatId: scopedPanchayatId });
    const assignmentNumber = `ASG-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    let memberId = assignedMemberId;
    if (userRole === 'pdo') {
      if (memberId && String(memberId) !== req.user!.id) {
        res.status(403).json({ error: 'PDOs may only assign work to themselves' });
        return;
      }
      memberId = req.user!.id;
    }
    if (!memberId && userRole === 'admin') {
      const defaultUser = await User.findOne({ role: 'pdo', panchayatId: scopedPanchayatId, isActive: true }).select('_id');
      memberId = defaultUser?._id;
    }
    const member = memberId ? await User.findById(memberId).select('_id role panchayatId isActive') : null;
    if (!member || member.role !== 'pdo' || !member.isActive || String(member.panchayatId || '') !== scopedPanchayatId.toString()) {
      res.status(400).json({ error: 'Assigned member must be an active PDO in the infrastructure Panchayat' });
      return;
    }

    const newAssignment = await Assignment.create({
      panchayatId: scopedPanchayatId,
      assignmentNumber,
      title,
      description,
      infrastructureId,
      complaintId: linkedComplaint?._id,
      assignedMember: member._id,
      assignedBy: req.user!.id,
      priority: priority || 'Medium',
      scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(),
      targetCompletionDate: targetCompletionDate ? new Date(targetCompletionDate) : undefined,
      allocatedBudget: Number(allocatedBudget) || 0,
      status: 'Assigned'
    });

    if (linkedComplaint) {
      await ComplaintStateMachineService.executeTransition(String(linkedComplaint._id), 'ASSIGNED', {
        id: req.user!.id, name: req.user?.name || '', role: req.user!.role
      }, `Maintenance assignment ${assignmentNumber} created`);
    }

    res.status(201).json(newAssignment);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create assignment' });
  }
}

/**
 * Simple status updater for compatibility.
 */
export async function updateAssignmentStatus(req: Request, res: Response): Promise<void> {
  const requested = String(req.body?.status || '').trim().replace(/\s+/g, '_').toLowerCase();
  const actionByStatus: Record<string, string> = {
    accepted: 'accept', in_progress: 'start', completed: 'complete', verified: 'verify', rejected: 'reject'
  };
  const action = actionByStatus[requested];
  if (!action) { res.status(400).json({ error: 'Unsupported assignment status transition' }); return; }
  req.body.action = action;
  req.body.notes = req.body.completionNotes || req.body.verificationNotes || req.body.notes;
  await handleAction(req, res);
}
