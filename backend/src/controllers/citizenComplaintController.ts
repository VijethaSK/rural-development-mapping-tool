import { Request, Response } from 'express';
import { Complaint, ComplaintStatus, ComplaintCategory } from '../models/Complaint.js';
import { Infrastructure } from '../models/Infrastructure.js';
import { CitizenUser } from '../models/User.js';
import { Panchayat } from '../models/Panchayat.js';
import {
  ComplaintStateMachineService,
  normalizeState,
  ComplaintState
} from '../services/complaints/complaintStateMachine.js';
import mongoose from 'mongoose';
import { assertPanchayatAccess, panchayatFilter, resolvePanchayatScope } from '../middleware/panchayatScope.js';

/**
 * Standard complaint lifecycle steps for visual progress representation.
 */
export const LIFECYCLE_STEPS = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'PRIORITY_SET',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'VERIFIED',
  'CLOSED'
] as const;

/**
 * List complaints with flexible filtering for Citizens, Field Staff, and Public GIS.
 */
export async function listComplaints(req: Request, res: Response): Promise<void> {
  try {
    const {
      category,
      status,
      ward,
      infrastructureId,
      search,
      myComplaints,
      panchayatId,
      limit = '50',
      skip = '0'
    } = req.query;

    const filter: any = { ...panchayatFilter(req, panchayatId) };

    // Citizen personal filter
    const userId = (req as any).user?.id;
    if (myComplaints === 'true') {
      if (!userId) {
        res.status(401).json({ error: 'Authentication required to view your submitted complaints' });
        return;
      }
      if (req.user?.role !== 'citizen') {
        res.status(403).json({ error: 'Only citizens can request their personal complaints' });
        return;
      }
      filter.citizenId = userId;
    }

    if (category && category !== 'All') {
      filter.category = category;
    }

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (ward && ward !== 'All') {
      filter.ward = ward;
    }

    if (infrastructureId) {
      filter.infrastructureId = infrastructureId;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { ward: { $regex: q, $options: 'i' } },
        { village: { $regex: q, $options: 'i' } }
      ];
    }

    const total = await Complaint.countDocuments(filter);
    const complaints = await Complaint.find(filter)
      .populate('infrastructureId', 'name type condition ward village location priorityScore')
      .select('-citizenId -reporterName -reporterPhone')
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    // Map user hasVoted flag if user is logged in
    const mapped = complaints.map((c) => {
      const hasVoted = userId
        ? (c.votes || []).some((v: any) => v.userId && v.userId.toString() === userId)
        : false;
      return {
        ...c,
        hasVoted
      };
    });

    res.json({
      total,
      complaints: mapped
    });
  } catch (err: any) {
    console.error('Error listing complaints:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to list complaints' });
  }
}

/**
 * Get single complaint with full details, lifecycle stage, comments, and upvotes.
 */
export async function getComplaintById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid complaint ID' });
      return;
    }

    const complaint = await Complaint.findById(id)
      .populate('infrastructureId')
      .populate('statusHistory.updatedBy', 'name role')
      .populate('comments.userId', 'name role');

    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found' });
      return;
    }
    assertPanchayatAccess(req, complaint.panchayatId);

    const userId = (req as any).user?.id;
    const hasVoted = userId
      ? complaint.votes.some((v) => v.userId && v.userId.toString() === userId)
      : false;

    // Calculate visual lifecycle position
    const currentStatus = complaint.status;
    const normalized = normalizeState(currentStatus);
    let stepIndex = LIFECYCLE_STEPS.indexOf(normalized as any);
    if (stepIndex === -1) stepIndex = 1;

    const isRejected = normalized === 'REJECTED';
    const isReassigned = normalized === 'REASSIGNED';

    const userRole = (req as any).user?.role || 'citizen';
    const availableTransitions = ComplaintStateMachineService.getAvailableTransitions(
      normalized,
      userRole
    );

    const complaintPayload: any = complaint.toObject();
    const mayViewReporterIdentity = req.user?.role === 'admin' || String(complaint.citizenId || '') === String(userId || '');
    if (!mayViewReporterIdentity) {
      delete complaintPayload.citizenId;
      delete complaintPayload.reporterName;
      delete complaintPayload.reporterPhone;
    }

    res.json({
      complaint: {
        ...complaintPayload,
        hasVoted
      },
      lifecycle: {
        currentStatus,
        normalizedStatus: normalized,
        stepIndex,
        isRejected,
        isReassigned,
        steps: LIFECYCLE_STEPS,
        availableTransitions
      }
    });
  } catch (err: any) {
    console.error('Error fetching complaint details:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch complaint' });
  }
}

