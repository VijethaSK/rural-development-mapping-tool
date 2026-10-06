import type {
  PriorityEvidenceApplicability,
  PriorityEvidenceConfidence,
  PriorityEvidenceDerivation,
  PriorityEvidenceFactor,
  PriorityEvidenceScopeClass,
  PriorityEvidenceVerificationStatus
} from '../models/PriorityEvidence.js';
import type { PriorityScoringProfile } from './priorityScoringProfiles.js';
import {
  calculateSchoolUtilizationPercent,
  normalizeSchoolUtilization,
  SCHOOL_PRIORITY_V1_POLICY,
  schoolComplaintCoveragePeriod,
  validatePriorityScoringProfile
} from './priorityScoringProfiles.js';

export type PriorityFactorState =
  | 'APPLICABLE_MISSING'
  | 'READY'
  | 'PENDING_VERIFICATION'
  | 'REJECTED'
  | 'NOT_APPLICABLE'
  | 'UNRESOLVED';

export type PriorityRecordScopeState =
  | 'INDIVIDUAL_ASSET'
  | 'AGGREGATE_OR_NETWORK'
  | 'SERVICE_ADMINISTRATIVE'
  | 'UNRESOLVED'
  | 'LACKING_SUBTYPE_OR_ASSET_SCOPE';

export interface PriorityEvidenceInput {
  factor: PriorityEvidenceFactor;
  value?: unknown;
  unit?: string;
  applicability?: PriorityEvidenceApplicability;
  sourceName?: string;
  sourceRecordReference?: string;
  sourceUrl?: string;
  observedAt?: unknown;
  referencePeriod?: string;
  derivationKind?: PriorityEvidenceDerivation;
  derivationMethod?: string;
  confidence?: PriorityEvidenceConfidence;
  verificationStatus?: PriorityEvidenceVerificationStatus;
  reviewedBy?: unknown;
  reviewedAt?: unknown;
  current?: boolean;
  complaintCoverage?: {
    reportingPeriod?: string;
    coveredChannels?: string;
    coverageConfirmed?: boolean;
    includedStatuses?: string;
  };
  utilizationMeasurement?: {
    observedValue?: unknown;
    unit?: string;
    denominator?: unknown;
    denominatorUnit?: string;
    thresholdReference?: string;
    numeratorReferencePeriod?: string;
    denominatorReferencePeriod?: string;
    compatiblePeriodEvidenceReference?: string;
  };
  maintenanceEvidence?: {
    qualifyingWorkType?: string;
    actualCompletionConfirmed?: boolean;
    completionEvidenceReference?: string;
  };
  geospatialEvidence?: {
    assetCoordinatesVerified?: boolean;
    alternativeCoordinatesVerified?: boolean;
    alternativeReference?: string;
    distanceMethod?: string;
    distanceMetric?: 'NETWORK_TRAVEL' | 'STRAIGHT_LINE';
    providerName?: string;
    providerVersion?: string;
  };
}

export interface PriorityEvidenceRecordInput {
  sourceKey?: string;
  scopeClass?: PriorityEvidenceScopeClass;
  scopeVerificationStatus?: PriorityEvidenceVerificationStatus;
  resolvedSubtype?: string;
  policyProfileId?: string;
  policyProfileVersion?: string;
  policyProfileStatus?: PriorityEvidenceVerificationStatus;
  policyProfileReviewedBy?: unknown;
  policyProfileReviewedAt?: unknown;
  reviewedBy?: unknown;
  reviewedAt?: unknown;
  factors?: PriorityEvidenceInput[];
}

export interface PriorityEvidenceAssetInput {
  dataOrigin?: string;
  sourceKey?: string;
  type?: string;
  condition?: unknown;
  complaintsCount?: unknown;
  populationServed?: unknown;
  trafficLevel?: unknown;
  lastRepairDate?: unknown;
  lastMaintenanceDate?: unknown;
  alternativeDistanceKm?: unknown;
  coordinateStatus?: unknown;
  coordinateSource?: unknown;
  coordinatesVerified?: unknown;
}

