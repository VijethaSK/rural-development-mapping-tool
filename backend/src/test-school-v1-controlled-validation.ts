import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  PriorityEvidence,
  type PriorityEvidenceDoc,
  type PriorityEvidenceFactor
} from './models/PriorityEvidence.js';
import type { InfrastructureDoc } from './models/Infrastructure.js';
import {
  createPriorityEvidenceWorkflowService,
  type EvidenceFactorSubmission,
  type EvidenceInfrastructure,
  type EvidenceWorkflowDocument,
  type EvidenceWorkflowRepository
} from './services/priorityEvidenceWorkflow.js';
import {
  APPROVED_PRIORITY_SCORING_PROFILES,
  SCHOOL_PRIORITY_V1_PROFILE,
  SCHOOL_PRIORITY_V1_POLICY,
  resolvePriorityScoringProfile,
  schoolComplaintCoveragePeriod
} from './services/priorityScoringProfiles.js';
import { PriorityScoringService } from './services/priorityScoringService.js';

const infrastructureId = '507f1f77bcf86cd799439021';
const reviewDocumentId = '507f1f77bcf86cd799439022';
const submitterId = '507f1f77bcf86cd799439023';
const reviewerId = '507f1f77bcf86cd799439024';
const sourceKey = 'TEST_ONLY:SCHOOL_PRIORITY_V1:CONTROLLED_FIXTURE';
const databaseStateBefore = mongoose.connection.readyState;
assert.equal(databaseStateBefore, 0, 'controlled validation must start without a MongoDB connection');

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (value instanceof mongoose.Types.ObjectId) return new mongoose.Types.ObjectId(value.toHexString()) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)])) as T;
  }
  return value;
}

const now = new Date();
const currentDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const maintenanceDate = new Date(Date.UTC(currentDate.getUTCFullYear() - 3, currentDate.getUTCMonth(), currentDate.getUTCDate()));
const dateString = (date: Date) => date.toISOString().slice(0, 10);

const fixtureAsset: EvidenceInfrastructure = {
  _id: infrastructureId,
  panchayatId: '507f1f77bcf86cd799439025',
  sourceKey,
  dataOrigin: 'SOURCE_EXCEL',
  type: 'School',
  condition: null,
  complaintsCount: null,
  populationServed: null,
  trafficLevel: null,
  lastMaintenanceDate: null,
  alternativeDistanceKm: null,
  coordinateSource: 'FIELD_SURVEY',
  coordinateStatus: 'VERIFIED',
  coordinatesVerified: true
};

class MemoryEvidenceRepository implements EvidenceWorkflowRepository {
  readonly infrastructure = clone(fixtureAsset);
  documents: EvidenceWorkflowDocument[] = [];

  async findInfrastructure(id: string) {
    return id === infrastructureId ? clone(this.infrastructure) : null;
  }

  async findEvidenceDocuments(id: string) {
    return clone(this.documents.filter((document) => document.infrastructureId === id));
  }

  async findEvidenceDocument(id: string, evidenceId: string) {
    const document = this.documents.find((entry) => entry.infrastructureId === id && entry._id === evidenceId);
    return document ? clone(document) : null;
  }

  async saveEvidenceDocument(input: Omit<EvidenceWorkflowDocument, '_id' | 'createdAt' | 'updatedAt'> & { _id?: string }) {
    const timestamp = new Date();
    const existing = this.documents.find((entry) => entry._id === input._id);
    const saved = clone({
      ...input,
      _id: input._id || reviewDocumentId,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp
    }) as EvidenceWorkflowDocument;
    if (existing) this.documents[this.documents.indexOf(existing)] = saved;
    else this.documents.push(saved);
    return clone(saved);
  }
}

const repository = new MemoryEvidenceRepository();
const mutableProfiles = [...APPROVED_PRIORITY_SCORING_PROFILES];
const workflow = createPriorityEvidenceWorkflowService(repository, { profiles: mutableProfiles });
const submitter = { id: submitterId, role: 'pdo' as const };
const reviewer = { id: reviewerId, role: 'admin' as const };
const reviewPeriod = schoolComplaintCoveragePeriod(new Date())!;
const observedAt = new Date().toISOString();

