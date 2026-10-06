import { PriorityConfig, PriorityWeights, PriorityThresholds, NormalizationLimits } from '../models/PriorityConfig.js';
import { Infrastructure, Road } from '../models/Infrastructure.js';
import type { InfrastructureDoc, RoadDoc } from '../models/Infrastructure.js';
import { PriorityEvidence } from '../models/PriorityEvidence.js';
import type { PriorityEvidenceDoc } from '../models/PriorityEvidence.js';
import {
  evaluatePriorityEvidenceReadiness,
  evidenceValuesForScoring,
  type PriorityEvidenceReadiness,
  type PriorityEvidenceRecordInput
} from './priorityEvidenceReadiness.js';
import {
  APPROVED_PRIORITY_SCORING_PROFILES,
  calculatePriorityWithProfile,
  rankWithinScoringProfiles,
  resolvePriorityScoringProfile,
  type PriorityScoringProfile,
  type ProfileResolution,
  type TypeSpecificPriorityExplanation
} from './priorityScoringProfiles.js';

export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export type RankedPriorityLevel = PriorityLevel | 'Unavailable';

export type PriorityScoringInputCode =
  | 'condition'
  | 'complaintsCount'
  | 'populationServed'
  | 'trafficLevel'
  | 'lastMaintenanceDate'
  | 'alternativeDistanceKm';

export interface PriorityScoringInputIssue {
  code: PriorityScoringInputCode;
  label: string;
}

export interface PriorityDataQualityWarning {
  code: 'COORDINATES_UNAVAILABLE' | 'APPROXIMATE_COORDINATES' | 'UNVERIFIED_COORDINATES';
  message: string;
}

export interface PriorityCoordinateProvenance {
  source: string | null;
  status: string | null;
  verified: boolean | null;
}

export interface PriorityAvailability {
  eligible: boolean;
  reasonCode: 'SOURCE_DATA_REVIEW_REQUIRED' | 'EVIDENCE_REVIEW_REQUIRED' | 'SCORING_PROFILE_UNAVAILABLE' | null;
  reason: string | null;
  missingScoringInputs: PriorityScoringInputIssue[];
  dataQualityWarnings: PriorityDataQualityWarning[];
  coordinateProvenance: PriorityCoordinateProvenance;
  evidenceReadiness: PriorityEvidenceReadiness;
}

interface PriorityAvailabilityRecord {
  dataOrigin?: string;
  priorityScorable?: boolean;
  priorityScore?: unknown;
  condition?: unknown;
  status?: string | null;
  complaintsCount?: unknown;
  populationServed?: unknown;
  trafficLevel?: unknown;
  lastMaintenanceDate?: unknown;
  lastRepairDate?: unknown;
  alternativeDistanceKm?: unknown;
  accessibility?: { distanceToNearestRoadMeters?: unknown } | null;
  estimatedMaintenanceCost?: unknown;
  lineGeometry?: unknown;
  type?: string;
  location?: { type?: unknown; coordinates?: unknown } | null;
  coordinateSource?: string | null;
  coordinateStatus?: string | null;
  coordinatesVerified?: boolean;
  resolvedSubtype?: string;
  scopeClass?: string;
}

export interface PriorityScoringProfileSummary {
  profileId: string;
  profileVersion: string;
  infrastructureType: string;
  status: 'LEGACY' | 'APPROVED' | 'UNAVAILABLE';
  applicableFactors: string[];
  reason?: string;
}

const LEGACY_SCORING_PROFILE: PriorityScoringProfileSummary = {
  profileId: 'LEGACY_FIXED_SIX_FACTOR',
  profileVersion: '1',
  infrastructureType: 'LEGACY',
  status: 'LEGACY',
  applicableFactors: ['condition', 'complaintsCount', 'populationServed', 'trafficLevel', 'lastMaintenanceDate', 'alternativeDistanceKm']
};

