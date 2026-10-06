import type { PriorityEvidenceFactor } from '../models/PriorityEvidence.js';
import type { PriorityEvidenceReadiness } from './priorityEvidenceReadiness.js';

export type PriorityInfrastructureType = 'Road' | 'School' | 'Healthcare' | 'WaterFacility' | 'Other';
export type PriorityProfileStatus = 'ACTIVE' | 'DRAFT' | 'DEPRECATED';
export type PriorityProfileApprovalStatus = 'APPROVED' | 'PENDING_POLICY_CONFIRMATION';
export type ProfileFactorApplicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNRESOLVED_POLICY';

export interface PriorityScoreBand {
  minInclusive: number;
  maxExclusive: number | null;
  score: number;
}

export type ProfileNormalizer =
  | { kind: 'CATEGORY_MAP'; scores: Record<string, number> }
  | { kind: 'LINEAR_CAP'; maximum: number }
  | { kind: 'DATE_AGE_CAP'; maximumDays: number }
  | { kind: 'RANGE_BANDS'; bands: PriorityScoreBand[] }
  | { kind: 'DATE_AGE_BANDS'; bands: PriorityScoreBand[] }
  | { kind: 'DATE_CALENDAR_AGE_BANDS'; bands: PriorityScoreBand[] };

export interface PriorityProfileFactor {
  applicability: ProfileFactorApplicability;
  semantics: string;
  normalization?: ProfileNormalizer;
  readinessRequirements: string[];
}

export interface PriorityScoringProfile {
  profileId: string;
  profileVersion: string;
  infrastructureType: PriorityInfrastructureType;
  subtype?: string;
  status: PriorityProfileStatus;
  approvalStatus: PriorityProfileApprovalStatus;
  applicableFactors: PriorityEvidenceFactor[];
  factorWeights: Partial<Record<PriorityEvidenceFactor, number>>;
  factorDefinitions: Partial<Record<PriorityEvidenceFactor, PriorityProfileFactor>>;
  thresholds: { critical: number; high: number; medium: number; low: number };
  readinessRequirements: {
    requireAcceptedScope: boolean;
    requireAcceptedEvidence: boolean;
    requireProfileIdentityMatch: boolean;
  };
}

export interface ProfileValidation {
  valid: boolean;
  errors: string[];
}

export interface ProfileResolution {
  profile: PriorityScoringProfile | null;
  status: 'APPROVED' | 'NOT_FOUND' | 'UNRESOLVED_SUBTYPE' | 'INVALID_PROFILE';
}

