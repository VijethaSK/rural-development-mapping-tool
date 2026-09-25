import { Router } from 'express';
import { getAnalyticalReport } from '../controllers/reportController.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
router.get('/reports/analytical', requireAdmin, getAnalyticalReport);

export default router;
