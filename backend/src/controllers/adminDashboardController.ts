import { Request, Response } from 'express';
import { AdminDashboardService } from '../services/dashboard/adminDashboardService.js';
import { resolvePanchayatScope } from '../middleware/panchayatScope.js';

export async function getDecisionSupport(req: Request, res: Response): Promise<void> {
  try {
    const panchayatId = resolvePanchayatScope(req, req.query.panchayatId);
    const budget = req.query.budget ? Number(req.query.budget) : undefined;

    const data = await AdminDashboardService.getDecisionSupportData({
      panchayatId,
      budget
    });

    res.json(data);
  } catch (err: any) {
    console.error('Error fetching admin decision-support dashboard data:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch decision-support dashboard data' });
  }
}
