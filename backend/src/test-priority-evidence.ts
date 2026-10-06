import assert from 'node:assert/strict';
import { PriorityEvidence } from './models/PriorityEvidence.js';
import {
  evaluatePriorityEvidenceReadiness,
  type PriorityEvidenceInput,
  type PriorityEvidenceRecordInput
} from './services/priorityEvidenceReadiness.js';
import {
  DEFAULT_LIMITS,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  getPriorityAvailability,
  PriorityScoringService
} from './services/priorityScoringService.js';
import {
  SCHOOL_PRIORITY_V1_PROFILE,
  schoolComplaintCoveragePeriod
} from './services/priorityScoringProfiles.js';

const verifiedAsset = {
  dataOrigin: 'SOURCE_EXCEL',
  sourceKey: 'source-school-1',
  type: 'School',
  condition: null,
  complaintsCount: null,
  populationServed: null,
  trafficLevel: null,
  lastMaintenanceDate: null,
  alternativeDistanceKm: null,
  location: { type: 'Point', coordinates: [74.85, 12.87] },
  coordinatesVerified: true,
  coordinateSource: 'FIELD_SURVEY',
  coordinateStatus: 'VERIFIED'
};

const reviewer = '507f1f77bcf86cd799439011';
const reviewDate = new Date('2026-10-05T00:00:00.000Z');
const scopeReady = {
  sourceKey: 'source-school-1',
  scopeClass: 'INDIVIDUAL_ASSET' as const,
  scopeVerificationStatus: 'ACCEPTED' as const,
  resolvedSubtype: 'Primary school',
  policyProfileId: SCHOOL_PRIORITY_V1_PROFILE.profileId,
  policyProfileVersion: SCHOOL_PRIORITY_V1_PROFILE.profileVersion,
  policyProfileStatus: 'ACCEPTED' as const,
  policyProfileReviewedBy: reviewer,
  policyProfileReviewedAt: reviewDate,
  reviewedBy: reviewer,
  reviewedAt: reviewDate
};

function evidence(factor: PriorityEvidenceInput['factor'], value: unknown, extra: Partial<PriorityEvidenceInput> = {}): PriorityEvidenceInput {
  const units = {
    condition: 'category',
    complaintsCount: 'complaints',
    populationServed: 'persons',
    trafficLevel: 'ordinal',
    lastMaintenanceDate: 'date',
    alternativeDistanceKm: 'km'
  } as const;
  const defaults: Partial<PriorityEvidenceInput> = {};
  if (factor === 'complaintsCount') {
    defaults.complaintCoverage = {
      reportingPeriod: '2026',
      coveredChannels: 'RDMT infrastructure complaint register',
      coverageConfirmed: true,
      includedStatuses: 'SUBMITTED through VERIFIED'
    };
  }
  if (factor === 'trafficLevel') {
    defaults.utilizationMeasurement = {
      observedValue: 50,
      unit: 'visits/month',
      denominator: 100,
      denominatorUnit: 'visits/month capacity',
      thresholdReference: 'approved-school-profile-thresholds-v1'
    };
  }
  if (factor === 'lastMaintenanceDate') {
    defaults.maintenanceEvidence = {
      qualifyingWorkType: 'Preventive maintenance',
      actualCompletionConfirmed: true,
      completionEvidenceReference: 'completed-work-order-1'
    };
  }
  if (factor === 'alternativeDistanceKm') {
    defaults.geospatialEvidence = {
      assetCoordinatesVerified: true,
      alternativeCoordinatesVerified: true,
      alternativeReference: 'Alternative school test id',
      distanceMethod: 'Versioned road-network route',
      distanceMetric: 'NETWORK_TRAVEL',
      providerName: 'Test routing provider',
      providerVersion: 'test-v1'
    };
  }
  return {
    factor,
    value,
    unit: units[factor],
    applicability: 'APPLICABLE',
    sourceName: 'Approved test evidence source',
    sourceRecordReference: `test-${factor}-record`,
    observedAt: reviewDate,
    referencePeriod: '2026',
    derivationKind: 'DIRECT',
    confidence: 'HIGH',
    verificationStatus: 'ACCEPTED',
    reviewedBy: reviewer,
    reviewedAt: reviewDate,
    current: true,
    ...defaults,
    ...extra
  };
}