export interface PublicEvidenceProvenance {
  sourceName: string;
  sourceRecordReference: string;
  sourceUrl: string | null;
  observedAt: string | null;
  referencePeriod: string | null;
  derivationKind: PriorityEvidenceDerivation | null;
  derivationMethod: string | null;
  confidence: PriorityEvidenceConfidence | null;
  verificationStatus: PriorityEvidenceVerificationStatus | null;
}

export interface PriorityFactorReadiness {
  factor: PriorityEvidenceFactor;
  state: PriorityFactorState;
  value: string | number | null;
  unit: string | null;
  /** For calendar-age normalization, the accepted evidence review date. */
  normalizationDate?: string | null;
  reason: string;
  provenance: PublicEvidenceProvenance | null;
}

export interface PriorityEvidenceReadiness {
  readyForScoring: boolean;
  status: 'READY' | 'INCOMPLETE' | 'PENDING_REVIEW' | 'REJECTED' | 'UNRESOLVED' | 'PROFILE_UNAVAILABLE' | 'AGGREGATE_OR_NETWORK' | 'SERVICE_ADMINISTRATIVE' | 'LACKING_SUBTYPE_OR_ASSET_SCOPE';
  recordScope: PriorityRecordScopeState;
  scopeResolved: boolean;
  profileResolved: boolean;
  policyProfileId: string | null;
  policyProfileStatus: PriorityEvidenceVerificationStatus | null;
  factors: PriorityFactorReadiness[];
  missingFactors: PriorityEvidenceFactor[];
  pendingFactors: PriorityEvidenceFactor[];
  rejectedFactors: PriorityEvidenceFactor[];
  notApplicableFactors: PriorityEvidenceFactor[];
  unresolvedFactors: PriorityEvidenceFactor[];
  readyFactors: PriorityEvidenceFactor[];
}

export const PRIORITY_EVIDENCE_FACTOR_ORDER: PriorityEvidenceFactor[] = [
  'condition', 'complaintsCount', 'populationServed', 'trafficLevel', 'lastMaintenanceDate', 'alternativeDistanceKm'
];

const EXPECTED_UNITS: Record<PriorityEvidenceFactor, string> = {
  condition: 'category',
  complaintsCount: 'complaints',
  populationServed: 'persons',
  trafficLevel: 'ordinal',
  lastMaintenanceDate: 'date',
  alternativeDistanceKm: 'km'
};

const VALID_CONDITION = new Set(['Good', 'Average', 'Needs_Maintenance', 'Poor', 'Bad']);
const VALID_TRAFFIC = new Set(['Low', 'Medium', 'High']);
const SUPPORTED_INFRASTRUCTURE_TYPES = new Set(['Road', 'School', 'Healthcare', 'WaterFacility', 'Other']);

function validDate(value: unknown): value is Date | string | number {
  return (value instanceof Date || typeof value === 'string' || typeof value === 'number') &&
    Number.isFinite(new Date(value).getTime());
}

function validValue(factor: PriorityEvidenceFactor, value: unknown, profile?: PriorityScoringProfile): value is string | number | Date {
  switch (factor) {
    case 'condition': return typeof value === 'string' && VALID_CONDITION.has(value);
    case 'trafficLevel': return profile?.profileId === 'SCHOOL_PRIORITY_V1'
      ? typeof value === 'number' && Number.isFinite(value) && value >= 0
      : typeof value === 'string' && VALID_TRAFFIC.has(value);
    case 'complaintsCount':
    case 'populationServed':
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    case 'alternativeDistanceKm':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0;
    case 'lastMaintenanceDate': return validDate(value);
  }
}

function coordinateIsVerified(asset: PriorityEvidenceAssetInput): boolean {
  return asset.coordinatesVerified === true && asset.coordinateStatus === 'VERIFIED' &&
    asset.coordinateSource !== 'PUBLIC_MAP_APPROXIMATE' && asset.coordinateSource !== 'UNAVAILABLE';
}

function safeSourceUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function provenanceFor(evidence: PriorityEvidenceInput): PublicEvidenceProvenance {
  return {
    sourceName: evidence.sourceName || '',
    sourceRecordReference: evidence.sourceRecordReference || '',
    sourceUrl: safeSourceUrl(evidence.sourceUrl),
    observedAt: validDate(evidence.observedAt) ? new Date(evidence.observedAt).toISOString() : null,
    referencePeriod: evidence.referencePeriod || null,
    derivationKind: evidence.derivationKind || null,
    derivationMethod: evidence.derivationMethod || null,
    confidence: evidence.confidence || null,
    verificationStatus: evidence.verificationStatus || null
  };
}

function evaluateFactor(
  factor: PriorityEvidenceFactor,
  evidenceRows: PriorityEvidenceInput[],
  asset: PriorityEvidenceAssetInput,
  allowResolvedOtherProfile: boolean,
  profile?: PriorityScoringProfile
): PriorityFactorReadiness {
  const active = evidenceRows.filter((evidence) => evidence.factor === factor && evidence.current !== false);
  const base: PriorityFactorReadiness = {
    factor, state: 'APPLICABLE_MISSING', value: null, unit: null,
    reason: 'Applicable factor has no current evidence.', provenance: null
  };

  if (!SUPPORTED_INFRASTRUCTURE_TYPES.has(asset.type || '')) {
    return { ...base, state: 'UNRESOLVED', reason: 'Infrastructure type has no approved priority evidence profile.' };
  }
  if (asset.type === 'Other' && !allowResolvedOtherProfile) {
    return { ...base, state: 'UNRESOLVED', reason: 'The Other subtype and its approved factor profile have not been resolved.' };
  }
  if (!active.length) return base;
  if (active.length > 1) {
    return { ...base, state: 'UNRESOLVED', reason: 'Multiple current evidence entries exist for this factor.' };
  }

  const evidence = active[0];
  const provenance = provenanceFor(evidence);
  if (evidence.applicability === 'NOT_APPLICABLE') {
    return { ...base, state: 'NOT_APPLICABLE', unit: evidence.unit || null, reason: 'Factor was reviewed as not applicable; the fixed six-factor formula has no approved omission rule.', provenance };
  }
  if (evidence.applicability !== 'APPLICABLE') {
    return { ...base, state: 'UNRESOLVED', reason: 'Factor applicability has not been approved for this record.', provenance };
  }
  if (evidence.verificationStatus === 'PENDING') {
    return { ...base, state: 'PENDING_VERIFICATION', unit: evidence.unit || null, reason: 'Evidence is awaiting review.', provenance };
  }
  if (evidence.verificationStatus === 'REJECTED') {
    return { ...base, state: 'REJECTED', unit: evidence.unit || null, reason: 'Evidence was rejected during review.', provenance };
  }
  if (evidence.verificationStatus !== 'ACCEPTED') {
    return { ...base, state: 'UNRESOLVED', reason: 'Evidence has no accepted review status.', provenance };
  }
  if (evidence.derivationKind === 'CALCULATED' && !evidence.derivationMethod?.trim()) {
    return { ...base, state: 'APPLICABLE_MISSING', reason: 'Calculated evidence is missing its reproducible method.', provenance };
  }
  if (!evidence.sourceName?.trim() || !evidence.sourceRecordReference?.trim() || !validDate(evidence.observedAt)) {
    return { ...base, state: 'APPLICABLE_MISSING', reason: 'Accepted evidence is missing its source reference or observation date.', provenance };
  }
  if (!evidence.reviewedBy || !validDate(evidence.reviewedAt)) {
    return { ...base, state: 'APPLICABLE_MISSING', reason: 'Accepted evidence is missing its reviewer or review date.', provenance };
  }
  const schoolProfile = profile?.profileId === 'SCHOOL_PRIORITY_V1';
  const expectedUnit = schoolProfile && factor === 'trafficLevel'
    ? 'percent'
    : schoolProfile && factor === 'populationServed'
      ? 'students'
      : EXPECTED_UNITS[factor];
  if (evidence.unit?.trim().toLowerCase() !== expectedUnit) {
    return { ...base, state: 'APPLICABLE_MISSING', reason: `Evidence must use the policy unit '${expectedUnit}'.`, provenance };
  }
  if (!validValue(factor, evidence.value, profile)) {
    return { ...base, state: 'APPLICABLE_MISSING', unit: evidence.unit || null, reason: 'Evidence value is missing or invalid for this factor.', provenance };
  }
  if (factor === 'complaintsCount') {
    const coverage = evidence.complaintCoverage;
    if (!coverage?.coverageConfirmed || !coverage.reportingPeriod?.trim() || !coverage.coveredChannels?.trim() ||
        evidence.referencePeriod?.trim() !== coverage.reportingPeriod.trim()) {
      return { ...base, state: 'APPLICABLE_MISSING', unit: evidence.unit || null, reason: 'Complaint evidence requires a confirmed reporting period and channel-coverage declaration.', provenance };
    }
    if (profile?.profileId === 'SCHOOL_PRIORITY_V1' &&
        coverage.reportingPeriod.trim() !== schoolComplaintCoveragePeriod(new Date(evidence.reviewedAt as Date | string | number))) {
      return { ...base, state: 'APPLICABLE_MISSING', unit: evidence.unit || null, reason: 'School complaints must cover the previous 12 calendar months ending on the evidence review date.', provenance };
    }
  }
  if (factor === 'populationServed' && !evidence.referencePeriod?.trim()) {
    return { ...base, state: 'APPLICABLE_MISSING', unit: evidence.unit || null, reason: 'Population evidence requires a reference year or period.', provenance };
  }
  if (factor === 'trafficLevel') {
    const measure = evidence.utilizationMeasurement;
    if (!evidence.referencePeriod?.trim() || !measure ||
        typeof measure.observedValue !== 'number' || !Number.isFinite(measure.observedValue) || measure.observedValue < 0 ||
        typeof measure.denominator !== 'number' || !Number.isFinite(measure.denominator) || measure.denominator <= 0 ||
        !measure.unit?.trim() || !measure.denominatorUnit?.trim() || !measure.thresholdReference?.trim()) {
      return { ...base, state: 'APPLICABLE_MISSING', unit: evidence.unit || null, reason: 'Traffic/utilization evidence requires a dated raw measure, denominator, and approved threshold reference.', provenance };
    }
    if (profile?.profileId === 'SCHOOL_PRIORITY_V1') {
      const utilizationPercent = calculateSchoolUtilizationPercent(
        measure.observedValue,
        measure.denominator,
        measure.numeratorReferencePeriod || '',
        measure.denominatorReferencePeriod || '',
        measure.compatiblePeriodEvidenceReference
      );
      const normalized = utilizationPercent === null ? null : normalizeSchoolUtilization(utilizationPercent);
      if (normalized === null || evidence.value !== utilizationPercent || measure.unit.toLowerCase() !== 'students' ||
          measure.denominatorUnit.toLowerCase() !== 'sanctioned_student_capacity' ||
          evidence.referencePeriod?.trim() !== measure.numeratorReferencePeriod?.trim() ||
          measure.thresholdReference !== SCHOOL_PRIORITY_V1_POLICY.thresholdReference) {
        return { ...base, state: 'APPLICABLE_MISSING', unit: evidence.unit || null, reason: 'School utilization must match the configured enrollment/capacity calculation, period evidence, and threshold version.', provenance };
      }
      return {
        factor, state: 'READY', value: utilizationPercent, unit: 'percent',
        reason: 'Accepted School enrollment and sanctioned capacity produce utilization under the configured School V1 bands.', provenance
      };
    }
  }
  if (factor === 'lastMaintenanceDate') {
    const maintenance = evidence.maintenanceEvidence;
    if (!maintenance?.actualCompletionConfirmed || !maintenance.qualifyingWorkType?.trim() ||
        !maintenance.completionEvidenceReference?.trim() || new Date(evidence.value).getTime() > new Date(evidence.observedAt as string | number | Date).getTime()) {
      return { ...base, state: 'APPLICABLE_MISSING', unit: evidence.unit || null, reason: 'Maintenance evidence must identify qualifying completed work and its actual completion record/date.', provenance };
    }
    if (profile?.profileId === 'SCHOOL_PRIORITY_V1' && !validDate(evidence.reviewedAt)) {
      return { ...base, state: 'APPLICABLE_MISSING', unit: evidence.unit || null, reason: 'School maintenance age requires the accepted evidence review date.', provenance };
    }
  }
  if (factor === 'alternativeDistanceKm') {
    const geo = evidence.geospatialEvidence;
    if (!coordinateIsVerified(asset) || geo?.assetCoordinatesVerified !== true ||
        geo.alternativeCoordinatesVerified !== true || !geo.alternativeReference?.trim() || !geo.distanceMethod?.trim() ||
        geo.distanceMetric !== 'NETWORK_TRAVEL' || !geo.providerName?.trim() || !geo.providerVersion?.trim()) {
      return { ...base, state: 'APPLICABLE_MISSING', unit: evidence.unit || null, reason: 'Distance evidence requires verified coordinates, an identified alternative, and a versioned network-routing method.', provenance };
    }
  }

  return {
    factor,
    state: 'READY',
    value: evidence.value instanceof Date ? evidence.value.toISOString() : evidence.value as string | number,
    unit: evidence.unit || null,
    ...(factor === 'lastMaintenanceDate' && validDate(evidence.reviewedAt)
      ? { normalizationDate: new Date(evidence.reviewedAt).toISOString() }
      : {}),
    reason: 'Accepted, valid evidence satisfies the factor requirements.',
    provenance
  };
}

