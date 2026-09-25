import { PriorityConfig, PriorityWeights, PriorityThresholds, NormalizationLimits } from '../models/PriorityConfig.js';
import { Infrastructure, Road } from '../models/Infrastructure.js';
import type { InfrastructureDoc, RoadDoc } from '../models/Infrastructure.js';

export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export type RankedPriorityLevel = PriorityLevel | 'Unavailable';

export interface FactorDetail {
  rawValue: string | number;
  normalizedScore: number; // 0 to 100
  weight: number;          // 0 to 1
  contribution: number;    // normalizedScore * weight
  description: string;
}

export interface PriorityExplanation {
  priorityScore: number;   // 0 to 100
  priorityLevel: PriorityLevel;
  summary: string;
  factors: {
    condition: FactorDetail;
    complaints: FactorDetail;
    population: FactorDetail;
    traffic: FactorDetail;
    maintenanceAge: FactorDetail;
    alternativeDistance: FactorDetail;
  };
  weightsUsed: PriorityWeights;
  thresholdsUsed: PriorityThresholds;
  calculatedAt: Date;
}

export interface RankedItem {
  id: string;
  _id?: string;
  panchayatId: string;
  name: string;
  type: string;
  ward?: string | null;
  village?: string;
  location: any;
  lineGeometry?: any;
  condition: string | null;
  status?: string | null;
  description?: string;
  lastMaintenanceDate?: Date | string;
  complaintsCount: number | null;
  populationServed: number | null;
  priorityScore: number | null;
  priorityLevel: RankedPriorityLevel;
  scoringStatus: 'SCORED' | 'UNAVAILABLE';
  explanation: PriorityExplanation | null;
  dataOrigin?: string;
  isSynthetic?: boolean;
  sourceCategory?: string;
  sourceType?: string;
  sourceStatus?: string;
  sourceReportedQuantity?: unknown;
  source?: string;
  sourceVintage?: string;
  sourceWorkbook?: string;
  sourceRow?: number;
  verificationRequired?: boolean;
  verificationNotes?: string;
  coordinatesVerified?: boolean;
  coordinateSource?: string | null;
  estimatedMaintenanceCost: number | null;
  estimatedRepairCost?: number | null;
  trafficLevel?: string;
  roadLength?: number;
  studentCount?: number;
  accessibility?: any;
}

export interface PriorityStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  unscored: number;
  averageScore: number;
}

export const DEFAULT_WEIGHTS: PriorityWeights = {
  condition: 0.30,
  complaints: 0.20,
  population: 0.15,
  traffic: 0.15,
  maintenanceAge: 0.10,
  alternativeDistance: 0.10
};

export const DEFAULT_THRESHOLDS: PriorityThresholds = {
  critical: 80,
  high: 60,
  medium: 40,
  low: 0
};

export const DEFAULT_LIMITS: NormalizationLimits = {
  maxComplaintsCap: 5,
  maxPopulationCap: 5000,
  maxMaintenanceAgeDays: 1095, // 3 years
  maxAlternativeDistanceKm: 5
};

export class PriorityScoringService {
  /**
   * Fetch active config or return defaults
   */
  public static async getActiveConfig(panchayatId?: string): Promise<{
    weights: PriorityWeights;
    thresholds: PriorityThresholds;
    limits: NormalizationLimits;
  }> {
    const doc = (panchayatId ? await PriorityConfig.findOne({ panchayatId }) : null)
      || await PriorityConfig.findOne({ panchayatId: { $exists: false } }).sort({ updatedAt: -1 });
    if (doc) {
      return {
        weights: doc.weights,
        thresholds: doc.thresholds,
        limits: doc.limits
      };
    }
    return {
      weights: DEFAULT_WEIGHTS,
      thresholds: DEFAULT_THRESHOLDS,
      limits: DEFAULT_LIMITS
    };
  }

  /**
   * STEP 1 — Normalization Sub-routines
   */

  public static normalizeCondition(condition?: string): { score: number; raw: string } {
    const c = (condition || '').toLowerCase().trim();
    if (c === 'bad' || c === 'poor' || c === 'needs_maintenance') {
      return { score: 95, raw: condition || 'Bad' };
    }
    if (c === 'average' || c === 'fair' || c === 'under_repair') {
      return { score: 55, raw: condition || 'Average' };
    }
    if (c === 'good' || c === 'operational') {
      return { score: 15, raw: condition || 'Good' };
    }
    return { score: 50, raw: condition || 'Unknown' };
  }

  public static normalizeComplaints(complaintCount: number, maxCap: number): { score: number; raw: number } {
    const raw = Math.max(0, complaintCount || 0);
    const cap = Math.max(1, maxCap || 5);
    const score = Math.min(100, Math.round((raw / cap) * 100));
    return { score, raw };
  }