const acceptedFactors: PriorityEvidenceInput[] = [
  evidence('condition', 'Good'),
  evidence('complaintsCount', 0),
  evidence('populationServed', 120),
  evidence('trafficLevel', 'Low'),
  evidence('lastMaintenanceDate', new Date('2025-01-01T00:00:00.000Z')),
  evidence('alternativeDistanceKm', 2)
];

// Factor states distinguish absent, pending, rejected, accepted, and non-applicable evidence.
const missing = evaluatePriorityEvidenceReadiness(verifiedAsset);
assert.equal(missing.factors[0].state, 'APPLICABLE_MISSING');
assert.deepEqual(missing.missingFactors, [
  'condition', 'complaintsCount', 'populationServed', 'trafficLevel', 'lastMaintenanceDate', 'alternativeDistanceKm'
]);

assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  factors: [evidence('condition', 'Good', { verificationStatus: 'PENDING', reviewedBy: undefined, reviewedAt: undefined })]
}).factors[0].state, 'PENDING_VERIFICATION');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  factors: [evidence('condition', 'Good', { verificationStatus: 'REJECTED' })]
}).factors[0].state, 'REJECTED');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  factors: [evidence('condition', 'Good', { sourceUrl: 'https://user:secret@example.gov/evidence?token=hidden#fragment' })]
}).factors[0].state, 'READY');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  factors: [evidence('condition', 'Good', { sourceUrl: 'https://user:secret@example.gov/evidence?token=hidden#fragment' })]
}).factors[0].provenance?.sourceUrl, 'https://example.gov/evidence', 'public provenance removes URL credentials/query/fragment');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  factors: [evidence('populationServed', Number.POSITIVE_INFINITY)]
}).factors[2].state, 'APPLICABLE_MISSING', 'non-finite values cannot satisfy evidence readiness');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  factors: [evidence('populationServed', 12.5)]
}).factors[2].state, 'APPLICABLE_MISSING', 'student/person counts must be whole numbers');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  factors: [evidence('complaintsCount', 1.5)]
}).factors[1].state, 'APPLICABLE_MISSING', 'complaint counts must be whole numbers');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  factors: [evidence('condition', 'Needs_Maintenance')]
}).factors[0].state, 'READY', 'owner-approved Needs_Maintenance condition value is accepted');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  factors: [evidence('populationServed', 100, { derivationKind: 'CALCULATED', derivationMethod: '' })]
}).factors[2].state, 'APPLICABLE_MISSING', 'calculated evidence requires a reproducible method');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  factors: [evidence('complaintsCount', 0, { complaintCoverage: undefined })]
}).factors[1].state, 'APPLICABLE_MISSING', 'an empty complaint result is not a confirmed zero without coverage evidence');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  factors: [evidence('complaintsCount', 0, { referencePeriod: '2025', complaintCoverage: {
    reportingPeriod: '2026', coveredChannels: 'complete test channel', coverageConfirmed: true
  } })]
}).factors[1].state, 'APPLICABLE_MISSING', 'complaint period must match its declared coverage period');

const notApplicable = evaluatePriorityEvidenceReadiness(verifiedAsset, {
  factors: [evidence('condition', null, { applicability: 'NOT_APPLICABLE' })]
});
assert.equal(notApplicable.factors[0].state, 'NOT_APPLICABLE');
assert.deepEqual(notApplicable.notApplicableFactors, ['condition']);
assert.equal(notApplicable.readyForScoring, false, 'N/A is not coerced to numeric zero or omitted from the fixed formula');

const aggregate = evaluatePriorityEvidenceReadiness(verifiedAsset, {
  sourceKey: 'source-school-1',
  scopeClass: 'AGGREGATE_OR_NETWORK',
  scopeVerificationStatus: 'ACCEPTED',
  reviewedBy: reviewer,
  reviewedAt: reviewDate
});
assert.equal(aggregate.status, 'AGGREGATE_OR_NETWORK');
assert.equal(aggregate.readyForScoring, false);

