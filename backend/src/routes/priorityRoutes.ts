import { Router } from 'express';
import {
  getRanked,
  getTop,
  getById,
  getConfig,
  updateConfig,
  recalculate
} from '../controllers/priorityController.js';
import { optionalAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Public / Citizen / Member readable priority endpoints
router.get('/priorities', optionalAuth, getRanked);
router.get('/priorities/top', optionalAuth, getTop);
router.get('/priorities/config', optionalAuth, getConfig);
router.get('/priorities/:infrastructureId', optionalAuth, getById);

// Admin-only parameter tuning and manual trigger
router.put('/priorities/config', requireAdmin, updateConfig);
router.post('/priorities/recalculate', requireAdmin, recalculate);

export default router;
