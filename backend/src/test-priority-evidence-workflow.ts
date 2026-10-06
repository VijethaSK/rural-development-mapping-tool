import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  createPriorityEvidenceWorkflowService,
  PriorityEvidenceWorkflowError,
  type EvidenceFactorSubmission,
  type EvidenceInfrastructure,
  type EvidenceWorkflowDocument,
  type EvidenceWorkflowRepository
} from './services/priorityEvidenceWorkflow.js';
import type { PriorityScoringProfile } from './services/priorityScoringProfiles.js';
import { APPROVED_PRIORITY_SCORING_PROFILES } from './services/priorityScoringProfiles.js';
import { evaluatePriorityEvidenceReadiness } from './services/priorityEvidenceReadiness.js';
import { PriorityEvidence } from './models/PriorityEvidence.js';

const infraId = '507f1f77bcf86cd799439011';
const pdoId = '507f1f77bcf86cd799439012';
const adminId = '507f1f77bcf86cd799439013';
const asset: EvidenceInfrastructure = {
  _id: infraId,
  panchayatId: '507f1f77bcf86cd799439014',
  sourceKey: 'source-school-1',
  dataOrigin: 'SOURCE_EXCEL',
  type: 'School',
  condition: null,
  complaintsCount: null,
  populationServed: null,
  trafficLevel: null,
  lastMaintenanceDate: null,
  alternativeDistanceKm: null,
  coordinateStatus: 'UNVERIFIED',
  coordinateSource: 'PUBLIC_MAP_APPROXIMATE',
  coordinatesVerified: false
};

const activeSchoolProfile: PriorityScoringProfile = {
  profileId: 'school-test-profile',
  profileVersion: '1.0.0',
  infrastructureType: 'School',
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  applicableFactors: ['condition'],
  factorWeights: { condition: 1 },
  factorDefinitions: {
    condition: {
      applicability: 'APPLICABLE', semantics: 'Reviewed physical condition',
      normalization: { kind: 'CATEGORY_MAP', scores: { Good: 10, Average: 50, Poor: 80, Bad: 100 } },
      readinessRequirements: ['accepted evidence']
    },
    complaintsCount: { applicability: 'NOT_APPLICABLE', semantics: 'Not applicable in test profile', readinessRequirements: [] },
    populationServed: { applicability: 'NOT_APPLICABLE', semantics: 'Not applicable in test profile', readinessRequirements: [] },
    trafficLevel: { applicability: 'NOT_APPLICABLE', semantics: 'Not applicable in test profile', readinessRequirements: [] },
    lastMaintenanceDate: { applicability: 'NOT_APPLICABLE', semantics: 'Not applicable in test profile', readinessRequirements: [] },
    alternativeDistanceKm: { applicability: 'NOT_APPLICABLE', semantics: 'Not applicable in test profile', readinessRequirements: [] }
  },
  thresholds: { critical: 80, high: 60, medium: 40, low: 0 },
  readinessRequirements: { requireAcceptedScope: true, requireAcceptedEvidence: true, requireProfileIdentityMatch: true }
};

const submission: EvidenceFactorSubmission = {
  sourceKey: 'source-school-1',
  factor: 'condition',
  value: 'Average',
  unit: 'category',
  sourceName: 'District inspection register',
  sourceRecordReference: 'inspection-2026-17',
  sourceUrl: 'https://example.gov/inspection/17',
  observedAt: '2026-09-12',
  referencePeriod: '2026',
  derivationKind: 'DIRECT',
  confidence: 'MEDIUM',
  notes: 'Submitted evidence notes'
};

class MemoryEvidenceRepository implements EvidenceWorkflowRepository {
  infrastructure: EvidenceInfrastructure | null = structuredClone(asset);
  documents: EvidenceWorkflowDocument[] = [];
  nextId = 0;