function scopeState(
  asset: PriorityEvidenceAssetInput,
  review?: PriorityEvidenceRecordInput | null,
  profile?: PriorityScoringProfile
): {
  state: PriorityRecordScopeState;
  resolved: boolean;
} {
  if (!SUPPORTED_INFRASTRUCTURE_TYPES.has(asset.type || '')) {
    return { state: 'LACKING_SUBTYPE_OR_ASSET_SCOPE', resolved: false };
  }
  if (!review) {
    return { state: asset.type === 'Other' ? 'LACKING_SUBTYPE_OR_ASSET_SCOPE' : 'UNRESOLVED', resolved: false };
  }
  if (asset.dataOrigin === 'SOURCE_EXCEL' &&
      (!asset.sourceKey || !review.sourceKey || asset.sourceKey !== review.sourceKey)) {
    return { state: 'UNRESOLVED', resolved: false };
  }
  const scopeWasReviewed = review.scopeVerificationStatus === 'ACCEPTED' &&
    Boolean(review.reviewedBy) && validDate(review.reviewedAt);
  if (review.scopeClass === 'AGGREGATE_OR_NETWORK' && scopeWasReviewed) {
    return { state: 'AGGREGATE_OR_NETWORK', resolved: false };
  }
  if (review.scopeClass === 'SERVICE_ADMINISTRATIVE' && scopeWasReviewed) {
    return { state: 'SERVICE_ADMINISTRATIVE', resolved: false };
  }
  if (review.scopeClass !== 'INDIVIDUAL_ASSET' || !scopeWasReviewed) {
    return { state: asset.type === 'Other' && !review.resolvedSubtype ? 'LACKING_SUBTYPE_OR_ASSET_SCOPE' : 'UNRESOLVED', resolved: false };
  }
  if (!review.resolvedSubtype?.trim()) {
    return { state: 'LACKING_SUBTYPE_OR_ASSET_SCOPE', resolved: false };
  }
  if (review.policyProfileStatus !== 'ACCEPTED' || !review.policyProfileId?.trim() ||
      !review.policyProfileReviewedBy || !validDate(review.policyProfileReviewedAt)) {
    return { state: 'UNRESOLVED', resolved: false };
  }
  if (!profile || review.policyProfileId !== profile.profileId || review.policyProfileVersion !== profile.profileVersion) {
    return { state: 'UNRESOLVED', resolved: false };
  }
  return { state: 'INDIVIDUAL_ASSET', resolved: true };
}