/**
 * Citizen submission of a new infrastructure complaint.
 * Enforces strict security:
 * - Citizens CANNOT dictate priority (defaulted to Medium / calculated SAW score).
 * - Citizens CANNOT set status (forced to 'Submitted').
 * - Citizens CANNOT assign workers.
 */
export async function createComplaint(req: Request, res: Response): Promise<void> {
  try {
    const {
      title,
      description,
      category,
      ward,
      village,
      infrastructureId,
      location,
      images,
      reporterName,
      reporterPhone
    } = req.body;

    if (req.user && req.user.role !== 'citizen') {
      res.status(403).json({ error: 'Only citizens may submit citizen complaints' });
      return;
    }

    if (!description || !category || !ward) {
      res.status(400).json({ error: 'Description, category, and ward are mandatory fields' });
      return;
    }

    // Default panchayat link if not provided
    let panchayatId = resolvePanchayatScope(req, req.body.panchayatId);
    if (!panchayatId) {
      res.status(400).json({ error: 'Panchayat ID is required for a public complaint submission' });
      return;
    }
    if (!(await Panchayat.exists({ _id: panchayatId }))) {
      res.status(400).json({ error: 'Panchayat not found' });
      return;
    }

    const authenticatedUser = (req as any).user;
    const citizenId = authenticatedUser?.role === 'citizen' ? authenticatedUser.id : undefined;

    // Format coordinates safely into GeoJSON Point
    let formattedLocation: any = undefined;
    if (location) {
      if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
        formattedLocation = {
          type: 'Point',
          coordinates: [Number(location.coordinates[0]), Number(location.coordinates[1])]
        };
      } else if (location.lat != null && location.lng != null) {
        formattedLocation = {
          type: 'Point',
          coordinates: [Number(location.lng), Number(location.lat)]
        };
      }
    }

    // If no coordinates were explicitly passed, copy coordinates from linked infrastructure
    if (!formattedLocation && infrastructureId) {
      const infra = await Infrastructure.findOne({ _id: infrastructureId, panchayatId });
      if (infra && infra.location) {
        formattedLocation = infra.location;
      }
    }
    if (infrastructureId && !(await Infrastructure.exists({ _id: infrastructureId, panchayatId }))) {
      res.status(400).json({ error: 'Infrastructure must belong to the selected Panchayat' });
      return;
    }

    // Sanitize image uploads array
    const formattedImages = Array.isArray(images)
      ? images.map((img: any) => ({
          url: typeof img === 'string' ? img : img.url,
          caption: img.caption || 'Citizen report attachment',
          uploadedAt: new Date()
        }))
      : [];

    // CRITICAL SECURITY ENFORCEMENT:
    // Status is always initialized to 'Submitted'
    // Priority is initial 'Medium' (Admin or SAW engine sets priority later)
    const newComplaint = new Complaint({
      panchayatId,
      infrastructureId: infrastructureId || undefined,
      citizenId: citizenId || undefined,
      title: title?.trim() || description.slice(0, 60),
      description: description.trim(),
      category: category as ComplaintCategory,
      priority: 'Medium', // Citizen cannot dictate priority!
      status: 'SUBMITTED', // Citizen cannot jump lifecycle stages!
      ward: ward.trim(),
      village: village?.trim() || '',
      location: formattedLocation,
      images: formattedImages,
      reporterName: reporterName || authenticatedUser?.name || 'Concerned Citizen',
      reporterPhone: reporterPhone || undefined,
      statusHistory: [
        {
          status: 'SUBMITTED',
          notes: 'Complaint filed by citizen through online GIS portal',
          timestamp: new Date()
        }
      ]
    });

    await newComplaint.save();

    // Increment citizen stats if authenticated
    if (citizenId) {
      await CitizenUser.findByIdAndUpdate(citizenId, {
        $inc: { complaintsSubmittedCount: 1 }
      });
    }

    // Increment infrastructure complaint tally
    if (infrastructureId) {
      await Infrastructure.findByIdAndUpdate(infrastructureId, {
        $inc: { complaintsCount: 1 }
      });
    }

    const created = await Complaint.findById(newComplaint._id)
      .populate('infrastructureId', 'name type ward condition')
      .lean();

    res.status(201).json({
      message: 'Complaint submitted successfully and queued for Panchayat review',
      complaint: created
    });
  } catch (err: any) {
    console.error('Error creating complaint:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to submit complaint' });
  }
}

/**
 * Add civic comment to a complaint.
 * Available to authenticated Citizens, PDOs, and Admins.
 */