  async findInfrastructure(id: string) { return this.infrastructure?._id === id ? structuredClone(this.infrastructure) : null; }
  async findEvidenceDocuments(infrastructureId: string) { return cloneData(this.documents.filter((doc) => doc.infrastructureId === infrastructureId)); }
  async findEvidenceDocument(infrastructureId: string, evidenceId: string) {
    const found = this.documents.find((doc) => doc.infrastructureId === infrastructureId && doc._id === evidenceId);
    return found ? cloneData(found) : null;
  }
  async saveEvidenceDocument(input: Omit<EvidenceWorkflowDocument, '_id' | 'createdAt' | 'updatedAt'> & { _id?: string }) {
    const now = new Date('2026-10-06T00:00:00.000Z');
    const prior = input._id ? this.documents.find((doc) => doc._id === input._id) : undefined;
    const saved = cloneData({ ...input, _id: input._id || `evidence-${++this.nextId}`, createdAt: prior?.createdAt || now, updatedAt: now }) as EvidenceWorkflowDocument;
    if (prior) this.documents[this.documents.indexOf(prior)] = saved;
    else this.documents.push(saved);
    return cloneData(saved);
  }
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function expectStatus(action: () => Promise<unknown>, status: number, label = '') {
  let caught: unknown;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof PriorityEvidenceWorkflowError, `${label ? `${label}: ` : ''}expected PriorityEvidenceWorkflowError ${status}, received ${caught instanceof Error ? caught.message : String(caught)}`);
  assert.equal(caught.statusCode, status);
}

function build(options: { profiles?: readonly PriorityScoringProfile[] } = {}) {
  const repository = new MemoryEvidenceRepository();
  return { repository, service: createPriorityEvidenceWorkflowService(repository, { profiles: options.profiles ?? [] }) };
}

const submitter = { id: pdoId, role: 'pdo' as const };
const reviewer = { id: adminId, role: 'admin' as const };

// Pending evidence can be collected with an empty production registry, but is unresolved and cannot satisfy readiness.
{
  const { repository, service } = build();
  const result = await service.create(infraId, submission, submitter);
  assert.equal(result.factors[0].verificationStatus, 'PENDING');
  assert.equal(result.factors[0].applicability, 'UNRESOLVED');
  assert.equal(result.scoringProfile, null);
  assert.equal(result.readiness.readyForScoring, false);
  assert.equal(repository.documents.length, 1);
}

// Infrastructure and source identity are required; identity may not be switched through the evidence request.
{
  const { repository, service } = build();
  await expectStatus(() => service.create('invalid-id', submission, submitter), 400);
  repository.infrastructure = null;
  await expectStatus(() => service.create(infraId, submission, submitter), 404);
  repository.infrastructure = structuredClone(asset);
  await expectStatus(() => service.create(infraId, { ...submission, sourceKey: 'different-source' }, submitter), 409);
}

// Factor/value/unit/source/date/derivation/confidence validation is performed before persistence.
{
  const { repository, service } = build();
  await expectStatus(() => service.create(infraId, { ...submission, factor: 'madeUp' as never }, submitter), 400);
  await expectStatus(() => service.create(infraId, { ...submission, value: 12 }, submitter), 400);
  await expectStatus(() => service.create(infraId, { ...submission, unit: 'persons' }, submitter), 400);
  await expectStatus(() => service.create(infraId, { ...submission, sourceName: '' }, submitter), 400);
  await expectStatus(() => service.create(infraId, { ...submission, observedAt: 'not-a-date' }, submitter), 400);
  await expectStatus(() => service.create(infraId, { ...submission, derivationKind: 'CALCULATED', derivationMethod: '' }, submitter), 400);
  await expectStatus(() => service.create(infraId, { ...submission, confidence: 'UNKNOWN' as never }, submitter), 400);
  await expectStatus(() => service.create(infraId, { ...submission, factor: 'populationServed', value: 1.5, unit: 'students', referencePeriod: '2025-2026' }, submitter), 400);
  await expectStatus(() => service.create(infraId, { ...submission, factor: 'populationServed', value: 12, unit: 'persons', referencePeriod: '2025-2026' }, submitter), 400);
  await expectStatus(() => service.create(infraId, { ...submission, factor: 'complaintsCount', value: 1.5, unit: 'complaints', referencePeriod: '2026', complaintCoverage: {
    reportingPeriod: '2026', coveredChannels: 'all configured channels', coverageConfirmed: true
  } }, submitter), 400);
  assert.equal(repository.documents.length, 0);
}

