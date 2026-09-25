import { Router } from 'express';
import {
  getMyWork,
  getAssignmentById,
  handleAction,
  listAssignments,
  createAssignment,
  updateAssignmentStatus
} from '../controllers/assignmentController.js';
import { requireAdmin, requireMemberOrAdmin } from '../middleware/auth.js';

const router = Router();

// Member/PDO personal work order dashboard
router.get('/assignments/my-work', requireMemberOrAdmin, getMyWork);

// Assignment action workflow (Start, Pause, Complete, Verify)
router.patch('/assignments/:id/action', requireMemberOrAdmin, handleAction);

// Single assignment details with priority explanation
router.get('/assignments/:id', requireMemberOrAdmin, getAssignmentById);

// General list and create
router.get('/assignments', requireMemberOrAdmin, listAssignments);
router.post('/assignments', requireMemberOrAdmin, createAssignment);
router.patch('/assignments/:id/status', requireAdmin, updateAssignmentStatus);

export default router;