/** Owner-approved School profile. Other infrastructure profiles remain inactive. */
export const SCHOOL_PRIORITY_V1_PROFILE: PriorityScoringProfile = Object.freeze({
  profileId: 'SCHOOL_PRIORITY_V1',
  profileVersion: '1.0.0',
  infrastructureType: 'School',
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  applicableFactors: ['condition', 'populationServed', 'trafficLevel', 'complaintsCount', 'lastMaintenanceDate', 'alternativeDistanceKm'],
  factorWeights: {
    condition: 0.30,
    populationServed: 0.20,
    trafficLevel: 0.15,
    complaintsCount: 0.15,
    lastMaintenanceDate: 0.10,
    alternativeDistanceKm: 0.10
  },
  factorDefinitions: {
    condition: {
      applicability: 'APPLICABLE',
      semantics: 'Verified physical-condition assessment for the identified school asset; status is not condition.',
      normalization: { kind: 'CATEGORY_MAP', scores: { Good: 15, Average: 40, Needs_Maintenance: 65, Poor: 85, Bad: 100 } },
      readinessRequirements: ['accepted, documented and verified condition evidence']
    },
    populationServed: {
      applicability: 'APPLICABLE',
      semantics: 'Official count of students enrolled/served by this school for the stated academic reference period.',
      normalization: { kind: 'RANGE_BANDS', bands: [
        { minInclusive: 0, maxExclusive: 251, score: 20 },
        { minInclusive: 251, maxExclusive: 501, score: 40 },
        { minInclusive: 501, maxExclusive: 1001, score: 60 },
        { minInclusive: 1001, maxExclusive: 2001, score: 80 },
        { minInclusive: 2001, maxExclusive: null, score: 100 }
      ] },
      readinessRequirements: ['official school-specific enrollment evidence', 'academic reference period', 'whole student count']
    },
    trafficLevel: {
      applicability: 'APPLICABLE',
      semantics: 'Actual fractional enrollment divided by officially sanctioned student capacity for the same or documented compatible academic period, multiplied by 100; do not round before classification.',
      normalization: { kind: 'RANGE_BANDS', bands: [
        { minInclusive: 0, maxExclusive: 50, score: 20 },
        { minInclusive: 50, maxExclusive: 75, score: 40 },
        { minInclusive: 75, maxExclusive: 90, score: 60 },
        { minInclusive: 90, maxExclusive: 100, score: 80 },
        { minInclusive: 100, maxExclusive: null, score: 100 }
      ] },
      readinessRequirements: ['official enrollment and sanctioned-capacity evidence', 'compatible reference periods', 'explicit utilization threshold version']
    },
    complaintsCount: {
      applicability: 'APPLICABLE',
      semantics: 'Verified infrastructure-related complaints about this school within a complete configured reporting period.',
      normalization: { kind: 'RANGE_BANDS', bands: [
        { minInclusive: 0, maxExclusive: 1, score: 0 },
        { minInclusive: 1, maxExclusive: 2, score: 20 },
        { minInclusive: 2, maxExclusive: 3, score: 40 },
        { minInclusive: 3, maxExclusive: 4, score: 60 },
        { minInclusive: 4, maxExclusive: 5, score: 80 },
        { minInclusive: 5, maxExclusive: null, score: 100 }
      ] },
      readinessRequirements: ['distinct school-linked complaint count', 'complete previous-12-month coverage ending on the evidence review date', 'whole complaint count']
    },
    lastMaintenanceDate: {
      applicability: 'APPLICABLE',
      semantics: 'Completion date of the most recent qualifying, evidenced maintenance/repair event for this school asset; age is measured by calendar anniversaries through the evidence review date.',
      normalization: { kind: 'DATE_CALENDAR_AGE_BANDS', bands: [
        { minInclusive: 0, maxExclusive: 1, score: 10 },
        { minInclusive: 1, maxExclusive: 2, score: 30 },
        { minInclusive: 2, maxExclusive: 3, score: 50 },
        { minInclusive: 3, maxExclusive: 5, score: 75 },
        { minInclusive: 5, maxExclusive: null, score: 100 }
      ] },
      readinessRequirements: ['identified qualifying completed work', 'actual completion evidence/date', 'accepted evidence review date']
    },
    alternativeDistanceKm: {
      applicability: 'APPLICABLE',
      semantics: 'Network travel distance to the nearest operational school providing equivalent service, from verified endpoints and a declared comparison inventory.',
      normalization: { kind: 'RANGE_BANDS', bands: [
        { minInclusive: 0, maxExclusive: 1, score: 10 },
        { minInclusive: 1, maxExclusive: 2, score: 30 },
        { minInclusive: 2, maxExclusive: 5, score: 60 },
        { minInclusive: 5, maxExclusive: 10, score: 80 },
        { minInclusive: 10, maxExclusive: null, score: 100 }
      ] },
      readinessRequirements: ['verified school and comparator coordinates', 'equivalent operational school identity', 'versioned network travel method', 'finite non-negative kilometres']
    }
  },
  thresholds: { critical: 80, high: 60, medium: 40, low: 0 },
  readinessRequirements: { requireAcceptedScope: true, requireAcceptedEvidence: true, requireProfileIdentityMatch: true }
} as PriorityScoringProfile);

/** The only active type-specific profile; legacy scoring remains a separate path. */
export const APPROVED_PRIORITY_SCORING_PROFILES: readonly PriorityScoringProfile[] = Object.freeze([
  SCHOOL_PRIORITY_V1_PROFILE
]);