const submissions: EvidenceFactorSubmission[] = [
  {
    sourceKey, factor: 'condition', value: 'Needs_Maintenance', unit: 'category',
    sourceName: 'TEST ONLY controlled fixture', sourceRecordReference: 'TEST ONLY condition evidence',
    observedAt, referencePeriod: 'TEST ONLY', derivationKind: 'DIRECT', confidence: 'HIGH', notes: 'TEST ONLY; not a real facility claim.'
  },
  {
    sourceKey, factor: 'populationServed', value: 750, unit: 'students',
    sourceName: 'TEST ONLY controlled fixture', sourceRecordReference: 'TEST ONLY population evidence',
    observedAt, referencePeriod: 'TEST ONLY academic period', derivationKind: 'DIRECT', confidence: 'HIGH', notes: 'TEST ONLY; not a real facility claim.'
  },
  {
    sourceKey, factor: 'trafficLevel', value: 75, unit: 'percent',
    sourceName: 'TEST ONLY controlled fixture', sourceRecordReference: 'TEST ONLY utilization evidence',
    observedAt, referencePeriod: 'TEST ONLY academic period', derivationKind: 'CALCULATED',
    derivationMethod: 'TEST ONLY: 750 / 1000 × 100', confidence: 'HIGH', notes: 'TEST ONLY; not a real facility claim.',
    utilizationMeasurement: {
      observedValue: 750, unit: 'students', denominator: 1000, denominatorUnit: 'sanctioned_student_capacity',
      thresholdReference: SCHOOL_PRIORITY_V1_POLICY.thresholdReference,
      numeratorReferencePeriod: 'TEST ONLY academic period', denominatorReferencePeriod: 'TEST ONLY academic period'
    }
  },
  {
    sourceKey, factor: 'complaintsCount', value: 3, unit: 'complaints',
    sourceName: 'TEST ONLY controlled fixture', sourceRecordReference: 'TEST ONLY complaint register coverage',
    observedAt, referencePeriod: reviewPeriod, derivationKind: 'DIRECT', confidence: 'HIGH', notes: 'TEST ONLY; not a real facility claim.',
    complaintCoverage: {
      reportingPeriod: reviewPeriod, coveredChannels: 'TEST ONLY complete fixture channels',
      coverageConfirmed: true, includedStatuses: 'TEST ONLY all statuses'
    }
  },
  {
    sourceKey, factor: 'lastMaintenanceDate', value: dateString(maintenanceDate), unit: 'date',
    sourceName: 'TEST ONLY controlled fixture', sourceRecordReference: 'TEST ONLY completed maintenance evidence',
    observedAt, referencePeriod: 'TEST ONLY', derivationKind: 'DIRECT', confidence: 'HIGH', notes: 'TEST ONLY; not a real facility claim.',
    maintenanceEvidence: {
      qualifyingWorkType: 'TEST ONLY qualifying maintenance', actualCompletionConfirmed: true,
      completionEvidenceReference: 'TEST ONLY completion record'
    }
  },
  {
    sourceKey, factor: 'alternativeDistanceKm', value: 5, unit: 'km',
    sourceName: 'TEST ONLY controlled fixture', sourceRecordReference: 'TEST ONLY network distance evidence',
    observedAt, referencePeriod: 'TEST ONLY', derivationKind: 'CALCULATED',
    derivationMethod: 'TEST ONLY versioned network-distance calculation', confidence: 'HIGH', notes: 'TEST ONLY; not a real facility claim.',
    geospatialEvidence: {
      assetCoordinatesVerified: true, alternativeCoordinatesVerified: true,
      alternativeReference: 'TEST ONLY equivalent school', distanceMethod: 'TEST ONLY network route',
      distanceMetric: 'NETWORK_TRAVEL', providerName: 'TEST ONLY provider', providerVersion: '1'
    }
  }
];

const expectedScores: Record<PriorityEvidenceFactor, { normalized: number; weight: number; contribution: number }> = {
  condition: { normalized: 65, weight: 0.30, contribution: 19.5 },
  populationServed: { normalized: 60, weight: 0.20, contribution: 12 },
  trafficLevel: { normalized: 60, weight: 0.15, contribution: 9 },
  complaintsCount: { normalized: 60, weight: 0.15, contribution: 9 },
  lastMaintenanceDate: { normalized: 75, weight: 0.10, contribution: 7.5 },
  alternativeDistanceKm: { normalized: 80, weight: 0.10, contribution: 8 }
};

