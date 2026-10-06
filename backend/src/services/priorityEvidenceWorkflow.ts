import mongoose from 'mongoose';
import { Infrastructure } from '../models/Infrastructure.js';
import {
  PriorityEvidence,
  PRIORITY_EVIDENCE_FACTORS,
  type PriorityEvidenceDoc,
  type PriorityEvidenceFactor,
  type PriorityFactorEvidence
} from '../models/PriorityEvidence.js';
import { UserRole } from '../models/User.js';
import {
  evaluatePriorityEvidenceReadiness,
  type PriorityEvidenceAssetInput,
  type PriorityEvidenceRecordInput
} from './priorityEvidenceReadiness.js';
import {
  calculateSchoolUtilizationPercent,
  normalizeSchoolUtilization,
  APPROVED_PRIORITY_SCORING_PROFILES,
  SCHOOL_PRIORITY_V1_POLICY,
  schoolComplaintCoveragePeriod,
  resolvePriorityScoringProfile,
  type PriorityScoringProfile
} from './priorityScoringProfiles.js';

export class PriorityEvidenceWorkflowError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'PriorityEvidenceWorkflowError';
  }
}

export interface EvidenceWorkflowActor {
  id: string;
  role: UserRole;
}

export interface EvidenceInfrastructure extends PriorityEvidenceAssetInput {
  _id: string;
  panchayatId: string;
}

export interface EvidenceFactorSubmission {
  sourceKey: string;
  factor: PriorityEvidenceFactor;
  value: unknown;
  unit: string;
  sourceName: string;
  sourceRecordReference: string;
  sourceUrl?: string;
  observedAt: string | Date;
  referencePeriod?: string;
  derivationKind: 'DIRECT' | 'CALCULATED';
  derivationMethod?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  notes?: string;
  complaintCoverage?: PriorityFactorEvidence['complaintCoverage'];
  utilizationMeasurement?: PriorityFactorEvidence['utilizationMeasurement'];
  maintenanceEvidence?: PriorityFactorEvidence['maintenanceEvidence'];
  geospatialEvidence?: PriorityFactorEvidence['geospatialEvidence'];
}