const unresolvedOther = evaluatePriorityEvidenceReadiness({ type: 'Other' });
assert.equal(unresolvedOther.status, 'LACKING_SUBTYPE_OR_ASSET_SCOPE');
assert.equal(unresolvedOther.factors[0].state, 'UNRESOLVED');
assert.equal(evaluatePriorityEvidenceReadiness({ type: 'UnknownType' }).readyForScoring, false,
  'unknown infrastructure types cannot use a generic factor profile');

const approximateAsset = {
  ...verifiedAsset,
  coordinatesVerified: false,
  coordinateSource: 'PUBLIC_MAP_APPROXIMATE',
  coordinateStatus: 'APPROXIMATE'
};
const approximateDistance = evaluatePriorityEvidenceReadiness(approximateAsset, {
  factors: [acceptedFactors.find((factor) => factor.factor === 'alternativeDistanceKm')!]
});
assert.equal(approximateDistance.factors[5].state, 'APPLICABLE_MISSING');
assert.equal(approximateDistance.readyForScoring, false);

const schoolReviewDate = new Date('2026-10-05T00:00:00.000Z');
const schoolComplaintPeriod = schoolComplaintCoveragePeriod(schoolReviewDate)!;
const completeSchoolReview: PriorityEvidenceRecordInput = {
  ...scopeReady,
  policyProfileId: SCHOOL_PRIORITY_V1_PROFILE.profileId,
  policyProfileVersion: SCHOOL_PRIORITY_V1_PROFILE.profileVersion,
  factors: [
    evidence('condition', 'Good', { observedAt: schoolReviewDate, reviewedAt: schoolReviewDate }),
    evidence('complaintsCount', 0, {
      observedAt: schoolReviewDate, reviewedAt: schoolReviewDate, referencePeriod: schoolComplaintPeriod,
      complaintCoverage: { reportingPeriod: schoolComplaintPeriod, coveredChannels: 'complete test coverage', coverageConfirmed: true }
    }),
    evidence('populationServed', 120, { unit: 'students', observedAt: schoolReviewDate, reviewedAt: schoolReviewDate, referencePeriod: '2026-2027' }),
    evidence('trafficLevel', 50, {
      unit: 'percent', observedAt: schoolReviewDate, reviewedAt: schoolReviewDate, referencePeriod: '2026-2027',
      utilizationMeasurement: {
        observedValue: 50, unit: 'students', denominator: 100, denominatorUnit: 'sanctioned_student_capacity',
        thresholdReference: 'SCHOOL_PRIORITY_V1_1.0.0', numeratorReferencePeriod: '2026-2027', denominatorReferencePeriod: '2026-2027'
      }
    }),
    evidence('lastMaintenanceDate', new Date('2025-01-01T00:00:00.000Z'), {
      observedAt: schoolReviewDate, reviewedAt: schoolReviewDate
    }),
    evidence('alternativeDistanceKm', 2, { observedAt: schoolReviewDate, reviewedAt: schoolReviewDate })
  ]
};

