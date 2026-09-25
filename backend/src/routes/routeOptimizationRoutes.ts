import { Router } from 'express';
import { RouteOptimizationController } from '../controllers/routeOptimizationController.js';
import { optionalAuth, requireMemberOrAdmin } from '../middleware/auth.js';

const router = Router();

// Route Optimization & Planning APIs
router.post('/routes/optimize', optionalAuth, RouteOptimizationController.optimize);
router.post('/routes/save', requireMemberOrAdmin, RouteOptimizationController.saveRoute);
router.get('/routes/candidates', optionalAuth, RouteOptimizationController.getCandidates);
router.get('/routes', optionalAuth, RouteOptimizationController.getRoutes);
router.get('/routes/:id', optionalAuth, RouteOptimizationController.getRouteById);

export default router;