  public static normalizePopulation(populationServed: number, maxCap: number): { score: number; raw: number } {
    const raw = Math.max(0, populationServed || 0);
    const cap = Math.max(1, maxCap || 5000);
    const score = Math.min(100, Math.round((raw / cap) * 100));
    return { score, raw };
  }

  public static normalizeTraffic(trafficLevel?: string, assetType?: string): { score: number; raw: string } {
    const t = (trafficLevel || '').toLowerCase().trim();
    if (t === 'high') {
      return { score: 90, raw: 'High' };
    }
    if (t === 'medium') {
      return { score: 55, raw: 'Medium' };
    }
    if (t === 'low') {
      return { score: 20, raw: 'Low' };
    }
    // Facilities without explicit road traffic take neutral/utilization weight
    const raw = assetType ? `${assetType} Baseline` : 'Medium (Baseline)';
    return { score: 45, raw };
  }

  public static normalizeMaintenanceAge(
    lastDate?: Date | string | null,
    maxAgeDays = 1095
  ): { score: number; raw: string; daysElapsed: number } {
    if (!lastDate) {
      return {
        score: 60,
        raw: 'No date recorded (Assumed moderate age)',
        daysElapsed: 730
      };
    }

    const d = new Date(lastDate);
    if (isNaN(d.getTime())) {
      return {
        score: 60,
        raw: 'Invalid date (Assumed moderate age)',
        daysElapsed: 730
      };
    }

    const now = Date.now();
    const diffMs = Math.max(0, now - d.getTime());
    const daysElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const score = Math.min(100, Math.round((daysElapsed / maxAgeDays) * 100));

    let rawString = `${daysElapsed} days ago`;
    if (daysElapsed >= 365) {
      rawString = `${(daysElapsed / 365).toFixed(1)} years ago`;
    } else if (daysElapsed >= 30) {
      rawString = `${Math.floor(daysElapsed / 30)} months ago`;
    }

    return { score, raw: rawString, daysElapsed };
  }

  public static normalizeAlternativeDistance(
    distanceKm?: number | null,
    maxDistanceKm = 5
  ): { score: number; raw: string } {
    if (distanceKm == null || isNaN(distanceKm)) {
      return { score: 30, raw: 'Standard rural buffer (~1.5 km)' };
    }
    const dist = Math.max(0, distanceKm);
    const score = Math.min(100, Math.round((dist / maxDistanceKm) * 100));
    return { score, raw: `${dist.toFixed(1)} km` };
  }