// School V1's owner-approved condition vocabulary is accepted as evidence input.
{
  const { service } = build();
  const created = await service.create(infraId, { ...submission, value: 'Needs_Maintenance' }, submitter);
  assert.equal(created.factors[0].value, 'Needs_Maintenance');
  assert.equal(created.factors[0].verificationStatus, 'PENDING');
}

// Specialized factors cannot bypass their readiness evidence requirements.
{
  const { service } = build();
  await expectStatus(() => service.create(infraId, {
    ...submission, factor: 'complaintsCount', value: 0, unit: 'complaints'
  }, submitter), 400);
  await expectStatus(() => service.create(infraId, {
    ...submission, factor: 'populationServed', value: 0, unit: 'students', referencePeriod: undefined
  }, submitter), 400);
  await expectStatus(() => service.create(infraId, {
    ...submission, factor: 'alternativeDistanceKm', value: 0, unit: 'km'
  }, submitter), 400);
  await expectStatus(() => service.create(infraId, {
    ...submission,
    factor: 'alternativeDistanceKm',
    value: 0,
    unit: 'km',
    geospatialEvidence: {
      assetCoordinatesVerified: true,
      alternativeCoordinatesVerified: true,
      alternativeReference: 'facility-2',
      distanceMethod: 'versioned network route',
      distanceMetric: 'NETWORK_TRAVEL',
      providerName: 'test-provider',
      providerVersion: '1'
    }
  }, submitter), 422);
}

// A documented zero is a valid value; it is not replaced with a default or treated as missing.
{
  const { service } = build();
  const created = await service.create(infraId, {
    ...submission, factor: 'populationServed', value: 0, unit: 'students', referencePeriod: '2026'
  }, submitter);
  assert.equal(created.factors[0].value, 0);
  assert.equal(created.factors[0].verificationStatus, 'PENDING');
  assert.equal(created.readiness.readyForScoring, false);
}

// School V1 population is an enrolled/served student count, never a generic persons count.
{
  const { service } = build();
  const valid = await service.create(infraId, {
    ...submission, factor: 'populationServed', value: 0, unit: 'students', referencePeriod: '2025-2026'
  }, submitter);
  assert.equal(valid.factors[0].unit, 'students');
  await expectStatus(() => service.create(infraId, {
    ...submission, factor: 'populationServed', value: 0, unit: 'persons', referencePeriod: '2025-2026'
  }, submitter), 400);
}

// School utilization submissions retain enrollment and sanctioned-capacity periods and reject missing capacity.
{
  const { service } = build();
  const utilizationSubmission: EvidenceFactorSubmission = {
    ...submission,
    factor: 'trafficLevel',
    value: 75,
    unit: 'percent',
    referencePeriod: '2025-2026',
    utilizationMeasurement: {
      observedValue: 75,
      unit: 'students',
      denominator: 100,
      denominatorUnit: 'sanctioned_student_capacity',
      thresholdReference: 'SCHOOL_PRIORITY_V1_1.0.0',
      numeratorReferencePeriod: '2025-2026',
      denominatorReferencePeriod: '2025-2026'
    }
  };
  await expectStatus(() => service.create(infraId, {
    ...utilizationSubmission,
    utilizationMeasurement: { ...utilizationSubmission.utilizationMeasurement!, denominator: 0 }
  }, submitter), 400);
  await expectStatus(() => service.create(infraId, {
    ...utilizationSubmission,
    utilizationMeasurement: { ...utilizationSubmission.utilizationMeasurement!, denominatorReferencePeriod: '2024-2025' }
  }, submitter), 400);
  const acceptedPending = await service.create(infraId, utilizationSubmission, submitter);
  assert.equal(acceptedPending.factors[0].verificationStatus, 'PENDING');
  assert.deepEqual(acceptedPending.factors[0].utilizationMeasurement, utilizationSubmission.utilizationMeasurement,
    'evidence response preserves the utilization period and denominator provenance for review');
  assert.equal(acceptedPending.readiness.readyForScoring, false, 'thresholds remain unapproved and no production profile is active');
}

// Roles are enforced by the service as defense in depth, in addition to route middleware.
{
  const { service } = build({ profiles: [activeSchoolProfile] });
  await expectStatus(() => service.create(infraId, submission, { id: pdoId, role: 'citizen' }), 403);
}