function profileSummary(record: PriorityAvailabilityRecord, resolution: ProfileResolution, legacy: boolean): PriorityScoringProfileSummary {
  if (legacy) return { ...LEGACY_SCORING_PROFILE, infrastructureType: record.type || 'LEGACY' };
  if (resolution.profile) return {
    profileId: resolution.profile.profileId,
    profileVersion: resolution.profile.profileVersion,
    infrastructureType: resolution.profile.infrastructureType,
    status: 'APPROVED',
    applicableFactors: [...resolution.profile.applicableFactors]
  };
  const reasons: Record<ProfileResolution['status'], string> = {
    APPROVED: '',
    NOT_FOUND: 'No active approved scoring profile exists for this infrastructure type/subtype.',
    UNRESOLVED_SUBTYPE: 'Other infrastructure requires a reviewed individual-asset scope and resolved subtype.',
    INVALID_PROFILE: 'The matching scoring profile failed validation and is unavailable.'
  };
  return {
    profileId: '', profileVersion: '', infrastructureType: record.type || 'Unknown',
    status: 'UNAVAILABLE', applicableFactors: [], reason: reasons[resolution.status]
  };
}

const PRIORITY_INPUT_LABELS: Record<PriorityScoringInputCode, string> = {
  condition: 'Condition',
  complaintsCount: 'Complaint count',
  populationServed: 'Population served',
  trafficLevel: 'Traffic / utilization',
  lastMaintenanceDate: 'Last maintenance date',
  alternativeDistanceKm: 'Alternative / accessibility distance'
};

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function hasValidPoint(location: PriorityAvailabilityRecord['location']): boolean {
  const coordinates = location?.coordinates;
  return location?.type === 'Point' && Array.isArray(coordinates) && coordinates.length === 2 &&
    typeof coordinates[0] === 'number' && Number.isFinite(coordinates[0]) && Math.abs(coordinates[0]) <= 180 &&
    typeof coordinates[1] === 'number' && Number.isFinite(coordinates[1]) && Math.abs(coordinates[1]) <= 90;
}

function hasValidDate(value: unknown): boolean {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') return false;
  return Number.isFinite(new Date(value).getTime());
}

function usesLegacyPriorityCompatibility(record: PriorityAvailabilityRecord): boolean {
  if (record.dataOrigin === 'DEMO' || record.dataOrigin === 'LEGACY_DEMO') return true;
  // Older Varthur-era documents may predate dataOrigin. Preserve their existing
  // persisted score baseline, but do not let the schema's zero default qualify.
  return record.dataOrigin == null && typeof record.priorityScore === 'number' &&
    Number.isFinite(record.priorityScore) && record.priorityScore > 0;
}

