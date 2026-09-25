import { Router } from 'express';
import { ComplaintAnalyticsController } from '../controllers/complaintAnalyticsController.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

router.get('/complaints/analytics/summary', optionalAuth, ComplaintAnalyticsController.getSummary);
router.get('/complaints/analytics/heatmap', optionalAuth, ComplaintAnalyticsController.getHeatmap);
router.post('/complaints/analytics/inspect', optionalAuth, ComplaintAnalyticsController.inspectCluster);

export default router;