// A factor not applicable to an approved profile is rejected; no fallback profile is selected.
{
  const { service } = build({ profiles: [activeSchoolProfile] });
  await expectStatus(() => service.create(infraId, { ...submission, factor: 'complaintsCount', value: 0, unit: 'complaints', complaintCoverage: {
    reportingPeriod: '2026', coveredChannels: 'register', coverageConfirmed: true
  } }, submitter), 422);
}

// No active production profile means pending evidence is allowed, but cannot be submitted or accepted for scoring.
{
  const { service } = build();
  const created = await service.create(infraId, submission, submitter);
  await expectStatus(() => service.submit(infraId, created.id, 'condition', submitter), 409);
  await expectStatus(() => service.review(infraId, created.id, 'condition', 'ACCEPTED', reviewer), 409);
  await service.approveAssetScope(infraId, created.id, { scopeClass: 'INDIVIDUAL_ASSET', resolvedSubtype: 'School' }, reviewer);
  await expectStatus(() => service.approveProfileReview(infraId, created.id, reviewer), 409,
    'profile review requires an active School profile');
  await expectStatus(() => service.approveAssetScope(infraId, 'not-an-evidence-id', {
    scopeClass: 'INDIVIDUAL_ASSET', resolvedSubtype: 'School'
  }, reviewer), 404);
}

// Submission and acceptance with a test-injected approved profile changes factor readiness; unapproved production catalog remains empty.
{
  const { service } = build({ profiles: [activeSchoolProfile] });
  const created = await service.create(infraId, submission, submitter);
  const submitted = await service.submit(infraId, created.id, 'condition', submitter);
  assert.ok(submitted.factors[0].submittedAt);
  assert.equal(submitted.scoringProfile?.profileVersion, '1.0.0');
  await expectStatus(() => service.review(infraId, created.id, 'condition', 'ACCEPTED', submitter), 403);
  const accepted = await service.review(infraId, created.id, 'condition', 'ACCEPTED', reviewer);
  assert.equal(accepted.factors[0].verificationStatus, 'ACCEPTED');
  assert.equal(accepted.readiness.factors.find((factor) => factor.factor === 'condition')?.state, 'READY');
  assert.equal(accepted.readiness.readyForScoring, false, 'factor evidence does not bypass unresolved accepted scope/profile identity');
  await expectStatus(() => service.approveProfileReview(infraId, created.id, reviewer), 409,
    'profile review cannot be approved before asset scope');
  await expectStatus(() => service.approveProfileReview(infraId, created.id, submitter), 403,
    'PDO cannot approve profile review');
  await expectStatus(() => service.approveAssetScope(infraId, created.id, {
    scopeClass: 'INDIVIDUAL_ASSET', resolvedSubtype: 'School'
  }, submitter), 403, 'PDO cannot approve asset scope');
  const scopeAccepted = await service.approveAssetScope(infraId, created.id, {
    scopeClass: 'INDIVIDUAL_ASSET', resolvedSubtype: 'School'
  }, reviewer);
  assert.equal(scopeAccepted.assetScopeReview.status, 'ACCEPTED');
  assert.equal(scopeAccepted.readiness.readyForScoring, false, 'scope approval alone is not sufficient');
  assert.equal(scopeAccepted.assetScopeReview.reviewedBy, adminId);
  assert.ok(scopeAccepted.assetScopeReview.reviewedAt);
  await expectStatus(() => service.approveAssetScope(infraId, created.id, {
    scopeClass: 'INDIVIDUAL_ASSET', resolvedSubtype: 'School'
  }, reviewer), 409, 'scope approval is final and cannot be repeated');
  const profileAccepted = await service.approveProfileReview(infraId, created.id, reviewer);
  assert.equal(profileAccepted.profileReview.status, 'ACCEPTED');
  assert.equal(profileAccepted.profileReview.profileId, activeSchoolProfile.profileId);
  assert.equal(profileAccepted.profileReview.profileVersion, activeSchoolProfile.profileVersion);
  assert.equal(profileAccepted.profileReview.reviewedBy, adminId);
  assert.ok(profileAccepted.profileReview.reviewedAt);
  assert.equal(profileAccepted.readiness.readyForScoring, true);
  await expectStatus(() => service.approveProfileReview(infraId, created.id, reviewer), 409,
    'profile approval is final and cannot be repeated');
  const pdoDetails = await service.details(infraId, created.id, submitter);
  assert.equal('reviewedBy' in pdoDetails.factors[0], false, 'reviewer identity is hidden from PDO evidence responses');
  assert.equal('reviewedBy' in pdoDetails.assetScopeReview, false, 'scope reviewer identity is hidden from PDO responses');
  assert.equal('reviewedBy' in pdoDetails.profileReview, false, 'profile reviewer identity is hidden from PDO responses');
  const adminDetails = await service.details(infraId, created.id, reviewer);
  assert.equal(adminDetails.factors[0].reviewedBy, adminId, 'reviewer identity remains available to authorized admins for audit');
  assert.equal(adminDetails.assetScopeReview.reviewedBy, adminId);
  assert.equal(adminDetails.profileReview.reviewedBy, adminId);
  assert.deepEqual(APPROVED_PRIORITY_SCORING_PROFILES.map((profile) => profile.profileId), ['SCHOOL_PRIORITY_V1'],
    'test profiles are injected and do not alter the production registry');
}

