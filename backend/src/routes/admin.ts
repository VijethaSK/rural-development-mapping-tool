import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { createPanchayat } from '../controllers/panchayatController.js';
import * as school from '../controllers/schoolController.js';
import * as road from '../controllers/roadController.js';
import * as issue from '../controllers/issueController.js';
import { getDecisionSupport } from '../controllers/adminDashboardController.js';

const router = Router();
router.get('/admin/decision-support', requireAdmin, getDecisionSupport);
router.post('/panchayats', requireAdmin, createPanchayat);

router.get('/admin/schools', requireAdmin, school.list);
router.post('/admin/schools', requireAdmin, school.create);
router.get('/admin/schools/:id', requireAdmin, school.get);
router.put('/admin/schools/:id', requireAdmin, school.update);
router.delete('/admin/schools/:id', requireAdmin, school.remove);

router.get('/admin/roads', requireAdmin, road.list);
router.post('/admin/roads', requireAdmin, road.create);
router.get('/admin/roads/:id', requireAdmin, road.get);
router.put('/admin/roads/:id', requireAdmin, road.update);
router.delete('/admin/roads/:id', requireAdmin, road.remove);

router.patch('/issues/:id/status', requireAdmin, issue.updateStatus);
router.delete('/issues/:id', requireAdmin, issue.remove);

export default router;