/** Describes factor evidence, coordinate quality, and current score eligibility. */
export function getPriorityAvailability(
  record: PriorityAvailabilityRecord,
  evidenceReadiness = evaluatePriorityEvidenceReadiness(record),
  profile?: PriorityScoringProfile
): PriorityAvailability {
  const sourceFlagAllowsScoring = record.priorityScorable === true;
  const legacyCompatibility = usesLegacyPriorityCompatibility(record);
  const eligible = legacyCompatibility || (sourceFlagAllowsScoring && Boolean(profile) && evidenceReadiness.readyForScoring);
  const missingCodes: PriorityScoringInputCode[] = [];
  const condition = typeof record.condition === 'string' ? record.condition.trim().toLowerCase() : '';
  if (!['bad', 'poor', 'needs_maintenance', 'average', 'fair', 'under_repair', 'good', 'operational'].includes(condition)) {
    missingCodes.push('condition');
  }
  if (!isFiniteNonNegative(record.complaintsCount)) missingCodes.push('complaintsCount');
  if (!isFiniteNonNegative(record.populationServed)) missingCodes.push('populationServed');
  const traffic = typeof record.trafficLevel === 'string' ? record.trafficLevel.trim().toLowerCase() : '';
  if (!['high', 'medium', 'low'].includes(traffic)) missingCodes.push('trafficLevel');
  if (!hasValidDate(record.lastRepairDate ?? record.lastMaintenanceDate)) missingCodes.push('lastMaintenanceDate');
  const hasAlternativeDistance = isFiniteNonNegative(record.alternativeDistanceKm) ||
    isFiniteNonNegative(record.accessibility?.distanceToNearestRoadMeters);
  if (!hasAlternativeDistance) missingCodes.push('alternativeDistanceKm');

  const pointAvailable = hasValidPoint(record.location);
  const coordinateSource = record.coordinateSource ?? null;
  const coordinateStatus = record.coordinateStatus ?? null;
  const coordinatesVerified = typeof record.coordinatesVerified === 'boolean' ? record.coordinatesVerified : null;
  const dataQualityWarnings: PriorityDataQualityWarning[] = [];
  if (!pointAvailable) {
    dataQualityWarnings.push({ code: 'COORDINATES_UNAVAILABLE', message: 'No valid point coordinates are available.' });
  }
  if (coordinateSource === 'PUBLIC_MAP_APPROXIMATE' || coordinateStatus === 'APPROXIMATE') {
    dataQualityWarnings.push({ code: 'APPROXIMATE_COORDINATES', message: 'Coordinates are approximate and are not field-surveyed.' });
  }
  if (pointAvailable && (coordinatesVerified !== true || coordinateStatus !== 'VERIFIED')) {
    dataQualityWarnings.push({ code: 'UNVERIFIED_COORDINATES', message: 'Coordinates have not been confirmed as verified.' });
  }

  const evidenceReadyCodes = new Set(evidenceReadiness.readyFactors);
  const missingScoringInputs = missingCodes
    .filter((code) => !profile || profile.applicableFactors.includes(code))
    .filter((code) => !evidenceReadyCodes.has(code))
    .map((code) => ({ code, label: PRIORITY_INPUT_LABELS[code] }));

  return {
    eligible,
    reasonCode: eligible ? null : (record.dataOrigin === 'SOURCE_EXCEL' && !sourceFlagAllowsScoring
      ? 'SOURCE_DATA_REVIEW_REQUIRED'
      : sourceFlagAllowsScoring && !profile ? 'SCORING_PROFILE_UNAVAILABLE' : 'EVIDENCE_REVIEW_REQUIRED'),
    reason: eligible ? null : (record.dataOrigin === 'SOURCE_EXCEL' && !sourceFlagAllowsScoring
      ? 'This source record is not marked eligible for priority scoring; review its inputs and provenance before enabling scoring.'
      : sourceFlagAllowsScoring && !profile
        ? 'No active approved type-specific scoring profile is available for this record.'
        : sourceFlagAllowsScoring
        ? 'Accepted factor evidence, a resolved individual-asset scope, and an approved type profile are required before this record can be scored.'
        : 'Reviewed factor evidence, an approved type profile, and explicit scoring eligibility are required before this record can be scored.'),
    missingScoringInputs,
    dataQualityWarnings,
    coordinateProvenance: { source: coordinateSource, status: coordinateStatus, verified: coordinatesVerified },
    evidenceReadiness
  };
}

/** Shared unavailable fields for the list and per-infrastructure response paths. */
export function getUnavailablePriorityFields(
  record: PriorityAvailabilityRecord,
  evidenceReadiness?: PriorityEvidenceReadiness,
  resolution?: ProfileResolution
) {
  const legacy = usesLegacyPriorityCompatibility(record);
  const profileResolution = resolution || resolvePriorityScoringProfile(record, APPROVED_PRIORITY_SCORING_PROFILES);
  const priorityAvailability = getPriorityAvailability(record, evidenceReadiness, profileResolution.profile || undefined);
  return {
    priorityScore: null,
    priorityLevel: 'Unavailable' as const,
    scoringStatus: 'UNAVAILABLE' as const,
    priorityAvailability,
    scoringProfile: profileSummary(record, profileResolution, legacy),
    applicableFactors: legacy ? [...LEGACY_SCORING_PROFILE.applicableFactors] : [...(profileResolution.profile?.applicableFactors || [])],
    factorReadiness: priorityAvailability.evidenceReadiness.factors
  };
}

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
  priorityScorable?: boolean;
  priorityAvailability?: PriorityAvailability;
  missingDataFields?: string[];
  coordinateStatus?: string;
  alternativeDistanceKm?: number | null;
  explanation: PriorityExplanation | TypeSpecificPriorityExplanation | null;
  scoringProfile: PriorityScoringProfileSummary;
  applicableFactors: string[];
  factorReadiness: PriorityEvidenceReadiness['factors'];
  profileRank?: number | null;
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

export interface PriorityProfileStats {
  profileId: string;
  profileVersion: string;
  infrastructureType: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  unscored: number;
  averageScore: number | null;
}