// Rejected evidence records a reason and never satisfies readiness.
{
  const { service } = build({ profiles: [activeSchoolProfile] });
  const created = await service.create(infraId, submission, submitter);
  await service.submit(infraId, created.id, 'condition', submitter);
  await expectStatus(() => service.review(infraId, created.id, 'condition', 'REJECTED', reviewer), 400);
  const rejected = await service.review(infraId, created.id, 'condition', 'REJECTED', reviewer, { reason: 'Source record could not be verified.' });
  assert.equal(rejected.factors[0].verificationStatus, 'REJECTED');
  assert.equal(rejected.factors[0].rejectionReason, 'Source record could not be verified.');
  assert.equal(rejected.readiness.factors.find((factor) => factor.factor === 'condition')?.state, 'REJECTED');
  assert.equal(rejected.readiness.readyForScoring, false);
  await service.approveAssetScope(infraId, created.id, { scopeClass: 'INDIVIDUAL_ASSET', resolvedSubtype: 'School' }, reviewer);
  await expectStatus(() => service.approveProfileReview(infraId, created.id, reviewer), 422,
    'rejected factor evidence cannot receive profile approval');
}

// List/details are scoped to the infrastructure and return sanitized readiness/evidence only.
{
  const { service } = build();
  const created = await service.create(infraId, submission, submitter);
  const listing = await service.list(infraId, submitter);
  assert.equal(listing.items.length, 1);
  assert.equal((await service.details(infraId, created.id, submitter)).id, created.id);
  await expectStatus(() => service.details(infraId, 'other-evidence', submitter), 404);
  assert.equal('reviewedBy' in listing.items[0].factors[0], false);
}

// Shape assertions make sure reviewer-only audit fields are not part of public readiness provenance.
const readiness = evaluatePriorityEvidenceReadiness(asset, { factors: [] });
assert.equal('reviewedBy' in (readiness.factors[0].provenance || {}), false);
assert.equal(mongoose.Types.ObjectId.isValid(infraId), true);
assert.equal(mongoose.connection.readyState, 0, 'workflow unit tests do not connect to MongoDB');
const factorsSchema = PriorityEvidence.schema.path('factors') as unknown as { schema: { path: (name: string) => unknown } };
for (const auditField of ['submittedBy', 'submittedAt', 'reviewedBy', 'reviewedAt', 'rejectionReason']) {
  assert.ok(factorsSchema.schema.path(auditField), `factor evidence schema includes ${auditField}`);
}
for (const auditField of ['reviewedBy', 'reviewedAt', 'policyProfileReviewedBy', 'policyProfileReviewedAt']) {
  assert.ok(PriorityEvidence.schema.path(auditField), `evidence review schema includes ${auditField}`);
}
console.log('PASS: Priority evidence workflow validation, explicit scope/profile approvals, role boundaries, lifecycle, readiness and audit sanitization (in-memory; no database connection).');