export const SCHOOL_PRIORITY_V1_POLICY = Object.freeze({
  approvalStatus: 'APPROVED' as const,
  thresholdReference: 'SCHOOL_PRIORITY_V1_1.0.0',
  complaintsPeriod: { value: 'PREVIOUS_12_MONTHS_FROM_EVIDENCE_REVIEW_DATE' },
  utilization: {
    bands: [
      { minPercent: 0, maxExclusivePercent: 50, score: 20 },
      { minPercent: 50, maxExclusivePercent: 75, score: 40 },
      { minPercent: 75, maxExclusivePercent: 90, score: 60 },
      { minPercent: 90, maxExclusivePercent: 100, score: 80 },
      { minPercent: 100, maxExclusivePercent: null, score: 100 }
    ],
    roundBeforeClassification: false
  },
  priorityLevels: {
    approved: { critical: 80, high: 60, medium: 40, low: 0 }
  }
});

export function calculateSchoolUtilizationPercent(
  enrollment: unknown,
  sanctionedCapacity: unknown,
  enrollmentPeriod: string,
  capacityPeriod: string,
  compatiblePeriodEvidenceReference?: string
): number | null {
  if (typeof enrollment !== 'number' || !Number.isSafeInteger(enrollment) || enrollment < 0 ||
      typeof sanctionedCapacity !== 'number' || !Number.isSafeInteger(sanctionedCapacity) || sanctionedCapacity <= 0 ||
      typeof enrollmentPeriod !== 'string' || typeof capacityPeriod !== 'string' ||
      !enrollmentPeriod.trim() || !capacityPeriod.trim() ||
      enrollmentPeriod !== capacityPeriod && !compatiblePeriodEvidenceReference?.trim()) return null;
  return (enrollment / sanctionedCapacity) * 100;
}

export function normalizeSchoolUtilization(percent: unknown): number | null {
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0) return null;
  const normalizer = SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.trafficLevel?.normalization;
  return normalizer ? normalizeProfileFactorValue(normalizer, percent, new Date(0)) : null;
}

/** Canonical UTC date interval: the previous calendar year through the review date, inclusive. */
export function schoolComplaintCoveragePeriod(reviewDate: Date): string | null {
  if (!(reviewDate instanceof Date) || !Number.isFinite(reviewDate.getTime())) return null;
  const end = new Date(Date.UTC(reviewDate.getUTCFullYear(), reviewDate.getUTCMonth(), reviewDate.getUTCDate()));
  const start = calendarAnniversary(end, -1);
  const format = (date: Date) => date.toISOString().slice(0, 10);
  return `${format(start)}/${format(end)}`;
}

const FACTORS: readonly PriorityEvidenceFactor[] = [
  'condition', 'complaintsCount', 'populationServed', 'trafficLevel',
  'lastMaintenanceDate', 'alternativeDistanceKm'
];
const INFRASTRUCTURE_TYPES = new Set<PriorityInfrastructureType>(['Road', 'School', 'Healthcare', 'WaterFacility', 'Other']);
const WEIGHT_TOLERANCE = 1e-9;

function validUnitInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateNormalizer(normalizer: ProfileNormalizer | undefined, errors: string[], factor: string): void {
  if (!normalizer) {
    errors.push(`${factor} is applicable but has no normalization definition.`);
    return;
  }
  if (normalizer.kind === 'CATEGORY_MAP') {
    const entries = Object.values(normalizer.scores || {});
    if (!entries.length || entries.some((score) => typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100)) {
      errors.push(`${factor} category map must contain finite scores from 0 to 100.`);
    }
    return;
  }
  if (normalizer.kind === 'RANGE_BANDS' || normalizer.kind === 'DATE_AGE_BANDS' || normalizer.kind === 'DATE_CALENDAR_AGE_BANDS') {
    const bands = normalizer.bands;
    if (!Array.isArray(bands) || bands.length === 0) {
      errors.push(`${factor} bands must be a non-empty range list.`);
      return;
    }
    let expectedMinimum = 0;
    for (const band of bands) {
      if (!Number.isFinite(band.minInclusive) || band.minInclusive !== expectedMinimum ||
          band.maxExclusive !== null && (!Number.isFinite(band.maxExclusive) || band.maxExclusive <= band.minInclusive) ||
          !Number.isFinite(band.score) || band.score < 0 || band.score > 100) {
        errors.push(`${factor} bands must be contiguous from zero with valid 0-to-100 scores.`);
        return;
      }
      if (band.maxExclusive === null && band !== bands[bands.length - 1]) {
        errors.push(`${factor} only the final band may be unbounded.`);
        return;
      }
      if (band.maxExclusive !== null) expectedMinimum = band.maxExclusive;
    }
    if (bands[bands.length - 1].maxExclusive !== null) errors.push(`${factor} bands must cover the unbounded upper range.`);
    return;
  }
  const cap = normalizer.kind === 'LINEAR_CAP' ? normalizer.maximum : normalizer.maximumDays;
  if (!Number.isFinite(cap) || cap <= 0) errors.push(`${factor} normalization cap must be a positive finite number.`);
}