  /**
   * STEP 2, 3, 4, 5 — Full Scoring & Explanation
   */
  public static calculate(
    asset: any,
    config: {
      weights: PriorityWeights;
      thresholds: PriorityThresholds;
      limits: NormalizationLimits;
    }
  ): PriorityExplanation {
    const { weights, thresholds, limits } = config;

    // 1. Condition
    const condNorm = this.normalizeCondition(asset.condition);
    const condContrib = Number((condNorm.score * weights.condition).toFixed(2));

    // 2. Complaints
    const compNorm = this.normalizeComplaints(asset.complaintsCount, limits.maxComplaintsCap);
    const compContrib = Number((compNorm.score * weights.complaints).toFixed(2));

    // 3. Population
    const popNorm = this.normalizePopulation(asset.populationServed, limits.maxPopulationCap);
    const popContrib = Number((popNorm.score * weights.population).toFixed(2));

    // 4. Traffic (for Road; or utilization for School/PHC)
    const trafficNorm = this.normalizeTraffic(asset.trafficLevel, asset.type);
    const trafficContrib = Number((trafficNorm.score * weights.traffic).toFixed(2));

    // 5. Maintenance Age
    const ageDate = asset.lastRepairDate || asset.lastMaintenanceDate;
    const ageNorm = this.normalizeMaintenanceAge(ageDate, limits.maxMaintenanceAgeDays);
    const ageContrib = Number((ageNorm.score * weights.maintenanceAge).toFixed(2));

    // 6. Alternative Distance
    let altDist: number | null = null;
    if (typeof asset.alternativeDistanceKm === 'number') {
      altDist = asset.alternativeDistanceKm;
    } else if (typeof asset.accessibility?.distanceToNearestRoadMeters === 'number') {
      altDist = asset.accessibility.distanceToNearestRoadMeters / 1000;
    }
    const altNorm = this.normalizeAlternativeDistance(altDist, limits.maxAlternativeDistanceKm);
    const altContrib = Number((altNorm.score * weights.alternativeDistance).toFixed(2));

    // Sum Total
    const rawTotal = condContrib + compContrib + popContrib + trafficContrib + ageContrib + altContrib;
    const priorityScore = Number(Math.min(100, Math.max(0, rawTotal)).toFixed(2));

    // Classification
    let priorityLevel: PriorityLevel = 'Low';
    if (priorityScore >= thresholds.critical) {
      priorityLevel = 'Critical';
    } else if (priorityScore >= thresholds.high) {
      priorityLevel = 'High';
    } else if (priorityScore >= thresholds.medium) {
      priorityLevel = 'Medium';
    }

    // Determine top 2 driver factors for human-readable explanation
    const factorList = [
      { name: 'Physical Condition', contrib: condContrib, note: `Status: ${condNorm.raw}` },
      { name: 'Citizen Complaints', contrib: compContrib, note: `${compNorm.raw} active reports` },
      { name: 'Population Impact', contrib: popContrib, note: `${popNorm.raw} people served` },
      { name: 'Traffic Demand', contrib: trafficContrib, note: `${trafficNorm.raw}` },
      { name: 'Maintenance Aging', contrib: ageContrib, note: `${ageNorm.raw}` },
      { name: 'Isolation / Distance', contrib: altContrib, note: `${altNorm.raw}` }
    ].sort((a, b) => b.contrib - a.contrib);

    const top1 = factorList[0];
    const top2 = factorList[1];
    const summary = `Priority ${priorityLevel} (${priorityScore}/100) is primarily driven by ${top1.name} (adds ${top1.contrib.toFixed(1)} pts, ${top1.note}) and ${top2.name} (adds ${top2.contrib.toFixed(1)} pts, ${top2.note}).`;

    return {
      priorityScore,
      priorityLevel,
      summary,
      factors: {
        condition: {
          rawValue: condNorm.raw,
          normalizedScore: condNorm.score,
          weight: weights.condition,
          contribution: condContrib,
          description: `Condition rating (${condNorm.raw}) converts to ${condNorm.score}/100 urgency.`
        },
        complaints: {
          rawValue: compNorm.raw,
          normalizedScore: compNorm.score,
          weight: weights.complaints,
          contribution: compContrib,
          description: `${compNorm.raw} complaints against ${limits.maxComplaintsCap} threshold yields ${compNorm.score}/100.`
        },
        population: {
          rawValue: popNorm.raw,
          normalizedScore: popNorm.score,
          weight: weights.population,
          contribution: popContrib,
          description: `${popNorm.raw} citizens served out of ${limits.maxPopulationCap} regional target yields ${popNorm.score}/100.`
        },
        traffic: {
          rawValue: trafficNorm.raw,
          normalizedScore: trafficNorm.score,
          weight: weights.traffic,
          contribution: trafficContrib,
          description: `Traffic/Load volume (${trafficNorm.raw}) rated at ${trafficNorm.score}/100.`
        },
        maintenanceAge: {
          rawValue: ageNorm.raw,
          normalizedScore: ageNorm.score,
          weight: weights.maintenanceAge,
          contribution: ageContrib,
          description: `Time since last repair (${ageNorm.raw}) evaluates to ${ageNorm.score}/100 aging pressure.`
        },
        alternativeDistance: {
          rawValue: altNorm.raw,
          normalizedScore: altNorm.score,
          weight: weights.alternativeDistance,
          contribution: altContrib,
          description: `Distance to alternate facility (${altNorm.raw}) adds ${altNorm.score}/100 isolation factor.`
        }
      },
      weightsUsed: weights,
      thresholdsUsed: thresholds,
      calculatedAt: new Date()
    };
  }

  /**
   * Recalculates and persists priorityScore on all infrastructure records
   */
  public static async recalculateAll(panchayatId?: string): Promise<{ updatedCount: number; averageScore: number }> {
    const query = panchayatId ? { panchayatId } : {};
    const items = await Infrastructure.find(query);
    const configs = panchayatId ? null : await PriorityConfig.find({ panchayatId: { $exists: true } }).lean();
    const globalConfig = await this.getActiveConfig(panchayatId);

    let totalScore = 0;
    let updatedCount = 0;
    for (const item of items) {
      if (item.dataOrigin === 'SOURCE_EXCEL' && item.priorityScorable !== true) continue;
      const configDoc: any = configs?.find((entry: any) => String(entry.panchayatId) === String(item.panchayatId));
      const config = configDoc ? { weights: configDoc.weights, thresholds: configDoc.thresholds, limits: configDoc.limits } : globalConfig;
      const result = this.calculate(item, config);
      item.priorityScore = result.priorityScore;
      await item.save();
      totalScore += result.priorityScore;
      updatedCount++;
    }

    const averageScore = updatedCount > 0 ? Number((totalScore / updatedCount).toFixed(2)) : 0;
    return { updatedCount, averageScore };
  }

