import { Router } from 'express';
import {
  listComplaints,
  getComplaintById,
  createComplaint,
  addComment,
  toggleVote,
  updateComplaintStatus,
  updateComplaintPriority
} from '../controllers/citizenComplaintController.js';
import { requireAuth, requireAdmin, requireMemberOrAdmin, optionalAuth } from '../middleware/auth.js';

const router = Router();

// Public / Citizen Discovery & Listing
router.get('/complaints', optionalAuth, listComplaints);
router.get('/complaints/:id', optionalAuth, getComplaintById);

// Citizen Complaint Submission (optional auth links citizen profile if logged in)
router.post('/complaints', optionalAuth, createComplaint);

// Civic Engagement (Comments & Upvoting)
router.post('/complaints/:id/comments', requireAuth, addComment);
router.post('/complaints/:id/vote', requireAuth, toggleVote);

// Administrative / Field Official Status Progression (Citizens BLOCKED with 403)
router.patch('/complaints/:id/status', requireMemberOrAdmin, updateComplaintStatus);
router.post('/complaints/:id/transition', requireMemberOrAdmin, updateComplaintStatus);

// Administrative Priority Setting (Citizens & PDOs BLOCKED with 403)
router.patch('/complaints/:id/priority', requireAdmin, updateComplaintPriority);

export default router;