for (const submission of submissions) {
  const created = await workflow.create(infrastructureId, submission, submitter);
  const factor = created.factors.find((entry) => entry.factor === submission.factor)!;
  assert.equal(factor.verificationStatus, 'PENDING', `${submission.factor} begins PENDING`);
  const evidenceId = created.id;

  const submitted = await workflow.submit(infrastructureId, evidenceId, submission.factor, submitter);
  assert.equal(submitted.factors.find((entry) => entry.factor === submission.factor)?.verificationStatus, 'PENDING');
  assert.ok(submitted.factors.find((entry) => entry.factor === submission.factor)?.submittedAt);

  const accepted = await workflow.review(infrastructureId, evidenceId, submission.factor, 'ACCEPTED', reviewer);
  assert.equal(accepted.factors.find((entry) => entry.factor === submission.factor)?.verificationStatus, 'ACCEPTED');
  assert.ok(accepted.factors.find((entry) => entry.factor === submission.factor)?.reviewedAt);
}

const factorsAcceptedReadiness = await workflow.list(infrastructureId, submitter);
assert.equal(factorsAcceptedReadiness.readiness.readyForScoring, false, 'accepted factors alone cannot score without scope/profile approvals');
assert.equal(factorsAcceptedReadiness.readiness.status, 'UNRESOLVED');
const evidenceId = repository.documents[0]._id!;
const acceptedScope = await workflow.approveAssetScope(infrastructureId, evidenceId, {
  scopeClass: 'INDIVIDUAL_ASSET', resolvedSubtype: 'Secondary School'
}, reviewer);
assert.equal(acceptedScope.assetScopeReview.status, 'ACCEPTED');
assert.equal(acceptedScope.profileReview.status, 'PENDING');
assert.equal(acceptedScope.readiness.readyForScoring, false, 'scope approval without profile review cannot score');
assert.equal(acceptedScope.assetScopeReview.reviewedBy, reviewerId, 'admin scope reviewer identity is auditable');
assert.ok(acceptedScope.assetScopeReview.reviewedAt, 'scope review timestamp is stored and returned');
const profileReviewed = await workflow.approveProfileReview(infrastructureId, evidenceId, reviewer);
assert.equal(profileReviewed.profileReview.status, 'ACCEPTED');
assert.equal(profileReviewed.profileReview.profileId, 'SCHOOL_PRIORITY_V1');
assert.equal(profileReviewed.profileReview.profileVersion, '1.0.0');
assert.equal(profileReviewed.profileReview.reviewedBy, reviewerId, 'admin profile reviewer identity is auditable');
assert.ok(profileReviewed.profileReview.reviewedAt, 'profile review timestamp is stored and returned');
const fullDocument = clone(repository.documents[0]);
const readiness = await workflow.list(infrastructureId, submitter);
assert.equal(readiness.readiness.readyForScoring, true);
assert.equal(readiness.readiness.status, 'READY');
assert.deepEqual([...readiness.readiness.readyFactors].sort(), [...SCHOOL_PRIORITY_V1_PROFILE.applicableFactors].sort());
assert.deepEqual(readiness.readiness.missingFactors, []);
assert.equal(readiness.items[0].scoringProfile?.profileId, 'SCHOOL_PRIORITY_V1');
assert.equal(readiness.items[0].scoringProfile?.profileVersion, '1.0.0');
assert.ok(readiness.items[0].factors.every((factor) => factor.verificationStatus === 'ACCEPTED'));
assert.equal('reviewedBy' in readiness.items[0].assetScopeReview, false, 'scope reviewer identity is hidden from PDO response');
assert.equal('reviewedBy' in readiness.items[0].profileReview, false, 'profile reviewer identity is hidden from PDO response');
const adminEvidence = await workflow.details(infrastructureId, fullDocument._id!, reviewer);
assert.equal(adminEvidence.assetScopeReview.reviewedBy, reviewerId);
assert.equal(adminEvidence.profileReview.reviewedBy, reviewerId);

const mockedModel = PriorityEvidence as unknown as {
  find: (filter: unknown) => { lean: () => Promise<PriorityEvidenceDoc[]> }
};
const originalFind = mockedModel.find;
let documentsForScoring = [fullDocument as unknown as PriorityEvidenceDoc];
mockedModel.find = () => ({ lean: async () => clone(documentsForScoring) });

const scoringAsset = {
  ...fixtureAsset,
  _id: new mongoose.Types.ObjectId(infrastructureId),
  panchayatId: new mongoose.Types.ObjectId(fixtureAsset.panchayatId),
  name: 'TEST ONLY Controlled School Fixture',
  location: { type: 'Point', coordinates: [74.85, 12.87] },
  priorityScorable: true
} as unknown as InfrastructureDoc;

