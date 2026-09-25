import { Request, Response } from 'express';
import { GapDetectionService } from '../services/spatial/gapDetectionService.js';
import { resolvePanchayatScope } from '../middleware/panchayatScope.js';

export class GapDetectionController {
  /**
   * POST /api/gap-analysis/analyze
   * Run spatial gap analysis with custom or configured thresholds
   */
  public static async analyze(req: Request, res: Response): Promise<void> {
    try {
      const {
        panchayatId: requestedPanchayatId,
        schoolThresholdKm,
        roadThresholdKm,
        gridResolutionKm,
        computeNetworkDistance
      } = req.body;
      const panchayatId = resolvePanchayatScope(req, requestedPanchayatId);

      const result = await GapDetectionService.calculateAccessibility({
        panchayatId,
        schoolThresholdKm: schoolThresholdKm != null ? Number(schoolThresholdKm) : 3.0,
        roadThresholdKm: roadThresholdKm != null ? Number(roadThresholdKm) : 1.0,
        gridResolutionKm: gridResolutionKm != null ? Number(gridResolutionKm) : 0.8,
        computeNetworkDistance: computeNetworkDistance ?? true
      });

      res.json({
        success: true,
        data: result
      });
    } catch (err: any) {
      console.error('Gap analysis error:', err);
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to execute spatial gap analysis.' });
    }
  }

  /**
   * GET /api/gap-analysis/overview
   * Fast default overview
   */
  public static async getOverview(req: Request, res: Response): Promise<void> {
    try {
      const { schoolThreshold, roadThreshold } = req.query;
      const panchayatId = resolvePanchayatScope(req, req.query.panchayatId);

      const result = await GapDetectionService.calculateAccessibility({
        panchayatId: panchayatId as string,
        schoolThresholdKm: schoolThreshold ? Number(schoolThreshold) : 3.0,
        roadThresholdKm: roadThreshold ? Number(roadThreshold) : 1.0,
        gridResolutionKm: 1.0, // faster resolution for quick overview
        computeNetworkDistance: false
      });

      res.json({
        success: true,
        data: {
          metrics: result.metrics,
          underservedCount: result.underservedAreas.length,
          spatialAnalysisAvailable: result.spatialAnalysisAvailable,
          spatialAnalysisUnavailableReason: result.spatialAnalysisUnavailableReason,
          configuredThresholds: result.configuredThresholds
        }
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch gap overview.' });
    }
  }

  /**
   * GET /api/gap-analysis/config
   */
  public static async getConfig(req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      defaults: {
        schoolThresholdKm: 3.0,
        roadThresholdKm: 1.0,
        gridResolutionKm: 0.8,
        guidelines: {
          school: 'Right to Education (RTE) norm: Primary school within 1 km, Upper Primary within 3 km, Secondary within 5 km.',
          road: 'PMGSY (Pradhan Mantri Gram Sadak Yojana) norm: Habitation connectivity within 500m to 1km of all-weather road network.'
        }
      }
    });
  }
}