  /**
   * Query ranked infrastructure with filtering, pagination, and KPI counts
   */
  public static async getRanked(options: {
    panchayatId?: string;
    type?: string;
    ward?: string;
    level?: PriorityLevel;
    limit?: number;
  }): Promise<{ items: RankedItem[]; stats: PriorityStats }> {
    const configs = options.panchayatId
      ? []
      : await PriorityConfig.find({ panchayatId: { $exists: true } }).lean();
    const defaultConfig = await this.getActiveConfig(options.panchayatId);

    const query: any = {};
    if (options.panchayatId) query.panchayatId = options.panchayatId;
    if (options.type && options.type !== 'All') query.type = options.type;
    if (options.ward && options.ward !== 'All') query.ward = options.ward;

    const rawList = await Infrastructure.find(query).lean();

    // Map each item to full explanation
    const calculated: RankedItem[] = rawList.map((item: any) => {
      const configDoc: any = configs.find((entry: any) => String(entry.panchayatId) === String(item.panchayatId));
      const config = configDoc ? { weights: configDoc.weights, thresholds: configDoc.thresholds, limits: configDoc.limits } : defaultConfig;
      const isUnscored = item.dataOrigin === 'SOURCE_EXCEL' && item.priorityScorable !== true;
      const explanation = isUnscored ? null : this.calculate(item, config);
      return {
        id: String(item._id),
        _id: String(item._id),
        panchayatId: String(item.panchayatId),
        name: item.name,
        type: item.type,
        ward: item.ward,
        village: item.village,
        location: item.location,
        lineGeometry: item.lineGeometry || item.geometry,
        condition: item.condition ?? (isUnscored ? null : 'Average'),
        status: item.status ?? (isUnscored ? null : 'Operational'),
        description: item.description,
        lastMaintenanceDate: item.lastMaintenanceDate || item.lastRepairDate,
        complaintsCount: item.complaintsCount ?? (isUnscored ? null : 0),
        populationServed: item.populationServed ?? (isUnscored ? null : 0),
        priorityScore: explanation?.priorityScore ?? null,
        priorityLevel: explanation?.priorityLevel ?? 'Unavailable',
        scoringStatus: explanation ? 'SCORED' : 'UNAVAILABLE',
        estimatedMaintenanceCost: item.estimatedMaintenanceCost ?? item.estimatedRepairCost ?? (isUnscored ? null : 0),
        estimatedRepairCost: item.estimatedRepairCost ?? item.estimatedMaintenanceCost ?? (isUnscored ? null : 0),
        trafficLevel: item.trafficLevel,
        roadLength: item.roadLength || item.lengthKm,
        studentCount: item.studentCount,
        accessibility: item.accessibility,
        explanation,
        dataOrigin: item.dataOrigin,
        isSynthetic: item.isSynthetic,
        sourceCategory: item.sourceCategory,
        sourceType: item.sourceType,
        sourceStatus: item.sourceStatus,
        sourceReportedQuantity: item.sourceReportedQuantity,
        source: item.source,
        sourceVintage: item.sourceVintage,
        sourceWorkbook: item.sourceWorkbook,
        sourceRow: item.sourceRow,
        verificationRequired: item.verificationRequired,
        verificationNotes: item.verificationNotes,
        coordinatesVerified: item.coordinatesVerified,
        coordinateSource: item.coordinateSource
      };
    });

    // Sort descending by priorityScore
    calculated.sort((a, b) => {
      if (a.scoringStatus !== b.scoringStatus) return a.scoringStatus === 'SCORED' ? -1 : 1;
      return (b.priorityScore ?? -1) - (a.priorityScore ?? -1);
    });

    // Compute KPI stats across the un-sliced set
    const stats: PriorityStats = {
      total: calculated.length,
      unscored: calculated.filter((i) => i.scoringStatus === 'UNAVAILABLE').length,
      critical: calculated.filter((i) => i.priorityLevel === 'Critical').length,
      high: calculated.filter((i) => i.priorityLevel === 'High').length,
      medium: calculated.filter((i) => i.priorityLevel === 'Medium').length,
      low: calculated.filter((i) => i.priorityLevel === 'Low').length,
      averageScore:
        calculated.some((item) => item.scoringStatus === 'SCORED')
          ? Number((calculated.reduce((acc, cur) => acc + (cur.priorityScore ?? 0), 0) / calculated.filter((item) => item.scoringStatus === 'SCORED').length).toFixed(2))
          : 0
    };

    // Filter by level if specified
    let filtered = calculated;
    if (options.level) {
      filtered = filtered.filter((i) => i.priorityLevel === options.level);
    }

    // Apply limit if specified
    if (options.limit && options.limit > 0) {
      filtered = filtered.slice(0, options.limit);
    }

    return { items: filtered, stats };
  }
}