let actualScore: Awaited<ReturnType<typeof PriorityScoringService.getAssetPriorityResult>>;
try {
  actualScore = await PriorityScoringService.getAssetPriorityResult(scoringAsset);
  assert.equal(actualScore.scoringStatus, 'SCORED');
  assert.equal(actualScore.scoringProfile.profileId, 'SCHOOL_PRIORITY_V1');
  assert.equal(actualScore.scoringProfile.profileVersion, '1.0.0');
  assert.equal(actualScore.priorityScore, 65);
  assert.equal(actualScore.priorityLevel, 'High');
  const serviceReadiness = await PriorityScoringService.getEvidenceReadiness(scoringAsset);
  assert.equal(serviceReadiness.readyForScoring, true, 'the shared scoring-service readiness query resolves the active matching profile');
  assert.equal(serviceReadiness.policyProfileId, 'SCHOOL_PRIORITY_V1');

  for (const [factor, expected] of Object.entries(expectedScores) as Array<[PriorityEvidenceFactor, typeof expectedScores[PriorityEvidenceFactor]]>) {
    const actual = actualScore.explanation && 'profileId' in actualScore.explanation
      ? actualScore.explanation.factors[factor]
      : undefined;
    assert.equal(actual?.normalizedScore, expected.normalized, `${factor} normalized score`);
    assert.equal(actual?.weight, expected.weight, `${factor} approved weight`);
    assert.equal(actual?.contribution, expected.contribution, `${factor} weighted contribution`);
  }

  for (const missingFactor of SCHOOL_PRIORITY_V1_PROFILE.applicableFactors) {
    const incomplete = clone(fullDocument);
    incomplete.factors = incomplete.factors.filter((entry) => entry.factor !== missingFactor);
    documentsForScoring = [incomplete as unknown as PriorityEvidenceDoc];
    const blocked = await PriorityScoringService.getAssetPriorityResult(scoringAsset);
    assert.equal(blocked.scoringStatus, 'UNAVAILABLE', `${missingFactor} missing blocks scoring`);
    assert.equal(blocked.priorityScore, null, `${missingFactor} missing produces no score`);
    assert.equal(blocked.factorReadiness.find((entry) => entry.factor === missingFactor)?.state, 'APPLICABLE_MISSING');
    assert.ok(blocked.priorityAvailability.missingScoringInputs.some((entry) => entry.code === missingFactor),
      `${missingFactor} is explicitly reported as missing`);
  }

  const approximateAsset = { ...scoringAsset, coordinatesVerified: false, coordinateStatus: 'APPROXIMATE', coordinateSource: 'PUBLIC_MAP_APPROXIMATE' } as unknown as InfrastructureDoc;
  documentsForScoring = [fullDocument as unknown as PriorityEvidenceDoc];
  const approximateResult = await PriorityScoringService.getAssetPriorityResult(approximateAsset);
  assert.equal(approximateResult.scoringStatus, 'UNAVAILABLE', 'approximate coordinates cannot satisfy accessibility evidence');
  assert.equal(approximateResult.factorReadiness.find((entry) => entry.factor === 'alternativeDistanceKm')?.state, 'APPLICABLE_MISSING');

  const invalidCases: Array<[string, (document: EvidenceWorkflowDocument) => void, PriorityEvidenceFactor]> = [
    ['generic population without a reference period', (document) => {
      document.factors.find((entry) => entry.factor === 'populationServed')!.referencePeriod = undefined;
    }, 'populationServed'],
    ['enrollment without sanctioned capacity', (document) => {
      document.factors.find((entry) => entry.factor === 'trafficLevel')!.utilizationMeasurement!.denominator = 0;
    }, 'trafficLevel'],
    ['maintenance without confirmed completed work', (document) => {
      document.factors.find((entry) => entry.factor === 'lastMaintenanceDate')!.maintenanceEvidence!.actualCompletionConfirmed = false;
    }, 'lastMaintenanceDate'],
    ['complaint absence without coverage evidence', (document) => {
      document.factors.find((entry) => entry.factor === 'complaintsCount')!.complaintCoverage!.coverageConfirmed = false;
    }, 'complaintsCount']
  ];
  for (const [label, invalidate, factor] of invalidCases) {
    const invalid = clone(fullDocument);
    invalidate(invalid);
    documentsForScoring = [invalid as unknown as PriorityEvidenceDoc];
    const blocked = await PriorityScoringService.getAssetPriorityResult(scoringAsset);
    assert.equal(blocked.scoringStatus, 'UNAVAILABLE', `${label} cannot produce a score`);
    assert.equal(blocked.priorityScore, null);
    assert.notEqual(blocked.factorReadiness.find((entry) => entry.factor === factor)?.state, 'READY');
  }

  // Simulate the approved profile becoming unavailable after a historically valid review.
  // The workflow's list/details paths resolve against this mutable test registry.
  mutableProfiles.splice(0, mutableProfiles.length);
  const staleProfileReadiness = await workflow.list(infrastructureId, submitter);
  assert.equal(staleProfileReadiness.readiness.readyForScoring, false,
    'a previously approved School V1 review cannot remain ready when profile resolution becomes unavailable');
  assert.equal(staleProfileReadiness.readiness.status, 'PROFILE_UNAVAILABLE');
  assert.equal(staleProfileReadiness.readiness.profileResolved, false);
  const staleProfileDetails = await workflow.details(infrastructureId, fullDocument._id!, submitter);
  assert.equal(staleProfileDetails.readiness.readyForScoring, false,
    'workflow detail must fail closed when the active profile no longer resolves');
  assert.equal(staleProfileDetails.readiness.status, 'PROFILE_UNAVAILABLE');

  documentsForScoring = [fullDocument as unknown as PriorityEvidenceDoc];
  const noProfileScore = await PriorityScoringService.getAssetPriorityResult({
    ...scoringAsset, type: 'Road'
  } as unknown as InfrastructureDoc);
  assert.equal(noProfileScore.scoringStatus, 'UNAVAILABLE', 'an infrastructure type without an active profile cannot score');
  assert.equal(noProfileScore.priorityScore, null);
  const noProfileReadiness = await PriorityScoringService.getEvidenceReadiness({
    ...scoringAsset, type: 'Road'
  } as unknown as InfrastructureDoc);
  assert.equal(noProfileReadiness.readyForScoring, false, 'the scoring-service readiness query also fails closed without a profile');
  assert.equal(noProfileReadiness.status, 'PROFILE_UNAVAILABLE');
  assert.equal(noProfileReadiness.profileResolved, false);

  const staleReview = clone(fullDocument);
  staleReview.policyProfileId = 'RETIRED_PROFILE';
  documentsForScoring = [staleReview as unknown as PriorityEvidenceDoc];
  const mismatchedProfileScore = await PriorityScoringService.getAssetPriorityResult(scoringAsset);
  assert.equal(mismatchedProfileScore.scoringStatus, 'UNAVAILABLE', 'a mismatched approved profile cannot score');
  assert.equal(mismatchedProfileScore.priorityScore, null);
  const mismatchedReadiness = await PriorityScoringService.getEvidenceReadiness(scoringAsset);
  assert.equal(mismatchedReadiness.readyForScoring, false, 'mismatched approved profile also fails readiness');
} finally {
  mockedModel.find = originalFind;
}

assert.equal(resolvePriorityScoringProfile({ type: 'School' }).profile?.profileId, 'SCHOOL_PRIORITY_V1');
assert.equal(resolvePriorityScoringProfile({ type: 'Road' }).profile, null);
assert.equal(resolvePriorityScoringProfile({ type: 'Healthcare' }).profile, null);
assert.equal(resolvePriorityScoringProfile({ type: 'WaterFacility' }).profile, null);
assert.equal(resolvePriorityScoringProfile({ type: 'Other' }).profile, null);
assert.deepEqual(APPROVED_PRIORITY_SCORING_PROFILES.map((profile) => profile.profileId), ['SCHOOL_PRIORITY_V1']);
assert.equal(mongoose.connection.readyState, databaseStateBefore, 'workflow and scoring validation leave database connection state unchanged');
assert.equal(repository.documents.length, 1, 'the controlled evidence lifecycle exists only in the in-memory repository');
assert.equal(repository.documents[0].factors.length, 6, 'only the six TEST ONLY fixture factors were created');

console.log('PASS: SCHOOL_PRIORITY_V1 evidence lifecycle, explicit scope/profile approvals, readiness, exact score/contributions, missing-factor blockers, coordinate/data-quality gates, profile isolation, and zero database connection.');
