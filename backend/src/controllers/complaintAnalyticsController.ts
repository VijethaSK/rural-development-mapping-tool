import { Request, Response } from 'express';
import { ComplaintAnalyticsService } from '../services/complaints/complaintAnalyticsService.js';
import { ComplaintFilterOptions } from '../services/complaints/types.js';
import { resolvePanchayatScope } from '../middleware/panchayatScope.js';

export class ComplaintAnalyticsController {
  private static parseFilters(req: Request): ComplaintFilterOptions {
    const {
      panchayatId,
      startDate,
      endDate,
      category,
      infrastructureType,
      status,
      priority,
      ward
    } = req.query;

    return {
      panchayatId: resolvePanchayatScope(req, panchayatId),
      startDate: startDate as string,
      endDate: endDate as string,
      category: category as string,
      infrastructureType: infrastructureType as string,
      status: status as string,
      priority: priority as string,
      ward: ward as string
    };
  }

  /**
   * GET /api/complaints/analytics/summary
   */
  public static async getSummary(req: Request, res: Response): Promise<void> {
    try {
      const filters = ComplaintAnalyticsController.parseFilters(req);
      const summary = await ComplaintAnalyticsService.getSummary(filters);
      res.json({ success: true, data: summary });
    } catch (err: any) {
      console.error('Complaint summary error:', err);
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to generate complaint analytics summary.' });
    }
  }

  /**
   * GET /api/complaints/analytics/heatmap
   */
  public static async getHeatmap(req: Request, res: Response): Promise<void> {
    try {
      const filters = ComplaintAnalyticsController.parseFilters(req);
      const heatmap = await ComplaintAnalyticsService.getHeatmapData(filters);
      res.json({ success: true, data: heatmap });
    } catch (err: any) {
      console.error('Heatmap generation error:', err);
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to generate complaint heatmap.' });
    }
  }

  /**
   * POST /api/complaints/analytics/inspect
   * Inspect underlying complaints in a cluster
   */
  public static async inspectCluster(req: Request, res: Response): Promise<void> {
    try {
      const { complaintIds } = req.body;
      if (!complaintIds || !Array.isArray(complaintIds)) {
        res.status(400).json({ error: 'complaintIds must be an array of IDs.' });
        return;
      }

      const panchayatId = resolvePanchayatScope(req, req.body.panchayatId);
      const items = await ComplaintAnalyticsService.getClusterDetails(complaintIds, panchayatId);
      res.json({ success: true, count: items.length, data: items });
    } catch (err: any) {
      console.error('Cluster inspection error:', err);
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to inspect cluster.' });
    }
  }
}