export interface EvidenceWorkflowDocument extends PriorityEvidenceRecordInput {
  _id?: string;
  infrastructureId: string;
  factors: PriorityFactorEvidence[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AssetScopeReviewSubmission {
  scopeClass: Exclude<PriorityEvidenceRecordInput['scopeClass'], 'UNRESOLVED' | undefined>;
  resolvedSubtype?: string;
}

export interface EvidenceWorkflowRepository {
  findInfrastructure(id: string): Promise<EvidenceInfrastructure | null>;
  findEvidenceDocuments(infrastructureId: string): Promise<EvidenceWorkflowDocument[]>;
  findEvidenceDocument(infrastructureId: string, evidenceId: string): Promise<EvidenceWorkflowDocument | null>;
  saveEvidenceDocument(document: Omit<EvidenceWorkflowDocument, '_id' | 'createdAt'> & { _id?: string }): Promise<EvidenceWorkflowDocument>;
}

const FACTOR_UNITS: Record<PriorityEvidenceFactor, string> = {
  condition: 'category',
  complaintsCount: 'complaints',
  populationServed: 'persons',
  trafficLevel: 'ordinal',
  lastMaintenanceDate: 'date',
  alternativeDistanceKm: 'km'
};
const CONFIDENCE = new Set(['HIGH', 'MEDIUM', 'LOW']);
const CONDITIONS = new Set(['Good', 'Average', 'Needs_Maintenance', 'Poor', 'Bad']);
const TRAFFIC_LEVELS = new Set(['Low', 'Medium', 'High']);

function fail(statusCode: number, message: string): never {
  throw new PriorityEvidenceWorkflowError(statusCode, message);
}

function validDate(value: unknown): value is string | Date {
  if (value instanceof Date) return Number.isFinite(value.getTime());
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(Date.parse(value));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateSourceUrl(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') fail(400, 'sourceUrl must be a public HTTP(S) URL.');
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      fail(400, 'sourceUrl must be a public HTTP(S) URL without credentials, query parameters, or fragments.');
    }
    return url.toString();
  } catch {
    fail(400, 'sourceUrl must be a valid public HTTP(S) URL.');
  }
}

function validateFactorValue(factor: PriorityEvidenceFactor, value: unknown, unit: unknown, asset?: EvidenceInfrastructure): void {
  const expectedUnit = asset?.type === 'School' && factor === 'trafficLevel'
    ? 'percent'
    : asset?.type === 'School' && factor === 'populationServed'
      ? 'students'
      : FACTOR_UNITS[factor];
  if (unit !== expectedUnit) fail(400, `unit must be '${expectedUnit}' for ${factor}.`);
  if (factor === 'condition' && (typeof value !== 'string' || !CONDITIONS.has(value))) {
    fail(400, 'condition value must be Good, Average, Needs_Maintenance, Poor, or Bad.');
  }
  if (factor === 'trafficLevel' && asset?.type === 'School' &&
      (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    fail(400, 'School utilization value must be a finite non-negative percentage.');
  }
  if (factor === 'trafficLevel' && asset?.type !== 'School' &&
      (typeof value !== 'string' || !TRAFFIC_LEVELS.has(value))) {
    fail(400, 'trafficLevel value must be Low, Medium, or High.');
  }
  if (['complaintsCount', 'populationServed'].includes(factor) &&
      (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) {
    fail(400, `${factor} must be a finite non-negative whole number.`);
  }
  if (factor === 'alternativeDistanceKm' &&
      (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    fail(400, `${factor} must be a finite non-negative number.`);
  }
  if (factor === 'lastMaintenanceDate' && !validDate(value)) {
    fail(400, 'lastMaintenanceDate must be a valid ISO date.');
  }
}

function validateEvidence(input: EvidenceFactorSubmission, asset?: EvidenceInfrastructure): PriorityFactorEvidence {
  if (!input || typeof input !== 'object') fail(400, 'Evidence body is required.');
  if (!PRIORITY_EVIDENCE_FACTORS.includes(input.factor)) fail(400, 'Unsupported evidence factor.');
  if (!nonEmpty(input.sourceKey)) fail(400, 'sourceKey is required.');
  if (!nonEmpty(input.sourceName) || !nonEmpty(input.sourceRecordReference)) {
    fail(400, 'sourceName and sourceRecordReference are required.');
  }
  if (!validDate(input.observedAt)) fail(400, 'observedAt must be a valid ISO date.');
  if (!['DIRECT', 'CALCULATED'].includes(input.derivationKind)) fail(400, 'derivationKind must be DIRECT or CALCULATED.');
  if (input.derivationKind === 'CALCULATED' && !nonEmpty(input.derivationMethod)) {
    fail(400, 'Calculated evidence requires derivationMethod.');
  }
  if (!CONFIDENCE.has(input.confidence)) fail(400, 'confidence must be HIGH, MEDIUM, or LOW.');
  if (input.notes !== undefined && typeof input.notes !== 'string') fail(400, 'notes must be text.');
  const sourceUrl = validateSourceUrl(input.sourceUrl);
  validateFactorValue(input.factor, input.value, input.unit, asset);

  const row: PriorityFactorEvidence = {
    factor: input.factor,
    value: input.value,
    unit: input.unit,
    applicability: 'UNRESOLVED',
    sourceName: input.sourceName.trim(),
    sourceRecordReference: input.sourceRecordReference.trim(),
    ...(sourceUrl ? { sourceUrl } : {}),
    observedAt: new Date(input.observedAt),
    ...(input.referencePeriod ? { referencePeriod: input.referencePeriod.trim() } : {}),
    derivationKind: input.derivationKind,
    ...(input.derivationMethod ? { derivationMethod: input.derivationMethod.trim() } : {}),
    confidence: input.confidence,
    verificationStatus: 'PENDING',
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    ...(input.notes ? { notes: input.notes.trim() } : {}),
    current: true,
    ...(input.complaintCoverage ? { complaintCoverage: input.complaintCoverage } : {}),
    ...(input.utilizationMeasurement ? { utilizationMeasurement: input.utilizationMeasurement } : {}),
    ...(input.maintenanceEvidence ? { maintenanceEvidence: input.maintenanceEvidence } : {}),
    ...(input.geospatialEvidence ? { geospatialEvidence: input.geospatialEvidence } : {})
  };

  validateFactorSpecificRequirements(row, asset);
  return row;
}

function validateFactorSpecificRequirements(row: PriorityFactorEvidence, asset?: EvidenceInfrastructure): void {
  if (row.factor === 'complaintsCount') {
    const coverage = row.complaintCoverage;
    if (!coverage?.coverageConfirmed || !nonEmpty(coverage.reportingPeriod) || !nonEmpty(coverage.coveredChannels) ||
        row.referencePeriod !== coverage.reportingPeriod.trim()) {
      fail(400, 'complaintsCount evidence requires confirmed reporting-period and channel coverage.');
    }
  }
  if (row.factor === 'populationServed' && !nonEmpty(row.referencePeriod)) {
    fail(400, 'populationServed evidence requires a referencePeriod.');
  }
  if (row.factor === 'trafficLevel') {
    const measure = row.utilizationMeasurement;
    if (!nonEmpty(row.referencePeriod) || !measure || !Number.isFinite(measure.observedValue) || measure.observedValue < 0 ||
        !Number.isFinite(measure.denominator) || measure.denominator <= 0 || !nonEmpty(measure.unit) ||
        !nonEmpty(measure.denominatorUnit) || !nonEmpty(measure.thresholdReference)) {
      fail(400, 'trafficLevel evidence requires dated utilization, a positive denominator, and a threshold reference.');
    }
    if (asset?.type === 'School') {
      const percent = calculateSchoolUtilizationPercent(
        measure.observedValue,
        measure.denominator,
        measure.numeratorReferencePeriod || '',
        measure.denominatorReferencePeriod || '',
        measure.compatiblePeriodEvidenceReference
      );
      const normalized = percent === null ? null : normalizeSchoolUtilization(percent);
      if (normalized === null || row.value !== percent || measure.unit.toLowerCase() !== 'students' ||
          measure.denominatorUnit.toLowerCase() !== 'sanctioned_student_capacity' ||
          row.referencePeriod !== measure.numeratorReferencePeriod?.trim() ||
          measure.thresholdReference !== SCHOOL_PRIORITY_V1_POLICY.thresholdReference) {
        fail(400, 'School utilization evidence must match the configured enrollment/capacity calculation, period evidence, and threshold version.');
      }
    }
  }
  if (row.factor === 'lastMaintenanceDate') {
    const maintenance = row.maintenanceEvidence;
    if (!maintenance?.actualCompletionConfirmed || !nonEmpty(maintenance.qualifyingWorkType) ||
        !nonEmpty(maintenance.completionEvidenceReference) || row.value instanceof Date && row.value > row.observedAt) {
      fail(400, 'Maintenance evidence must document qualifying completed work and its actual completion record.');
    }
    if (typeof row.value === 'string' && Date.parse(row.value) > row.observedAt.getTime()) {
      fail(400, 'Maintenance date cannot be later than observedAt.');
    }
  }
  if (row.factor === 'alternativeDistanceKm') {
    const geo = row.geospatialEvidence;
    if (!geo?.assetCoordinatesVerified || !geo.alternativeCoordinatesVerified || !nonEmpty(geo.alternativeReference) ||
        !nonEmpty(geo.distanceMethod) || geo.distanceMetric !== 'NETWORK_TRAVEL' || !nonEmpty(geo.providerName) || !nonEmpty(geo.providerVersion)) {
      fail(400, 'alternativeDistanceKm requires verified coordinates and a versioned network-distance method.');
    }
    if (asset && !(asset.coordinatesVerified === true && asset.coordinateStatus === 'VERIFIED' &&
        asset.coordinateSource !== 'PUBLIC_MAP_APPROXIMATE' && asset.coordinateSource !== 'UNAVAILABLE')) {
      fail(422, 'alternativeDistanceKm cannot use approximate or unverified infrastructure coordinates.');
    }
  }
}

function assertSubmitter(actor: EvidenceWorkflowActor): void {
  if (!actor?.id || !['pdo', 'admin'].includes(actor.role)) fail(403, 'Only PDO or admin users may submit priority evidence.');
}

function assertReviewer(actor: EvidenceWorkflowActor): void {
  if (!actor?.id || actor.role !== 'admin') fail(403, 'Only admin users may review priority evidence.');
}

function resolveProfile(asset: EvidenceInfrastructure, review?: PriorityEvidenceRecordInput | null, profiles = APPROVED_PRIORITY_SCORING_PROFILES): PriorityScoringProfile | null {
  return resolvePriorityScoringProfile({
    type: asset.type,
    resolvedSubtype: review?.resolvedSubtype,
    scopeClass: review?.scopeClass
  }, profiles).profile;
}

function requireApplicableProfile(asset: EvidenceInfrastructure, review: PriorityEvidenceRecordInput, factor: PriorityEvidenceFactor, profiles: readonly PriorityScoringProfile[]): PriorityScoringProfile {
  const profile = resolveProfile(asset, review, profiles);
  if (!profile) fail(409, 'No approved production scoring profile is available for this infrastructure. Evidence cannot be submitted for scoring review.');
  if (!profile.applicableFactors.includes(factor) || profile.factorDefinitions[factor]?.applicability !== 'APPLICABLE') {
    fail(422, 'This factor is not applicable under the approved profile for this infrastructure.');
  }
  return profile;
}

function cloneDocument(document: EvidenceWorkflowDocument): EvidenceWorkflowDocument {
  return {
    ...document,
    factors: (document.factors || []).map((factor) => ({
      ...factor,
      ...(factor.complaintCoverage ? { complaintCoverage: { ...factor.complaintCoverage } } : {}),
      ...(factor.utilizationMeasurement ? { utilizationMeasurement: { ...factor.utilizationMeasurement } } : {}),
      ...(factor.maintenanceEvidence ? { maintenanceEvidence: { ...factor.maintenanceEvidence } } : {}),
      ...(factor.geospatialEvidence ? { geospatialEvidence: { ...factor.geospatialEvidence } } : {})
    }))
  };
}

function publicEvidence(
  document: EvidenceWorkflowDocument,
  readiness: ReturnType<typeof evaluatePriorityEvidenceReadiness>,
  actor: EvidenceWorkflowActor,
  profile: PriorityScoringProfile | null
) {
  const admin = actor.role === 'admin';
  return {
    id: document._id || '',
    infrastructureId: document.infrastructureId,
    sourceKey: document.sourceKey || null,
    assetScopeReview: {
      scopeClass: document.scopeClass || 'UNRESOLVED',
      status: document.scopeVerificationStatus || 'PENDING',
      resolvedSubtype: document.resolvedSubtype || null,
      reviewedAt: document.reviewedAt || null,
      ...(admin && document.reviewedBy ? { reviewedBy: String(document.reviewedBy) } : {})
    },
    profileReview: {
      status: document.policyProfileStatus || 'PENDING',
      profileId: document.policyProfileId || null,
      profileVersion: document.policyProfileVersion || null,
      reviewedAt: document.policyProfileReviewedAt || null,
      ...(admin && document.policyProfileReviewedBy ? { reviewedBy: String(document.policyProfileReviewedBy) } : {})
    },
    submittedAt: document.factors
      .map((factor) => factor.submittedAt)
      .map((value) => validDate(value) ? new Date(value).toISOString() : null)
      .filter((value): value is string => value !== null)
      .sort((left, right) => right.localeCompare(left))[0] || null,
    factors: (document.factors || []).map((factor) => ({
      factor: factor.factor,
      value: factor.value instanceof Date ? factor.value.toISOString() : factor.value,
      unit: factor.unit,
      applicability: factor.applicability,
      sourceName: factor.sourceName,
      sourceRecordReference: factor.sourceRecordReference,
      sourceUrl: factor.sourceUrl || null,
      observedAt: factor.observedAt,
      referencePeriod: factor.referencePeriod || null,
      derivationKind: factor.derivationKind,
      derivationMethod: factor.derivationMethod || null,
      confidence: factor.confidence,
      verificationStatus: factor.verificationStatus,
      submittedAt: factor.submittedAt || null,
      ...(admin && factor.submittedBy ? { submittedBy: String(factor.submittedBy) } : {}),
      reviewedAt: factor.reviewedAt || null,
      ...(admin && factor.reviewedBy ? { reviewedBy: String(factor.reviewedBy) } : {}),
      rejectionReason: factor.rejectionReason || null,
      reviewerNotes: admin ? factor.reviewerNotes || null : undefined,
      notes: factor.notes || null,
      current: factor.current,
      ...(factor.utilizationMeasurement ? { utilizationMeasurement: { ...factor.utilizationMeasurement } } : {})
    })),
    scoringProfile: profile ? {
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
      infrastructureType: profile.infrastructureType,
      status: profile.status
    } : null,
    readiness
  };
}

function currentFactor(document: EvidenceWorkflowDocument, factor: PriorityEvidenceFactor): PriorityFactorEvidence | undefined {
  const matches = (document.factors || []).filter((entry) => entry.factor === factor && entry.current !== false);
  if (matches.length > 1) fail(409, 'Multiple current evidence entries exist for this factor; administrative resolution is required.');
  return matches[0] as PriorityFactorEvidence | undefined;
}

export function createPriorityEvidenceWorkflowService(
  repository: EvidenceWorkflowRepository,
  options: { profiles?: readonly PriorityScoringProfile[] } = {}
) {
  const profiles = options.profiles || APPROVED_PRIORITY_SCORING_PROFILES;

  async function context(infrastructureId: string) {
    if (!mongoose.Types.ObjectId.isValid(infrastructureId)) fail(400, 'Invalid infrastructure ID.');
    const asset = await repository.findInfrastructure(infrastructureId);
    if (!asset) fail(404, 'Infrastructure item not found.');
    const documents = await repository.findEvidenceDocuments(infrastructureId);
    if (documents.length > 1) fail(409, 'Multiple evidence review documents exist for this infrastructure; administrative resolution is required.');
    return { asset, document: documents[0] || null };
  }

  function assertSourceIdentity(asset: EvidenceInfrastructure, sourceKey: string, review?: PriorityEvidenceRecordInput | null): void {
    if (!asset.sourceKey || sourceKey !== asset.sourceKey || review?.sourceKey && review.sourceKey !== asset.sourceKey) {
      fail(409, 'sourceKey does not match the infrastructure record.');
    }
  }

  async function create(infrastructureId: string, input: EvidenceFactorSubmission, actor: EvidenceWorkflowActor) {
    assertSubmitter(actor);
    const { asset, document } = await context(infrastructureId);
    if (!input || typeof input !== 'object' || !nonEmpty(input.sourceKey)) fail(400, 'sourceKey is required.');
    assertSourceIdentity(asset, input?.sourceKey, document);
    const row = validateEvidence(input, asset);
    const existingReview = document || {
      sourceKey: asset.sourceKey,
      scopeClass: 'UNRESOLVED' as const,
      scopeVerificationStatus: 'PENDING' as const,
      policyProfileStatus: 'PENDING' as const,
      factors: []
    };
    const profile = resolveProfile(asset, existingReview, profiles);
    if (profile) {
      if (!profile.applicableFactors.includes(row.factor) || profile.factorDefinitions[row.factor]?.applicability !== 'APPLICABLE') {
        fail(422, 'This factor is not applicable under the approved profile for this infrastructure.');
      }
      row.applicability = 'APPLICABLE';
    }
    if (document?.factors.some((factor) => factor.factor === row.factor && factor.current !== false &&
        factor.verificationStatus === 'PENDING' && factor.submittedAt)) {
      fail(409, 'Submitted evidence cannot be edited; create a new evidence version after review.');
    }
    const next: EvidenceWorkflowDocument = document ? cloneDocument(document) : {
      infrastructureId,
      sourceKey: asset.sourceKey,
      scopeClass: 'UNRESOLVED' as const,
      scopeVerificationStatus: 'PENDING' as const,
      policyProfileStatus: 'PENDING' as const,
      factors: [],
      createdAt: new Date(),
      updatedAt: new Date()
    } as EvidenceWorkflowDocument;
    for (const previous of next.factors || []) {
      if (previous.factor === row.factor && previous.current !== false) previous.current = false;
    }
    next.factors ||= [];
    next.factors.push(row);
    const saved = await repository.saveEvidenceDocument(next);
    const readiness = evaluatePriorityEvidenceReadiness(asset, saved, profile || undefined);
    return publicEvidence(saved, readiness, actor, profile);
  }

  async function list(infrastructureId: string, actor: EvidenceWorkflowActor) {
    assertSubmitter(actor);
    const { asset, document } = await context(infrastructureId);
    if (!document) return { items: [], readiness: evaluatePriorityEvidenceReadiness(asset) };
    const profile = resolveProfile(asset, document, profiles);
    const readiness = evaluatePriorityEvidenceReadiness(asset, document, profile || undefined);
    return { items: [publicEvidence(document, readiness, actor, profile)], readiness };
  }

  async function details(infrastructureId: string, evidenceId: string, actor: EvidenceWorkflowActor) {
    assertSubmitter(actor);
    const { asset } = await context(infrastructureId);
    const document = await repository.findEvidenceDocument(infrastructureId, evidenceId);
    if (!document) fail(404, 'Priority evidence was not found.');
    const profile = resolveProfile(asset, document, profiles);
    const readiness = evaluatePriorityEvidenceReadiness(asset, document, profile || undefined);
    return publicEvidence(document, readiness, actor, profile);
  }

  async function submit(infrastructureId: string, evidenceId: string, factor: PriorityEvidenceFactor, actor: EvidenceWorkflowActor) {
    assertSubmitter(actor);
    const { asset, document } = await context(infrastructureId);
    if (!document || document._id !== evidenceId) fail(404, 'Priority evidence was not found.');
    assertSourceIdentity(asset, document.sourceKey || '', document);
    const review = currentFactor(document, factor);
    if (!review || review.verificationStatus !== 'PENDING' || review.submittedAt) fail(409, 'Only an unsubmitted pending evidence item can be submitted for review.');
    requireApplicableProfile(asset, document, factor, profiles);
    const validation = validateEvidence({ ...review, sourceKey: document.sourceKey || '', sourceUrl: review.sourceUrl || undefined } as EvidenceFactorSubmission, asset);
    validation.applicability = 'APPLICABLE';
    validation.submittedBy = new mongoose.Types.ObjectId(actor.id);
    validation.submittedAt = new Date();
    const next = cloneDocument(document);
    const index = next.factors.findIndex((entry) => entry.factor === factor && entry.current !== false);
    next.factors[index] = validation;
    const saved = await repository.saveEvidenceDocument(next);
    const profile = resolveProfile(asset, saved, profiles);
    return publicEvidence(saved, evaluatePriorityEvidenceReadiness(asset, saved, profile || undefined), actor, profile);
  }

  async function review(
    infrastructureId: string,
    evidenceId: string,
    factor: PriorityEvidenceFactor,
    decision: 'ACCEPTED' | 'REJECTED',
    actor: EvidenceWorkflowActor,
    input: { reason?: string; notes?: string } = {}
  ) {
    assertReviewer(actor);
    const { asset, document } = await context(infrastructureId);
    if (!document || document._id !== evidenceId) fail(404, 'Priority evidence was not found.');
    assertSourceIdentity(asset, document.sourceKey || '', document);
    const current = currentFactor(document, factor);
    if (!current || current.verificationStatus !== 'PENDING' || !current.submittedAt) {
      fail(409, 'Only submitted pending evidence can be reviewed.');
    }
    const profile = requireApplicableProfile(asset, document, factor, profiles);
    const validated = validateEvidence({ ...current, sourceKey: document.sourceKey || '', sourceUrl: current.sourceUrl || undefined } as EvidenceFactorSubmission, asset);
    validated.applicability = 'APPLICABLE';
    validated.verificationStatus = decision;
    validated.reviewedBy = new mongoose.Types.ObjectId(actor.id);
    validated.reviewedAt = new Date();
    if (decision === 'ACCEPTED' && profile.profileId === 'SCHOOL_PRIORITY_V1' && factor === 'complaintsCount') {
      const expectedPeriod = schoolComplaintCoveragePeriod(validated.reviewedAt);
      if (!expectedPeriod || validated.referencePeriod !== expectedPeriod ||
          validated.complaintCoverage?.reportingPeriod !== expectedPeriod) {
        fail(422, 'School complaint evidence must cover the previous 12 calendar months ending on the evidence review date.');
      }
    }
    if (input.notes !== undefined && typeof input.notes !== 'string') fail(400, 'review notes must be text.');
    validated.reviewerNotes = input.notes?.trim();
    if (decision === 'REJECTED') {
      if (!nonEmpty(input.reason)) fail(400, 'A non-empty rejection reason is required.');
      validated.rejectionReason = input.reason.trim();
    }
    const next = cloneDocument(document);
    const index = next.factors.findIndex((entry) => entry.factor === factor && entry.current !== false);
    next.factors[index] = validated;
    const saved = await repository.saveEvidenceDocument(next);
    const activeProfile = resolveProfile(asset, saved, profiles);
    return publicEvidence(saved, evaluatePriorityEvidenceReadiness(asset, saved, activeProfile || undefined), actor, activeProfile);
  }

  async function approveAssetScope(
    infrastructureId: string,
    evidenceId: string,
    input: AssetScopeReviewSubmission,
    actor: EvidenceWorkflowActor
  ) {
    assertReviewer(actor);
    const { asset, document } = await context(infrastructureId);
    if (!document || document._id !== evidenceId) fail(404, 'Priority evidence was not found.');
    assertSourceIdentity(asset, document.sourceKey || '', document);
    if (document.scopeVerificationStatus !== 'PENDING') {
      fail(409, 'Asset scope review is already finalized or is in an invalid state.');
    }
    const scopeClasses = ['INDIVIDUAL_ASSET', 'AGGREGATE_OR_NETWORK', 'SERVICE_ADMINISTRATIVE'];
    if (!input || !scopeClasses.includes(input.scopeClass)) fail(400, 'A valid asset scope classification is required.');
    if (input.scopeClass === 'INDIVIDUAL_ASSET' && !nonEmpty(input.resolvedSubtype)) {
      fail(400, 'An individual asset scope requires a resolved subtype.');
    }
    if (input.resolvedSubtype !== undefined && !nonEmpty(input.resolvedSubtype)) {
      fail(400, 'resolvedSubtype must be non-empty when provided.');
    }
    const next = cloneDocument(document);
    next.scopeClass = input.scopeClass;
    next.resolvedSubtype = input.scopeClass === 'INDIVIDUAL_ASSET' ? input.resolvedSubtype!.trim() : undefined;
    next.scopeVerificationStatus = 'ACCEPTED';
    next.reviewedBy = new mongoose.Types.ObjectId(actor.id);
    next.reviewedAt = new Date();
    const saved = await repository.saveEvidenceDocument(next);
    const profile = resolveProfile(asset, saved, profiles);
    return publicEvidence(saved, evaluatePriorityEvidenceReadiness(asset, saved, profile || undefined), actor, profile);
  }

  async function approveProfileReview(
    infrastructureId: string,
    evidenceId: string,
    actor: EvidenceWorkflowActor
  ) {
    assertReviewer(actor);
    const { asset, document } = await context(infrastructureId);
    if (!document || document._id !== evidenceId) fail(404, 'Priority evidence was not found.');
    assertSourceIdentity(asset, document.sourceKey || '', document);
    if (document.policyProfileStatus !== 'PENDING') {
      fail(409, 'Profile review is already finalized or is in an invalid state.');
    }
    if (document.scopeClass !== 'INDIVIDUAL_ASSET' || document.scopeVerificationStatus !== 'ACCEPTED' ||
        !document.reviewedBy || !validDate(document.reviewedAt) || !nonEmpty(document.resolvedSubtype)) {
      fail(409, 'Accepted individual asset scope review is required before profile review.');
    }
    const profile = resolveProfile(asset, document, profiles);
    if (!profile) fail(409, 'No active approved scoring profile applies to this infrastructure.');
    const now = new Date();
    const candidate: EvidenceWorkflowDocument = {
      ...cloneDocument(document),
      policyProfileId: profile.profileId,
      policyProfileVersion: profile.profileVersion,
      policyProfileStatus: 'ACCEPTED',
      policyProfileReviewedBy: new mongoose.Types.ObjectId(actor.id),
      policyProfileReviewedAt: now
    };
    const readiness = evaluatePriorityEvidenceReadiness(asset, candidate, profile);
    if (!readiness.readyForScoring) {
      fail(422, 'Profile review cannot be approved until every required factor has valid accepted evidence.');
    }
    const saved = await repository.saveEvidenceDocument(candidate);
    return publicEvidence(saved, evaluatePriorityEvidenceReadiness(asset, saved, profile), actor, profile);
  }

  return { create, list, details, submit, review, approveAssetScope, approveProfileReview };
}

const mongooseRepository: EvidenceWorkflowRepository = {
  async findInfrastructure(id) {
    const result = await Infrastructure.findById(id).lean();
    if (!result) return null;
    return {
      ...(result as unknown as EvidenceInfrastructure),
      _id: String(result._id),
      panchayatId: String(result.panchayatId)
    };
  },
  async findEvidenceDocuments(infrastructureId) {
    const results = await PriorityEvidence.find({ infrastructureId }).lean() as unknown as PriorityEvidenceDoc[];
    return results.map((result) => ({
      ...(result as unknown as EvidenceWorkflowDocument),
      _id: String(result._id),
      infrastructureId: String(result.infrastructureId),
      factors: (result.factors || []).map((factor) => ({
        ...factor,
        submittedBy: factor.submittedBy ? new mongoose.Types.ObjectId(String(factor.submittedBy)) : null,
        reviewedBy: factor.reviewedBy ? new mongoose.Types.ObjectId(String(factor.reviewedBy)) : null
      }))
    }));
  },
  async findEvidenceDocument(infrastructureId, evidenceId) {
    if (!mongoose.Types.ObjectId.isValid(evidenceId)) return null;
    const result = await PriorityEvidence.findOne({ _id: evidenceId, infrastructureId }).lean() as unknown as PriorityEvidenceDoc | null;
    if (!result) return null;
    const [mapped] = await this.findEvidenceDocuments(infrastructureId);
    return mapped?._id === evidenceId ? mapped : null;
  },
  async saveEvidenceDocument(document) {
    const { _id, ...values } = document;
    const saved = _id
      ? await PriorityEvidence.findOneAndUpdate(
        { _id, updatedAt: document.updatedAt },
        values,
        { new: true, runValidators: true }
      )
      : await PriorityEvidence.create(values);
    if (!saved) fail(409, 'Priority evidence changed during this request; reload before retrying.');
    const result = saved.toObject() as unknown as PriorityEvidenceDoc;
    return {
      ...(result as unknown as EvidenceWorkflowDocument),
      _id: String(saved._id),
      infrastructureId: String(saved.infrastructureId),
      factors: (result.factors || []).map((factor) => ({
        ...factor,
        submittedBy: factor.submittedBy ? new mongoose.Types.ObjectId(String(factor.submittedBy)) : null,
        reviewedBy: factor.reviewedBy ? new mongoose.Types.ObjectId(String(factor.reviewedBy)) : null
      }))
    };
  }
};

export const PriorityEvidenceWorkflow = createPriorityEvidenceWorkflowService(mongooseRepository);