/** Validates active profiles strictly; draft profiles are never scoreable. */
export function validatePriorityScoringProfile(profile: PriorityScoringProfile): ProfileValidation {
  const errors: string[] = [];
  if (!profile.profileId?.trim()) errors.push('profileId is required.');
  if (!profile.profileVersion?.trim()) errors.push('profileVersion is required.');
  if (!INFRASTRUCTURE_TYPES.has(profile.infrastructureType)) errors.push('Infrastructure type is unsupported.');
  if (profile.status !== 'ACTIVE') errors.push('Only ACTIVE profiles can be used for scoring.');
  if (profile.status === 'ACTIVE' && profile.approvalStatus !== 'APPROVED') errors.push('An ACTIVE profile must have explicit final policy approval.');
  if (profile.infrastructureType === 'Other' && !profile.subtype?.trim()) {
    errors.push('Other profiles require a resolved subtype.');
  }
  if (!profile.readinessRequirements?.requireAcceptedScope ||
      !profile.readinessRequirements?.requireAcceptedEvidence ||
      !profile.readinessRequirements?.requireProfileIdentityMatch) {
    errors.push('Active profiles must require accepted scope, evidence, and profile identity matching.');
  }
  if (!Array.isArray(profile.applicableFactors) || profile.applicableFactors.length === 0) {
    errors.push('An active profile must declare at least one applicable factor.');
  }
  if (new Set(profile.applicableFactors || []).size !== (profile.applicableFactors || []).length) {
    errors.push('Applicable factors must be unique.');
  }
  for (const factor of profile.applicableFactors || []) {
    if (!FACTORS.includes(factor)) errors.push(`Unsupported factor ${String(factor)}.`);
    const definition = profile.factorDefinitions?.[factor];
    if (!definition || definition.applicability !== 'APPLICABLE' || !definition.semantics?.trim()) {
      errors.push(`${factor} is missing resolved applicable semantics.`);
    } else {
      validateNormalizer(definition.normalization, errors, factor);
      if (!Array.isArray(definition.readinessRequirements) || !definition.readinessRequirements.length) {
        errors.push(`${factor} must declare readiness requirements.`);
      }
    }
  }
  for (const factor of FACTORS) {
    const definition = profile.factorDefinitions?.[factor];
    if (!definition) errors.push(`${factor} must have an explicit applicability decision.`);
    else if (!definition.semantics?.trim()) errors.push(`${factor} must document its semantics or N/A rationale.`);
    if (definition?.applicability === 'UNRESOLVED_POLICY') errors.push(`${factor} has unresolved policy and cannot be active.`);
    if (definition?.applicability === 'APPLICABLE' && !profile.applicableFactors.includes(factor)) {
      errors.push(`${factor} is marked applicable but omitted from applicableFactors.`);
    }
    if (definition?.applicability === 'NOT_APPLICABLE' && profile.factorWeights[factor] !== undefined) {
      errors.push(`${factor} is not applicable and must not have a weight.`);
    }
  }
  const weightKeys = Object.keys(profile.factorWeights || {}) as PriorityEvidenceFactor[];
  if (weightKeys.some((factor) => !profile.applicableFactors.includes(factor))) {
    errors.push('Weights may be assigned only to declared applicable factors.');
  }
  if (weightKeys.length !== profile.applicableFactors.length || profile.applicableFactors.some((factor) => !validUnitInterval(profile.factorWeights[factor]))) {
    errors.push('Every applicable factor must have one finite non-negative weight.');
  }
  const sum = profile.applicableFactors.reduce((total, factor) => total + (profile.factorWeights[factor] ?? 0), 0);
  if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) errors.push('Applicable factor weights must sum to 1.0.');
  if (!profile.thresholds || ['critical', 'high', 'medium', 'low'].some((key) => {
    const value = profile.thresholds[key as keyof PriorityScoringProfile['thresholds']];
    return !Number.isFinite(value) || value < 0 || value > 100;
  })) errors.push('Profile thresholds must be finite values from 0 to 100.');
  return { valid: errors.length === 0, errors };
}