export interface PriorityRankingGroup {
  profileId: string;
  profileVersion: string;
  infrastructureType: string;
  status: 'LEGACY' | 'APPROVED' | 'UNAVAILABLE';
  itemIds: string[];
  rankingComparableWithinGroup: boolean;
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

function evidenceReviewFromDocuments(documents: PriorityEvidenceDoc[]): PriorityEvidenceRecordInput | null {
  if (!documents.length) return null;
  if (documents.length === 1) return documents[0] as unknown as PriorityEvidenceRecordInput;

  // Duplicate review documents are a data-integrity conflict. Flattening their
  // current factors makes duplicate factor evidence fail closed in the evaluator.
  return {
    scopeClass: 'UNRESOLVED',
    scopeVerificationStatus: 'PENDING',
    factors: documents.flatMap((document) => document.factors || []) as unknown as PriorityEvidenceRecordInput['factors']
  };
}

async function getEvidenceByInfrastructureIds(ids: unknown[]): Promise<Map<string, PriorityEvidenceDoc[]>> {
  if (!ids.length) return new Map();
  const documents = await PriorityEvidence.find({ infrastructureId: { $in: ids } }).lean() as unknown as PriorityEvidenceDoc[];
  const grouped = new Map<string, PriorityEvidenceDoc[]>();
  for (const document of documents) {
    const key = String(document.infrastructureId);
    const records = grouped.get(key) || [];
    records.push(document);
    grouped.set(key, records);
  }
  return grouped;
}

function readinessForAsset(
  asset: PriorityAvailabilityRecord,
  evidenceDocuments: PriorityEvidenceDoc[] = [],
  profile?: PriorityScoringProfile
): PriorityEvidenceReadiness {
  return evaluatePriorityEvidenceReadiness(asset, evidenceReviewFromDocuments(evidenceDocuments), profile);
}

function profileResolutionForAsset(asset: PriorityAvailabilityRecord, review: PriorityEvidenceRecordInput | null): ProfileResolution {
  return resolvePriorityScoringProfile({
    type: asset.type,
    resolvedSubtype: review?.resolvedSubtype,
    scopeClass: review?.scopeClass
  }, APPROVED_PRIORITY_SCORING_PROFILES);
}

function applyEvidenceValues<T extends Record<string, any>>(
  asset: T,
  readiness: PriorityEvidenceReadiness
): T {
  const values = evidenceValuesForScoring(readiness);
  return {
    ...asset,
    ...values,
    // The legacy scorer gives lastRepairDate precedence. Evidence is mapped to
    // the approved maintenance-age input, so prevent an older/raw repair field
    // from shadowing the accepted evidence value.
    ...(values.lastMaintenanceDate ? { lastRepairDate: undefined } : {})
  };
}

export class PriorityScoringService {
  public static usesLegacyPriorityCompatibility(record: PriorityAvailabilityRecord): boolean {
    return usesLegacyPriorityCompatibility(record);
  }

  public static async getEvidenceReadiness(asset: InfrastructureDoc): Promise<PriorityEvidenceReadiness> {
    const documents = await PriorityEvidence.find({ infrastructureId: asset._id }).lean() as unknown as PriorityEvidenceDoc[];
    const review = evidenceReviewFromDocuments(documents);
    const resolution = profileResolutionForAsset(asset, review);
    return readinessForAsset(asset, documents, resolution.profile || undefined);
  }