// Readiness is fail-closed unless the current applicable active profile resolves and matches review identity.
const noProfileReadiness = evaluatePriorityEvidenceReadiness(verifiedAsset, completeSchoolReview, undefined);
assert.equal(noProfileReadiness.readyForScoring, false, 'no profile cannot produce readyForScoring');
assert.equal(noProfileReadiness.status, 'PROFILE_UNAVAILABLE');
assert.equal(noProfileReadiness.profileResolved, false);
const inactiveProfileReadiness = evaluatePriorityEvidenceReadiness(verifiedAsset, completeSchoolReview, {
  ...SCHOOL_PRIORITY_V1_PROFILE, status: 'DEPRECATED'
});
assert.equal(inactiveProfileReadiness.readyForScoring, false, 'inactive profile cannot produce readiness');
assert.equal(inactiveProfileReadiness.status, 'PROFILE_UNAVAILABLE');
assert.equal(inactiveProfileReadiness.profileResolved, false);
const mismatchedProfileId = evaluatePriorityEvidenceReadiness(verifiedAsset, {
  ...completeSchoolReview, policyProfileId: 'OTHER_PROFILE'
}, SCHOOL_PRIORITY_V1_PROFILE);
assert.equal(mismatchedProfileId.readyForScoring, false, 'approved profile ID must match active profile');
const mismatchedProfileVersion = evaluatePriorityEvidenceReadiness(verifiedAsset, {
  ...completeSchoolReview, policyProfileVersion: '0.9.0'
}, SCHOOL_PRIORITY_V1_PROFILE);
assert.equal(mismatchedProfileVersion.readyForScoring, false, 'approved profile version must match active profile');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, null, SCHOOL_PRIORITY_V1_PROFILE).readyForScoring, false,
  'missing review cannot satisfy scope/profile approvals');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  ...completeSchoolReview, scopeVerificationStatus: 'PENDING'
}, SCHOOL_PRIORITY_V1_PROFILE).readyForScoring, false, 'missing asset-scope approval blocks readiness');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  ...completeSchoolReview, factors: completeSchoolReview.factors!.filter((factor) => factor.factor !== 'condition')
}, SCHOOL_PRIORITY_V1_PROFILE).readyForScoring, false, 'missing required evidence blocks readiness');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  ...completeSchoolReview, factors: completeSchoolReview.factors!.map((factor) => factor.factor === 'condition'
    ? { ...factor, verificationStatus: 'REJECTED' as const } : factor)
}, SCHOOL_PRIORITY_V1_PROFILE).readyForScoring, false, 'rejected evidence blocks readiness');

const validAllFactors = evaluatePriorityEvidenceReadiness(verifiedAsset, completeSchoolReview, SCHOOL_PRIORITY_V1_PROFILE);
assert.equal(validAllFactors.readyForScoring, true);
assert.equal(validAllFactors.status, 'READY', 'matching active approved profile and complete factors are ready');
assert.equal(validAllFactors.profileResolved, true);
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  ...completeSchoolReview, scopeClass: 'UNRESOLVED', scopeVerificationStatus: 'PENDING'
}).readyForScoring, false, 'accepted factors plus profile review cannot score without accepted asset scope');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, {
  ...completeSchoolReview, policyProfileStatus: 'PENDING', policyProfileReviewedBy: undefined, policyProfileReviewedAt: undefined
}).readyForScoring, false, 'accepted factors and scope cannot score without explicit profile review');
assert.equal(evaluatePriorityEvidenceReadiness(verifiedAsset, { ...completeSchoolReview, sourceKey: 'wrong-source-key' }, SCHOOL_PRIORITY_V1_PROFILE).readyForScoring, false,
  'evidence review cannot be reused for a different source identity');
assert.equal('reviewedBy' in (validAllFactors.factors[0].provenance || {}), false,
  'public readiness provenance does not expose reviewer identity');
const schoolStudentPopulation = evidence('populationServed', 120, { unit: 'students' });
const schoolUnitReadiness = evaluatePriorityEvidenceReadiness(verifiedAsset, {
  ...scopeReady,
  policyProfileId: SCHOOL_PRIORITY_V1_PROFILE.profileId,
  policyProfileVersion: SCHOOL_PRIORITY_V1_PROFILE.profileVersion,
  factors: [schoolStudentPopulation]
}, SCHOOL_PRIORITY_V1_PROFILE);
assert.equal(schoolUnitReadiness.factors.find((entry) => entry.factor === 'populationServed')?.state, 'READY',
  'School V1 population evidence uses students');
const invalidSchoolUnitReadiness = evaluatePriorityEvidenceReadiness(verifiedAsset, {
  ...scopeReady,
  policyProfileId: SCHOOL_PRIORITY_V1_PROFILE.profileId,
  policyProfileVersion: SCHOOL_PRIORITY_V1_PROFILE.profileVersion,
  factors: [evidence('populationServed', 120, { unit: 'persons' })]
}, SCHOOL_PRIORITY_V1_PROFILE);
assert.equal(invalidSchoolUnitReadiness.factors.find((entry) => entry.factor === 'populationServed')?.state, 'APPLICABLE_MISSING',
  'persons cannot satisfy School V1 population evidence');
