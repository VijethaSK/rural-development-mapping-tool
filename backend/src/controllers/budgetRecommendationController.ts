import { Request, Response } from 'express';
import { BudgetRecommendationService } from '../services/budget/budgetRecommendationService.js';
import { resolvePanchayatScope } from '../middleware/panchayatScope.js';

/**
 * Generates budget-constrained infrastructure repair recommendations.
 * Accepts budget, optional panchayatId, type filter, ward, minPriorityScore, and strategy.
 */
export async function getRecommendations(req: Request, res: Response): Promise<void> {
  try {
    // Support both POST (req.body) and GET (req.query) for flexibility
    const params = req.method === 'POST' ? req.body : req.query;

    const budget = Number(params.budget) || 1000000; // Default ₹10,00,000 (10 Lakhs)
    const panchayatId = resolvePanchayatScope(req, params.panchayatId);
    const type = params.type ? String(params.type) : undefined;
    const ward = params.ward ? String(params.ward) : undefined;
    const minPriorityScore = params.minPriorityScore != null ? Number(params.minPriorityScore) : undefined;
    const strategy = (params.strategy as 'greedy' | 'knapsack' | 'comparison') || 'greedy';

    if (budget < 0) {
      res.status(400).json({ error: 'Budget cannot be negative' });
      return;
    }

    const result = await BudgetRecommendationService.recommendProjects({
      budget,
      panchayatId,
      type,
      ward,
      minPriorityScore,
      strategy
    });

    res.json(result);
  } catch (err: any) {
    console.error('Error generating budget recommendations:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to generate budget recommendations' });
  }
}

/**
 * Fetches the high-level infrastructure repair backlog and budget preset metrics.
 */
export async function getOverview(req: Request, res: Response): Promise<void> {
  try {
    const panchayatId = resolvePanchayatScope(req, req.query.panchayatId);
    const overview = await BudgetRecommendationService.getBudgetOverview(
      panchayatId ? String(panchayatId) : undefined
    );
    res.json(overview);
  } catch (err: any) {
    console.error('Error fetching budget overview:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch budget overview' });
  }
}