export function resolvePriorityScoringProfile(
  asset: { type?: string; resolvedSubtype?: string; scopeClass?: string },
  profiles: readonly PriorityScoringProfile[] = APPROVED_PRIORITY_SCORING_PROFILES
): ProfileResolution {
  if (asset.type === 'Other' && (!asset.resolvedSubtype?.trim() || asset.scopeClass !== 'INDIVIDUAL_ASSET')) {
    return { profile: null, status: 'UNRESOLVED_SUBTYPE' };
  }
  const candidates = profiles.filter((profile) => profile.infrastructureType === asset.type &&
    (profile.infrastructureType !== 'Other' || profile.subtype === asset.resolvedSubtype) &&
    (!profile.subtype || profile.subtype === asset.resolvedSubtype));
  if (!candidates.length) return { profile: null, status: 'NOT_FOUND' };
  const specific = asset.resolvedSubtype ? candidates.filter((profile) => profile.subtype === asset.resolvedSubtype) : [];
  const matching = specific.length ? specific : candidates.filter((profile) => !profile.subtype);
  const activeCandidates = matching.filter((profile) => profile.status === 'ACTIVE');
  if (!activeCandidates.length) return { profile: null, status: 'NOT_FOUND' };
  if (activeCandidates.length > 1) return { profile: null, status: 'INVALID_PROFILE' };
  const active = activeCandidates[0];
  const validation = validatePriorityScoringProfile(active);
  if (!validation.valid) return { profile: null, status: 'INVALID_PROFILE' };
  return { profile: active, status: 'APPROVED' };
}

export interface ProfileFactorScore {
  rawValue: string | number;
  normalizedScore: number;
  weight: number;
  contribution: number;
  description: string;
}

export interface TypeSpecificPriorityExplanation {
  priorityScore: number;
  priorityLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  summary: string;
  profileId: string;
  profileVersion: string;
  applicableFactors: PriorityEvidenceFactor[];
  factors: Partial<Record<PriorityEvidenceFactor, ProfileFactorScore>>;
  calculatedAt: Date;
}

/** Shared normalizer used by profile scoring and directly testable with draft policy fixtures. */
export function normalizeProfileFactorValue(
  normalizer: ProfileNormalizer,
  raw: unknown,
  asOfDate: Date
): number | null {
  if (!Number.isFinite(asOfDate.getTime())) return null;
  if (normalizer.kind === 'CATEGORY_MAP') {
    return typeof raw === 'string' && Number.isFinite(normalizer.scores[raw]) ? normalizer.scores[raw] : null;
  }
  if (normalizer.kind === 'LINEAR_CAP') {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null;
    return Math.min(100, Math.round((raw / normalizer.maximum) * 100));
  }
  if (normalizer.kind === 'RANGE_BANDS') {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null;
    return scoreForBand(normalizer.bands, raw);
  }
  if (!(raw instanceof Date) && typeof raw !== 'string' && typeof raw !== 'number') return null;
  if (typeof raw === 'string' && !raw.trim()) return null;
  const eventTime = new Date(raw as string | number | Date).getTime();
  if (!Number.isFinite(eventTime)) return null;
  if (normalizer.kind === 'DATE_AGE_CAP') {
    const ageDays = Math.max(0, Math.floor((asOfDate.getTime() - eventTime) / 86400000));
    return Math.min(100, Math.round((ageDays / normalizer.maximumDays) * 100));
  }
  if (eventTime > asOfDate.getTime()) return null;
  if (normalizer.kind === 'DATE_CALENDAR_AGE_BANDS') {
    return scoreForCalendarAgeBand(normalizer.bands, new Date(eventTime), asOfDate);
  }
  const ageDays = Math.floor((asOfDate.getTime() - eventTime) / 86400000);
  return scoreForBand(normalizer.bands, ageDays);
}