const scoreInput = PriorityScoringService.applyAcceptedEvidence({
  ...verifiedAsset,
  lastRepairDate: new Date('2020-01-01T00:00:00.000Z')
}, validAllFactors);
assert.equal(scoreInput.condition, 'Good');
assert.equal(scoreInput.complaintsCount, 0);
assert.equal(scoreInput.populationServed, 120);
assert.equal(scoreInput.trafficLevel, 50, 'School utilization remains a fractional percentage input');
assert.equal(scoreInput.lastMaintenanceDate.toISOString(), '2025-01-01T00:00:00.000Z');
assert.equal(scoreInput.lastRepairDate, undefined, 'accepted maintenance evidence cannot be shadowed by the legacy repair-date field');
assert.equal(scoreInput.alternativeDistanceKm, 2);
assert.equal(getPriorityAvailability({ dataOrigin: 'SOURCE_EXCEL', priorityScorable: true }, validAllFactors).eligible, false,
  'complete evidence still cannot score without an active approved type profile');
assert.equal(getPriorityAvailability({ dataOrigin: 'SOURCE_EXCEL', priorityScorable: true }, validAllFactors).reasonCode, 'SCORING_PROFILE_UNAVAILABLE');
assert.equal(getPriorityAvailability({ dataOrigin: 'SOURCE_EXCEL', priorityScorable: false }, validAllFactors).eligible, false,
  'accepted evidence does not mutate or bypass the explicit source eligibility flag');
assert.equal(getPriorityAvailability({ dataOrigin: 'SOURCE_EXCEL', priorityScorable: true }).eligible, false,
  'the flag alone is not sufficient for source records');

const importedUnscored = getPriorityAvailability({ dataOrigin: 'SOURCE_EXCEL', priorityScorable: false });
assert.equal(importedUnscored.eligible, false);
assert.equal(importedUnscored.evidenceReadiness.readyForScoring, false,
  'records without evidence remain unavailable');
const importedRecords = Array.from({ length: 100 }, () => getPriorityAvailability({
  dataOrigin: 'SOURCE_EXCEL', priorityScorable: false
}));
assert.equal(importedRecords.filter((availability) => !availability.eligible).length, 100,
  'the 100 imported records remain unavailable without evidence or flag changes');

// Existing non-source Varthur/demo eligibility and six-factor arithmetic remain unchanged.
assert.equal(getPriorityAvailability({ dataOrigin: 'LEGACY_DEMO', priorityScorable: false }).eligible, true);
assert.equal(getPriorityAvailability({ dataOrigin: 'OTHER', priorityScorable: true, priorityScore: 0 }).eligible, false,
  'the schema default score cannot bypass reviewed evidence');
assert.equal(getPriorityAvailability({ priorityScorable: true, priorityScore: 0 }).eligible, false,
  'an untagged new record with a zero default is not treated as legacy-scored');
assert.equal(getPriorityAvailability({ priorityScorable: false, priorityScore: 42.1 }).eligible, true,
  'an older untagged record with an existing persisted score retains the legacy compatibility path');
const legacyScore = PriorityScoringService.calculate({
  type: 'School',
  condition: 'Good',
  complaintsCount: 2,
  populationServed: 1000,
  trafficLevel: 'Low',
  lastMaintenanceDate: new Date(),
  alternativeDistanceKm: 2
}, { weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS, limits: DEFAULT_LIMITS });
assert.equal(legacyScore.priorityScore, 22.5);

// Schema can be inspected without connecting to MongoDB.
const factorArrayPath = PriorityEvidence.schema.path('factors') as unknown as {
  schema?: { path: (name: string) => { enumValues?: string[] } };
};
assert.deepEqual(factorArrayPath.schema?.path('verificationStatus').enumValues, ['PENDING', 'ACCEPTED', 'REJECTED']);

console.log('PASS: Priority evidence validation, scope/readiness states, coordinate safeguards, legacy eligibility, and unchanged scoring arithmetic.');
