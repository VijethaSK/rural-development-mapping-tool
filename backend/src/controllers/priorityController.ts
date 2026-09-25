import { Request, Response } from 'express';
import { PriorityScoringService, PriorityLevel } from '../services/priorityScoringService.js';
import { PriorityConfig } from '../models/PriorityConfig.js';
import { Infrastructure } from '../models/Infrastructure.js';
import { assertPanchayatAccess, panchayatFilter, resolvePanchayatScope } from '../middleware/panchayatScope.js';

export async function getRanked(req: Request, res: Response): Promise<void> {
  try {
    const { type, ward, level, limit } = req.query;
    const scope = panchayatFilter(req, req.query.panchayatId);

    const data = await PriorityScoringService.getRanked({
      panchayatId: scope.panchayatId,
      type: type ? String(type) : undefined,
      ward: ward ? String(ward) : undefined,
      level: level ? (String(level) as PriorityLevel) : undefined,
      limit: limit ? Number(limit) : undefined
    });

    res.json(data);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to calculate priorities' });
  }
}

export async function getTop(req: Request, res: Response): Promise<void> {
  try {
    const limit = Number(req.query.limit) || 10;
    const { type, ward } = req.query;
    const scope = panchayatFilter(req, req.query.panchayatId);

    const data = await PriorityScoringService.getRanked({
      panchayatId: scope.panchayatId,
      type: type ? String(type) : undefined,
      ward: ward ? String(ward) : undefined,
      limit
    });

    res.json(data);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch top priorities' });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const { infrastructureId } = req.params;
    const asset = await Infrastructure.findById(infrastructureId);
    if (!asset) {
      res.status(404).json({ error: 'Infrastructure item not found' });
      return;
    }
    assertPanchayatAccess(req, asset.panchayatId);

    if (asset.dataOrigin === 'SOURCE_EXCEL' && asset.priorityScorable !== true) {
      res.json({
        infrastructureId: asset._id,
        name: asset.name,
        type: asset.type,
        sourceCategory: asset.sourceCategory,
        sourceType: asset.sourceType,
        priorityScore: null,
        priorityLevel: 'Unavailable',
        scoringStatus: 'UNAVAILABLE',
        reason: 'Priority scoring is unavailable because source-derived condition, complaint, population, traffic, maintenance, and/or spatial values have not been provided or verified.',
        missingDataFields: asset.missingDataFields || []
      });
      return;
    }

    const config = await PriorityScoringService.getActiveConfig(asset.panchayatId.toString());
    const explanation = PriorityScoringService.calculate(asset, config);

    res.json({
      infrastructureId: asset._id,
      name: asset.name,
      type: asset.type,
      ward: asset.ward,
      ...explanation
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to evaluate asset priority' });
  }
}

export async function getConfig(req: Request, res: Response): Promise<void> {
  try {
    const scope = panchayatFilter(req, req.query.panchayatId);
    const config = await PriorityScoringService.getActiveConfig(scope.panchayatId);
    res.json(config);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to retrieve priority configuration' });
  }
}

export async function updateConfig(req: Request, res: Response): Promise<void> {
  try {
    const { weights, thresholds, limits, name } = req.body;

    if (weights) {
      const sum =
        (weights.condition ?? 0) +
        (weights.complaints ?? 0) +
        (weights.population ?? 0) +
        (weights.traffic ?? 0) +
        (weights.maintenanceAge ?? 0) +
        (weights.alternativeDistance ?? 0);

      const delta = Math.abs(sum - 1.0);
      if (delta > 0.01) {
        res.status(400).json({
          error: `Weights must sum to 1.0 (100%). Current sum is ${sum.toFixed(3)}.`
        });
        return;
      }
    }

    const panchayatId = resolvePanchayatScope(req, req.body.panchayatId);
    let doc = panchayatId
      ? await PriorityConfig.findOne({ panchayatId }).sort({ updatedAt: -1 })
      : await PriorityConfig.findOne({ panchayatId: { $exists: false } }).sort({ updatedAt: -1 });
    if (!doc) {
      doc = new PriorityConfig(panchayatId ? { panchayatId } : {});
    }

    if (weights) doc.weights = { ...doc.weights, ...weights };
    if (thresholds) doc.thresholds = { ...doc.thresholds, ...thresholds };
    if (limits) doc.limits = { ...doc.limits, ...limits };
    if (name) doc.name = name;
    if (req.user?.id) doc.updatedBy = req.user.id as any;

    await doc.save();

    // Automatically recalculate scores across all assets with new weights
    const recalc = await PriorityScoringService.recalculateAll(panchayatId);

    res.json({
      message: 'Priority configuration updated and scores recalculated successfully.',
      config: doc,
      recalculatedAssets: recalc.updatedCount,
      newAverageScore: recalc.averageScore
    });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ error: err.message || 'Invalid priority configuration' });
  }
}

export async function recalculate(req: Request, res: Response): Promise<void> {
  try {
    const scope = panchayatFilter(req, req.query.panchayatId);
    const result = await PriorityScoringService.recalculateAll(scope.panchayatId);
    res.json({
      message: 'Priority scores recalculated successfully.',
      ...result
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to recalculate priority scores' });
  }
}