export function calculatePriorityWithProfile(
  profile: PriorityScoringProfile,
  readiness: Pick<PriorityEvidenceReadiness, 'readyForScoring' | 'factors'>,
  asOfDate: Date
): TypeSpecificPriorityExplanation | null {
  if (!validatePriorityScoringProfile(profile).valid || !readiness.readyForScoring || !Number.isFinite(asOfDate.getTime())) return null;
  const factors: Partial<Record<PriorityEvidenceFactor, ProfileFactorScore>> = {};
  let total = 0;
  for (const factor of profile.applicableFactors) {
    const factorReadiness = readiness.factors.find((entry) => entry.factor === factor);
    if (!factorReadiness || factorReadiness.state !== 'READY' || factorReadiness.value === null) return null;
    const raw = factorReadiness.value;
    const definition = profile.factorDefinitions[factor]!;
    const normalizer = definition.normalization!;
    const factorAsOfDate = factor === 'lastMaintenanceDate' && factorReadiness.normalizationDate
      ? new Date(factorReadiness.normalizationDate)
      : factor === 'lastMaintenanceDate' ? null : asOfDate;
    if (!factorAsOfDate) return null;
    const normalizedScore = normalizeProfileFactorValue(normalizer, raw, factorAsOfDate);
    if (normalizedScore === null) return null;
    const weight = profile.factorWeights[factor]!;
    const contribution = Number((normalizedScore * weight).toFixed(4));
    total += contribution;
    factors[factor] = {
      rawValue: raw,
      normalizedScore,
      weight,
      contribution,
      description: definition.semantics
    };
  }
  const priorityScore = Number(Math.min(100, Math.max(0, total)).toFixed(2));
  const priorityLevel = priorityScore >= profile.thresholds.critical ? 'Critical' :
    priorityScore >= profile.thresholds.high ? 'High' :
      priorityScore >= profile.thresholds.medium ? 'Medium' : 'Low';
  return {
    priorityScore, priorityLevel,
    summary: `${profile.infrastructureType} priority ${priorityLevel} (${priorityScore}/100) under ${profile.profileId} v${profile.profileVersion}.`,
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    applicableFactors: [...profile.applicableFactors],
    factors,
    calculatedAt: asOfDate
  };
}

function scoreForBand(bands: PriorityScoreBand[], value: number): number | null {
  const match = bands.find((band) => value >= band.minInclusive && (band.maxExclusive === null || value < band.maxExclusive));
  return match?.score ?? null;
}

function calendarAnniversary(date: Date, years: number): Date {
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

function scoreForCalendarAgeBand(bands: PriorityScoreBand[], eventDate: Date, asOfDate: Date): number | null {
  const matched = bands.find((band) => {
    const start = calendarAnniversary(eventDate, band.minInclusive);
    const end = band.maxExclusive === null ? null : calendarAnniversary(eventDate, band.maxExclusive);
    return asOfDate.getTime() >= start.getTime() && (end === null || asOfDate.getTime() < end.getTime());
  });
  return matched?.score ?? null;
}

export interface ProfileRankable {
  scoringProfile: { profileId: string; profileVersion: string; infrastructureType?: string; status?: string };
  scoringStatus: 'SCORED' | 'UNAVAILABLE';
  priorityScore: number | null;
  profileRank?: number | null;
}

/** Groups before sorting so scores from different profile versions are never interleaved by value. */
export function rankWithinScoringProfiles<T extends ProfileRankable>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = `${item.scoringProfile.profileId}@${item.scoringProfile.profileVersion}|${item.scoringProfile.infrastructureType || ''}`;
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([, group]) => {
    const ordered = group.sort((left, right) => {
      if (left.scoringStatus !== right.scoringStatus) return left.scoringStatus === 'SCORED' ? -1 : 1;
      return (right.priorityScore ?? -1) - (left.priorityScore ?? -1);
    });
    let rank = 0;
    return ordered.map((item) => ({
      ...item,
      profileRank: item.scoringStatus === 'SCORED' ? ++rank : null
    }));
  });
}