  /** Read-only evaluation used by the individual priority endpoint. */
  public static async getAssetPriorityResult(asset: InfrastructureDoc): Promise<{
    scoringStatus: 'SCORED' | 'UNAVAILABLE';
    priorityScore: number | null;
    priorityLevel: RankedPriorityLevel;
    explanation: PriorityExplanation | TypeSpecificPriorityExplanation | null;
    scoringProfile: PriorityScoringProfileSummary;
    applicableFactors: string[];
    factorReadiness: PriorityEvidenceReadiness['factors'];
    priorityAvailability: PriorityAvailability;
  }> {
    const documents = await PriorityEvidence.find({ infrastructureId: asset._id }).lean() as unknown as PriorityEvidenceDoc[];
    const review = evidenceReviewFromDocuments(documents);
    const resolution = profileResolutionForAsset(asset, review);
    const profile = resolution.profile || undefined;
    const legacy = usesLegacyPriorityCompatibility(asset);
    const readiness = readinessForAsset(asset, documents, profile);
    const availability = getPriorityAvailability(asset, readiness, profile);
    const scoringProfile = profileSummary(asset, resolution, legacy);
    const applicableFactors = legacy ? [...LEGACY_SCORING_PROFILE.applicableFactors] : [...(profile?.applicableFactors || [])];
    if (!availability.eligible) return {
      scoringStatus: 'UNAVAILABLE', priorityScore: null, priorityLevel: 'Unavailable', explanation: null,
      scoringProfile, applicableFactors, factorReadiness: readiness.factors, priorityAvailability: availability
    };

    const explanation = legacy
      ? this.calculate(asset, await this.getActiveConfig(String(asset.panchayatId)))
      : profile
        ? calculatePriorityWithProfile(profile, readiness, new Date())
        : null;
    if (!explanation) return {
      scoringStatus: 'UNAVAILABLE', priorityScore: null, priorityLevel: 'Unavailable', explanation: null,
      scoringProfile: { ...scoringProfile, status: 'UNAVAILABLE', reason: 'The resolved profile could not calculate a complete score.' },
      applicableFactors, factorReadiness: readiness.factors,
      priorityAvailability: { ...availability, eligible: false, reasonCode: 'EVIDENCE_REVIEW_REQUIRED', reason: 'Accepted evidence does not produce every profile-required normalized factor.' }
    };
    return {
      scoringStatus: 'SCORED', priorityScore: explanation.priorityScore, priorityLevel: explanation.priorityLevel,
      explanation, scoringProfile, applicableFactors, factorReadiness: readiness.factors, priorityAvailability: availability
    };
  }

  public static applyAcceptedEvidence(asset: Record<string, any>, readiness: PriorityEvidenceReadiness): Record<string, any> {
    return applyEvidenceValues(asset, readiness);
  }

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
    const evidenceById = await getEvidenceByInfrastructureIds(items.map((item) => item._id));

    let totalScore = 0;
    let updatedCount = 0;
    for (const item of items) {
      const readiness = readinessForAsset(item, evidenceById.get(String(item._id)) || []);
      if (!getPriorityAvailability(item, readiness).eligible) continue;
      const configDoc: any = configs?.find((entry: any) => String(entry.panchayatId) === String(item.panchayatId));
      const config = configDoc ? { weights: configDoc.weights, thresholds: configDoc.thresholds, limits: configDoc.limits } : globalConfig;
      const scoreInput = usesLegacyPriorityCompatibility(item)
        ? item
        : applyEvidenceValues(item.toObject(), readiness);
      const result = this.calculate(scoreInput, config);
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
  }): Promise<{ items: RankedItem[]; stats: PriorityStats; statsByProfile: PriorityProfileStats[]; rankingGroups: PriorityRankingGroup[]; rankingComparable: boolean }> {
    const configs = options.panchayatId
      ? []
      : await PriorityConfig.find({ panchayatId: { $exists: true } }).lean();
    const defaultConfig = await this.getActiveConfig(options.panchayatId);

    const query: any = {};
    if (options.panchayatId) query.panchayatId = options.panchayatId;
    if (options.type && options.type !== 'All') query.type = options.type;
    if (options.ward && options.ward !== 'All') query.ward = options.ward;

    const rawList = await Infrastructure.find(query).lean();
    const evidenceById = await getEvidenceByInfrastructureIds(rawList.map((item: any) => item._id));

    // Map each item to full explanation
    const calculated: RankedItem[] = rawList.map((item: any) => {
      const configDoc: any = configs.find((entry: any) => String(entry.panchayatId) === String(item.panchayatId));
      const config = configDoc ? { weights: configDoc.weights, thresholds: configDoc.thresholds, limits: configDoc.limits } : defaultConfig;
      const evidenceDocuments = evidenceById.get(String(item._id)) || [];
      const review = evidenceReviewFromDocuments(evidenceDocuments);
      const resolution = profileResolutionForAsset(item, review);
      const profile = resolution.profile || undefined;
      const evidenceReadiness = readinessForAsset(item, evidenceDocuments, profile);
      const unavailableFields = getUnavailablePriorityFields(item, evidenceReadiness, resolution);
      const isUnscored = !unavailableFields.priorityAvailability.eligible;
      const legacy = usesLegacyPriorityCompatibility(item);
      const scoreInput = legacy ? item : applyEvidenceValues(item, evidenceReadiness);
      const explanation = isUnscored ? null : legacy
        ? this.calculate(scoreInput, config)
        : profile ? calculatePriorityWithProfile(profile, evidenceReadiness, new Date()) : null;
      const safelyUnavailable = !explanation;
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
        ...unavailableFields,
        priorityScore: explanation?.priorityScore ?? null,
        priorityLevel: explanation?.priorityLevel ?? 'Unavailable',
        scoringStatus: explanation ? 'SCORED' : 'UNAVAILABLE',
        ...(safelyUnavailable && !isUnscored ? {
          priorityAvailability: {
            ...unavailableFields.priorityAvailability,
            eligible: false,
            reasonCode: 'EVIDENCE_REVIEW_REQUIRED' as const,
            reason: 'Accepted evidence does not produce every profile-required normalized factor.'
          }
        } : {}),
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
        coordinateSource: item.coordinateSource,
        coordinateStatus: item.coordinateStatus,
        priorityScorable: item.priorityScorable,
        missingDataFields: item.missingDataFields || [],
        alternativeDistanceKm: item.alternativeDistanceKm
      };
    });