export async function addComment(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const user = (req as any).user;

    if (!user || !user.id) {
      res.status(401).json({ error: 'Authentication required to post comments' });
      return;
    }

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Comment text cannot be empty' });
      return;
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found' });
      return;
    }
    assertPanchayatAccess(req, complaint.panchayatId);

    complaint.comments.push({
      userId: user.id,
      userName: user.name || 'Citizen',
      userRole: user.role || 'citizen',
      text: text.trim(),
      createdAt: new Date()
    });

    await complaint.save();

    res.status(201).json({
      message: 'Comment posted successfully',
      comments: complaint.comments
    });
  } catch (err: any) {
    console.error('Error posting comment:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to post comment' });
  }
}

/**
 * Vote / support a citizen complaint (1 vote per user toggle).
 */
export async function toggleVote(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required to vote on complaints' });
      return;
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found' });
      return;
    }
    assertPanchayatAccess(req, complaint.panchayatId);

    const userStr = userId.toString();
    const alreadyVoted = (complaint.votes || []).some(
      (v) => v.userId && v.userId.toString() === userStr
    );

    let hasVoted = false;
    if (alreadyVoted) {
      complaint.votes = complaint.votes.filter(
        (v) => v.userId && v.userId.toString() !== userStr
      );
      hasVoted = false;
    } else {
      complaint.votes.push({
        userId: new mongoose.Types.ObjectId(userStr) as any,
        votedAt: new Date()
      });
      hasVoted = true;
    }

    complaint.upvotesCount = complaint.votes.length;
    await complaint.save();

    res.json({
      message: hasVoted ? 'Supported complaint' : 'Removed support from complaint',
      hasVoted,
      upvotesCount: complaint.upvotesCount
    });
  } catch (err: any) {
    console.error('Error toggling vote:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to toggle vote' });
  }
}

/**
 * Update complaint lifecycle status via Controlled State Machine.
 * Strictly checks authorized transitions and role permissions.
 */
export async function updateComplaintStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status, toState, notes, comment } = req.body;
    const target = toState || status;
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!target) {
      res.status(400).json({ error: 'Target status (status or toState) is required' });
      return;
    }

    const existing = await Complaint.findById(id).select('panchayatId');
    if (!existing) {
      res.status(404).json({ error: 'Complaint not found' });
      return;
    }
    assertPanchayatAccess(req, existing.panchayatId);

    const { complaint, historyItem } = await ComplaintStateMachineService.executeTransition(
      id,
      target,
      { id: user.id, name: user.name, role: user.role },
      comment || notes
    );

    res.json({
      message: `Complaint status successfully transitioned to ${complaint.status}`,
      complaint,
      transition: historyItem
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 400;
    res.status(statusCode).json({ error: err.message, errorCode: err.errorCode });
  }
}

export const transitionComplaint = updateComplaintStatus;

/**
 * Set complaint priority.
 * STRICTLY restricted to Admin role via requireAdmin.
 */
export async function updateComplaintPriority(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { priority, notes } = req.body;
    const user = (req as any).user;

    if (user?.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden: Only administrators can update priority' });
      return;
    }

    const allowedPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (!allowedPriorities.includes(priority)) {
      res.status(400).json({ error: `Invalid priority. Allowed: ${allowedPriorities.join(', ')}` });
      return;
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found' });
      return;
    }
    assertPanchayatAccess(req, complaint.panchayatId);

    complaint.priority = priority;
    await complaint.save();

    const cur = normalizeState(complaint.status);
    if (cur === 'SUBMITTED') {
      await ComplaintStateMachineService.executeTransition(
        id,
        'UNDER_REVIEW',
        { id: user?.id, name: user?.name, role: user?.role },
        'Automated review progression prior to priority setting'
      );
      await ComplaintStateMachineService.executeTransition(
        id,
        'PRIORITY_SET',
        { id: user?.id, name: user?.name, role: user?.role },
        notes || `Priority assessed and set to ${priority} by Panchayat Admin (${user?.name})`
      );
    } else if (cur === 'UNDER_REVIEW') {
      await ComplaintStateMachineService.executeTransition(
        id,
        'PRIORITY_SET',
        { id: user?.id, name: user?.name, role: user?.role },
        notes || `Priority assessed and set to ${priority} by Panchayat Admin (${user?.name})`
      );
    } else {
      complaint.statusHistory.push({
        newStatus: cur,
        status: cur,
        changedByName: user?.name,
        changedByRole: user?.role,
        comment: `Priority updated to ${priority}`,
        notes: `Priority updated to ${priority}`,
        timestamp: new Date()
      });
      await complaint.save();
    }

    const updated = await Complaint.findById(id);
    res.json({
      message: `Complaint priority set to ${priority}`,
      complaint: updated
    });
  } catch (err: any) {
    const code = err.statusCode || 400;
    res.status(code).json({ error: err.message, errorCode: err.errorCode });
  }
}
