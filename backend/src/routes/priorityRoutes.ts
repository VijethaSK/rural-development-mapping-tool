import { Router } from 'express';
import {
  getRanked,
  getTop,
  getById,
  getConfig,
  updateConfig,
  recalculate
} from '../controllers/priorityController.js';
import {
  approveAssetScope,
  approveProfileReview,
  acceptEvidence,
  createEvidence,
  getEvidence,
  listEvidence,
  rejectEvidence,
  submitEvidence
} from '../controllers/priorityEvidenceController.js';
import { optionalAuth, requireAdmin, requireMemberOrAdmin } from '../middleware/auth.js';

const router = Router();

// Public / Citizen / Member readable priority endpoints
router.get('/priorities', optionalAuth, getRanked);
router.get('/priorities/top', optionalAuth, getTop);
router.get('/priorities/config', optionalAuth, getConfig);
// Evidence is operational data: PDO/admin may read or submit; only admins review it.
router.get('/priorities/:infrastructureId/evidence', requireMemberOrAdmin, listEvidence);
router.post('/priorities/:infrastructureId/evidence', requireMemberOrAdmin, createEvidence);
router.get('/priorities/:infrastructureId/evidence/:evidenceId', requireMemberOrAdmin, getEvidence);
router.post('/priorities/:infrastructureId/evidence/:evidenceId/factors/:factor/submit', requireMemberOrAdmin, submitEvidence);
router.post('/priorities/:infrastructureId/evidence/:evidenceId/factors/:factor/accept', requireAdmin, acceptEvidence);
router.post('/priorities/:infrastructureId/evidence/:evidenceId/factors/:factor/reject', requireAdmin, rejectEvidence);
router.post('/priorities/:infrastructureId/evidence/:evidenceId/asset-scope-review/approve', requireAdmin, approveAssetScope);
router.post('/priorities/:infrastructureId/evidence/:evidenceId/profile-review/approve', requireAdmin, approveProfileReview);
router.get('/priorities/:infrastructureId', optionalAuth, getById);

// Admin-only parameter tuning and manual trigger
router.put('/priorities/config', requireAdmin, updateConfig);
router.post('/priorities/recalculate', requireAdmin, recalculate);

export default router;