    // Scores are ordered only inside one profile/version. Different profile
    // groups are ordered by identity, never by their numeric score.
    const ranked = rankWithinScoringProfiles<RankedItem>(calculated);
    const scoredProfileKey = (item: RankedItem) => `${item.scoringProfile.profileId}@${item.scoringProfile.profileVersion}|${item.scoringProfile.infrastructureType}`;
    const scoredKeys = [...new Set(ranked.filter((item) => item.scoringStatus === 'SCORED').map(scoredProfileKey))];
    const rankingComparable = scoredKeys.length <= 1;

    const groups = new Map<string, RankedItem[]>();
    for (const item of ranked) {
      const key = `${item.scoringProfile.profileId}@${item.scoringProfile.profileVersion}|${item.scoringProfile.infrastructureType}|${item.scoringProfile.status}`;
      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    }
    const rankingGroups: PriorityRankingGroup[] = [...groups.values()].map((group) => ({
      profileId: group[0].scoringProfile.profileId,
      profileVersion: group[0].scoringProfile.profileVersion,
      infrastructureType: group[0].scoringProfile.infrastructureType,
      status: group[0].scoringProfile.status,
      itemIds: group.map((item) => item.id),
      rankingComparableWithinGroup: group.filter((item) => item.scoringStatus === 'SCORED').length > 0
    }));

    const statsByProfile: PriorityProfileStats[] = [...groups.values()].map((group) => {
      const scored = group.filter((item) => item.scoringStatus === 'SCORED');
      return {
        profileId: group[0].scoringProfile.profileId,
        profileVersion: group[0].scoringProfile.profileVersion,
        infrastructureType: group[0].scoringProfile.infrastructureType,
        total: group.length,
        unscored: group.length - scored.length,
        critical: scored.filter((item) => item.priorityLevel === 'Critical').length,
        high: scored.filter((item) => item.priorityLevel === 'High').length,
        medium: scored.filter((item) => item.priorityLevel === 'Medium').length,
        low: scored.filter((item) => item.priorityLevel === 'Low').length,
        averageScore: scored.length ? Number((scored.reduce((sum, item) => sum + (item.priorityScore || 0), 0) / scored.length).toFixed(2)) : null
      };
    });

    // Compute KPI stats across the un-sliced set
    const stats: PriorityStats = {
      total: ranked.length,
      unscored: ranked.filter((i) => i.scoringStatus === 'UNAVAILABLE').length,
      critical: ranked.filter((i) => i.priorityLevel === 'Critical').length,
      high: ranked.filter((i) => i.priorityLevel === 'High').length,
      medium: ranked.filter((i) => i.priorityLevel === 'Medium').length,
      low: ranked.filter((i) => i.priorityLevel === 'Low').length,
      averageScore: ranked.some((item) => item.scoringStatus === 'SCORED')
        ? Number((ranked.reduce((acc, cur) => acc + (cur.priorityScore ?? 0), 0) / ranked.filter((item) => item.scoringStatus === 'SCORED').length).toFixed(2))
        : 0
    };

    // Filter by level if specified
    let filtered = ranked;
    if (options.level) {
      filtered = filtered.filter((i) => i.priorityLevel === options.level);
    }

    // Apply limit if specified
    if (options.limit && options.limit > 0) {
      filtered = filtered.slice(0, options.limit);
    }

    return { items: filtered, stats, statsByProfile, rankingGroups, rankingComparable };
  }
}