export function evaluatePriorityEvidenceReadiness(
  asset: PriorityEvidenceAssetInput,
  review?: PriorityEvidenceRecordInput | null,
  profile?: PriorityScoringProfile
): PriorityEvidenceReadiness {
  const activeProfile = profile && profile.status === 'ACTIVE' && profile.approvalStatus === 'APPROVED' &&
    validatePriorityScoringProfile(profile).valid ? profile : undefined;
  const scope = scopeState(asset, review, activeProfile);
  const rows = (review?.factors || []).filter((evidence) => evidence.current !== false);
  const factors = PRIORITY_EVIDENCE_FACTOR_ORDER.map((factor) => {
    if (activeProfile && !activeProfile.applicableFactors.includes(factor)) {
      return {
        factor,
        state: 'NOT_APPLICABLE' as const,
        value: null,
        unit: null,
        reason: 'Factor is explicitly not applicable in the approved scoring profile.',
        provenance: null
      };
    }
    return evaluateFactor(factor, rows, asset, asset.type === 'Other' && scope.state === 'INDIVIDUAL_ASSET', activeProfile);
  });
  const list = (state: PriorityFactorState) => factors.filter((factor) => factor.state === state).map((factor) => factor.factor);
  const missingFactors = list('APPLICABLE_MISSING');
  const pendingFactors = list('PENDING_VERIFICATION');
  const rejectedFactors = list('REJECTED');
  const notApplicableFactors = list('NOT_APPLICABLE');
  const unresolvedFactors = list('UNRESOLVED');
  const readyFactors = list('READY');
  const readyForScoring = activeProfile !== undefined && scope.resolved && factors.length === PRIORITY_EVIDENCE_FACTOR_ORDER.length &&
    factors.every((factor) => factor.state === 'READY' || factor.state === 'NOT_APPLICABLE') &&
    activeProfile.applicableFactors.length > 0;

  let status: PriorityEvidenceReadiness['status'] = 'INCOMPLETE';
  if (scope.state === 'AGGREGATE_OR_NETWORK') status = 'AGGREGATE_OR_NETWORK';
  else if (scope.state === 'SERVICE_ADMINISTRATIVE') status = 'SERVICE_ADMINISTRATIVE';
  else if (scope.state === 'LACKING_SUBTYPE_OR_ASSET_SCOPE') status = 'LACKING_SUBTYPE_OR_ASSET_SCOPE';
  else if (!activeProfile) status = 'PROFILE_UNAVAILABLE';
  else if (!scope.resolved || unresolvedFactors.length) status = 'UNRESOLVED';
  else if (rejectedFactors.length) status = 'REJECTED';
  else if (pendingFactors.length) status = 'PENDING_REVIEW';
  else if (readyForScoring) status = 'READY';

  return {
    readyForScoring,
    status,
    recordScope: scope.state,
    scopeResolved: scope.resolved,
    profileResolved: activeProfile !== undefined,
    policyProfileId: review?.policyProfileId || null,
    policyProfileStatus: review?.policyProfileStatus || null,
    factors,
    missingFactors,
    pendingFactors,
    rejectedFactors,
    notApplicableFactors,
    unresolvedFactors,
    readyFactors
  };
}

export function evidenceValuesForScoring(readiness: PriorityEvidenceReadiness): Partial<Record<PriorityEvidenceFactor, string | number | Date>> {
  const values: Partial<Record<PriorityEvidenceFactor, string | number | Date>> = {};
  if (!readiness.readyForScoring) return values;
  for (const factor of readiness.factors) {
    if (factor.state === 'READY' && factor.value !== null) {
      values[factor.factor] = factor.factor === 'lastMaintenanceDate' ? new Date(factor.value) : factor.value;
    }
  }
  return values;
}
