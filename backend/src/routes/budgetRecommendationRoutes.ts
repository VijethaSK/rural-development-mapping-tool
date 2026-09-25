import { Router } from 'express';
import { getRecommendations, getOverview } from '../controllers/budgetRecommendationController.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

// Recommendation endpoints (accessible for public, members, and administrators)
router.post('/budget/recommend', optionalAuth, getRecommendations);
router.get('/budget/recommend', optionalAuth, getRecommendations);
router.get('/budget/overview', optionalAuth, getOverview);

export default router;
