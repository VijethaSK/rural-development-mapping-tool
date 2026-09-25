import { Router } from 'express';
import { listPanchayats, listSchools, listRoads, listIssues, reportIssue } from '../controllers/panchayatController.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();
router.get('/panchayats', optionalAuth, listPanchayats);
router.get('/panchayats/:id/schools', optionalAuth, listSchools);
router.get('/panchayats/:id/roads', optionalAuth, listRoads);
router.get('/panchayats/:id/issues', optionalAuth, listIssues);
router.post('/panchayats/:id/issues', optionalAuth, reportIssue);
export default router;
