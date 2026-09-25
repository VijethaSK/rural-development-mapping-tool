import { Request, Response } from 'express';
import { AnalyticalReportService } from '../services/reporting/analyticalReportService.js';
import { resolvePanchayatScope } from '../middleware/panchayatScope.js';

export async function getAnalyticalReport(req: Request, res: Response): Promise<void> {
  try {
    const budget = req.query.budget == null ? undefined : Number(req.query.budget);
    const report = await AnalyticalReportService.generate({
      panchayatId: resolvePanchayatScope(req, req.query.panchayatId),
      infrastructureType: req.query.infrastructureType && req.query.infrastructureType !== 'All'
        ? String(req.query.infrastructureType)
        : undefined,
      startDate: req.query.startDate ? String(req.query.startDate) : undefined,
      endDate: req.query.endDate ? String(req.query.endDate) : undefined,
      budget
    });
    res.json({ success: true, data: report });
  } catch (err: any) {
    const message = err.message || 'Failed to generate analytical report.';
    const status = err.statusCode || (/Invalid|must be|not found/i.test(message) ? 400 : 500);
    res.status(status).json({ error: message });
  }
}
