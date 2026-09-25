import { Router } from 'express';
import { GapDetectionController } from '../controllers/gapDetectionController.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

router.post('/gap-analysis/analyze', optionalAuth, GapDetectionController.analyze);
router.get('/gap-analysis/overview', optionalAuth, GapDetectionController.getOverview);
router.get('/gap-analysis/config', optionalAuth, GapDetectionController.getConfig);

export default router;
