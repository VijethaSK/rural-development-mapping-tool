import assert from 'node:assert/strict';
import type { PriorityEvidenceFactor } from './models/PriorityEvidence.js';
import {
  evaluatePriorityEvidenceReadiness,
  type PriorityEvidenceInput,
  type PriorityEvidenceRecordInput
} from './services/priorityEvidenceReadiness.js';
import {
  APPROVED_PRIORITY_SCORING_PROFILES,
  SCHOOL_PRIORITY_V1_PROFILE,
  SCHOOL_PRIORITY_V1_POLICY,
  calculateSchoolUtilizationPercent,
  normalizeSchoolUtilization,
  schoolComplaintCoveragePeriod,
  normalizeProfileFactorValue,
  calculatePriorityWithProfile,
  rankWithinScoringProfiles,
  resolvePriorityScoringProfile,
  validatePriorityScoringProfile,
  type PriorityScoringProfile,
  type ProfileRankable
} from './services/priorityScoringProfiles.js';
import { getPriorityAvailability, PriorityScoringService, DEFAULT_LIMITS, DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS } from './services/priorityScoringService.js';

const factorList: PriorityEvidenceFactor[] = [
  'condition', 'complaintsCount', 'populationServed', 'trafficLevel', 'lastMaintenanceDate', 'alternativeDistanceKm'
];
const reviewer = '507f1f77bcf86cd799439011';
const reviewedAt = new Date('2026-10-05T00:00:00.000Z');

function profile(type: PriorityScoringProfile['infrastructureType'], id = `${type.toLowerCase()}-test-v1`): PriorityScoringProfile {
  const factorDefinitions: PriorityScoringProfile['factorDefinitions'] = {
    condition: { applicability: 'APPLICABLE', semantics: 'Test fixture condition semantics', normalization: { kind: 'CATEGORY_MAP', scores: { Good: 15, Average: 55, Poor: 80, Bad: 95 } }, readinessRequirements: ['accepted condition evidence'] },
    complaintsCount: { applicability: 'APPLICABLE', semantics: 'Test fixture complaint semantics', normalization: { kind: 'LINEAR_CAP', maximum: 5 }, readinessRequirements: ['complete complaint coverage'] },
    populationServed: { applicability: 'APPLICABLE', semantics: 'Test fixture population semantics', normalization: { kind: 'LINEAR_CAP', maximum: 5000 }, readinessRequirements: ['dated people count'] },
    trafficLevel: { applicability: 'APPLICABLE', semantics: 'Test fixture utilization semantics', normalization: { kind: 'CATEGORY_MAP', scores: { Low: 20, Medium: 55, High: 90 } }, readinessRequirements: ['raw measure and denominator'] },
    lastMaintenanceDate: { applicability: 'APPLICABLE', semantics: 'Test fixture maintenance semantics', normalization: { kind: 'DATE_AGE_CAP', maximumDays: 1095 }, readinessRequirements: ['completed work date'] },
    alternativeDistanceKm: { applicability: 'APPLICABLE', semantics: 'Test fixture distance semantics', normalization: { kind: 'LINEAR_CAP', maximum: 5 }, readinessRequirements: ['verified network distance'] }
  };
  return {
    profileId: id,
    profileVersion: '1.0.0',
    infrastructureType: type,
    ...(type === 'Other' ? { subtype: 'Resolved test subtype' } : {}),
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    applicableFactors: [...factorList],
    factorWeights: { condition: 0.30, complaintsCount: 0.20, populationServed: 0.15, trafficLevel: 0.15, lastMaintenanceDate: 0.10, alternativeDistanceKm: 0.10 },
    factorDefinitions,
    thresholds: { critical: 80, high: 60, medium: 40, low: 0 },
    readinessRequirements: { requireAcceptedScope: true, requireAcceptedEvidence: true, requireProfileIdentityMatch: true }
  };
}

function evidence(factor: PriorityEvidenceFactor): PriorityEvidenceInput {
  const values: Record<PriorityEvidenceFactor, string | number | Date> = {
    condition: 'Good', complaintsCount: 0, populationServed: 100, trafficLevel: 'Low',
    lastMaintenanceDate: new Date('2025-10-01T00:00:00.000Z'), alternativeDistanceKm: 2
  };
  const units: Record<PriorityEvidenceFactor, string> = {
    condition: 'category', complaintsCount: 'complaints', populationServed: 'persons',
    trafficLevel: 'ordinal', lastMaintenanceDate: 'date', alternativeDistanceKm: 'km'
  };
  const row: PriorityEvidenceInput = {
    factor, value: values[factor], unit: units[factor], applicability: 'APPLICABLE',
    sourceName: 'Unit-test source', sourceRecordReference: `test-${factor}`, observedAt: reviewedAt,
    referencePeriod: factor === 'trafficLevel' ? '2025-2026' : '2026', derivationKind: 'DIRECT', confidence: 'HIGH', verificationStatus: 'ACCEPTED',
    reviewedBy: reviewer, reviewedAt, current: true
  };
  if (factor === 'complaintsCount') row.complaintCoverage = {
    reportingPeriod: '2026', coveredChannels: 'complete test channel', coverageConfirmed: true, includedStatuses: 'all'
  };
  if (factor === 'trafficLevel') row.utilizationMeasurement = {
    observedValue: 10, unit: 'students', denominator: 20, denominatorUnit: 'sanctioned_student_capacity',
    thresholdReference: 'SCHOOL_PRIORITY_V1_1.0.0',
    numeratorReferencePeriod: '2025-2026', denominatorReferencePeriod: '2025-2026'
  };
  if (factor === 'lastMaintenanceDate') row.maintenanceEvidence = {
    qualifyingWorkType: 'test completed work', actualCompletionConfirmed: true, completionEvidenceReference: 'test-work-order'
  };
  if (factor === 'alternativeDistanceKm') row.geospatialEvidence = {
    assetCoordinatesVerified: true, alternativeCoordinatesVerified: true, alternativeReference: 'test-comparator',
    distanceMethod: 'test network route', distanceMetric: 'NETWORK_TRAVEL', providerName: 'test', providerVersion: '1'
  };
  return row;
}

function reviewedAsset(type: string, resolvedSubtype?: string) {
  return {
    dataOrigin: 'SOURCE_EXCEL', sourceKey: `key-${type}`, type,
    ...(resolvedSubtype ? { resolvedSubtype } : {}),
    location: { type: 'Point', coordinates: [74.85, 12.87] },
    coordinatesVerified: true, coordinateSource: 'FIELD_SURVEY', coordinateStatus: 'VERIFIED'
  };
}

function reviewFor(selected: PriorityScoringProfile, asset: ReturnType<typeof reviewedAsset>, factors = factorList.map(evidence)): PriorityEvidenceRecordInput {
  return {
    sourceKey: asset.sourceKey,
    scopeClass: 'INDIVIDUAL_ASSET', scopeVerificationStatus: 'ACCEPTED',
    resolvedSubtype: asset.resolvedSubtype || `Resolved ${selected.infrastructureType} subtype`,
    policyProfileId: selected.profileId, policyProfileVersion: selected.profileVersion, policyProfileStatus: 'ACCEPTED',
    policyProfileReviewedBy: reviewer, policyProfileReviewedAt: reviewedAt,
    reviewedBy: reviewer, reviewedAt, factors
  };
}

// Valid, fully specified fixtures exercise each supported type without
// installing these unresolved policy definitions in the production catalog.
for (const type of ['Road', 'School', 'Healthcare', 'WaterFacility'] as const) {
  const selected = profile(type);
  assert.deepEqual(validatePriorityScoringProfile(selected), { valid: true, errors: [] });
  const asset = reviewedAsset(type);
  const review = reviewFor(selected, asset);
  assert.equal(resolvePriorityScoringProfile(asset, [selected]).profile?.profileId, selected.profileId);
  const readiness = evaluatePriorityEvidenceReadiness(asset, review, selected);
  assert.equal(readiness.readyForScoring, true, `${type} profile accepts all required fixture evidence`);
  assert.equal(getPriorityAvailability({ ...asset, priorityScorable: true }, readiness, selected).eligible, true,
    `${type} requires both the approved profile and accepted evidence for eligibility`);
  const result = calculatePriorityWithProfile(selected, readiness, reviewedAt);
  assert.ok(result, `${type} profile calculates only declared applicable factors`);
  assert.equal(result?.profileId, selected.profileId);
  assert.equal(result?.profileVersion, '1.0.0');
  assert.deepEqual(result?.applicableFactors, factorList);
}

const water = profile('WaterFacility');
const invalidSum = { ...water, factorWeights: { ...water.factorWeights, condition: 0.5 } };
assert.ok(validatePriorityScoringProfile(invalidSum).errors.some((error) => error.includes('sum to 1.0')));
const negativeWeight = { ...water, factorWeights: { ...water.factorWeights, condition: -0.1, complaintsCount: 0.6 } };
assert.equal(validatePriorityScoringProfile(negativeWeight).valid, false);
const unresolved = profile('Road');
unresolved.factorDefinitions.populationServed!.applicability = 'UNRESOLVED_POLICY';
assert.equal(validatePriorityScoringProfile(unresolved).valid, false, 'an unresolved factor prevents profile activation');
assert.equal(resolvePriorityScoringProfile({ type: 'School' }, [profile('Road')]).status, 'NOT_FOUND', 'no fallback to another type profile');
assert.equal(resolvePriorityScoringProfile({ type: 'Other' }, [profile('Other')]).status, 'UNRESOLVED_SUBTYPE', 'generic Other never resolves');
const otherProfile = profile('Other');
assert.equal(resolvePriorityScoringProfile({ type: 'Other', resolvedSubtype: otherProfile.subtype, scopeClass: 'INDIVIDUAL_ASSET' }, [otherProfile]).profile?.profileId, otherProfile.profileId);
assert.deepEqual(APPROVED_PRIORITY_SCORING_PROFILES.map((item) => item.profileId), ['SCHOOL_PRIORITY_V1']);
assert.equal(SCHOOL_PRIORITY_V1_PROFILE.status, 'ACTIVE');
assert.equal(SCHOOL_PRIORITY_V1_PROFILE.approvalStatus, 'APPROVED');
assert.equal(SCHOOL_PRIORITY_V1_PROFILE.profileVersion, '1.0.0');
assert.equal(validatePriorityScoringProfile(SCHOOL_PRIORITY_V1_PROFILE).valid, true);
assert.deepEqual([...SCHOOL_PRIORITY_V1_PROFILE.applicableFactors].sort(), [...factorList].sort());
assert.equal(Object.values(SCHOOL_PRIORITY_V1_PROFILE.factorWeights).reduce((sum, weight) => sum + (weight || 0), 0), 1);
assert.equal(resolvePriorityScoringProfile({ type: 'School' }).profile?.profileId, 'SCHOOL_PRIORITY_V1');
assert.equal(resolvePriorityScoringProfile({ type: 'School' }).profile?.profileVersion, '1.0.0');
assert.equal(resolvePriorityScoringProfile({ type: 'Other' }).status, 'UNRESOLVED_SUBTYPE');
for (const type of ['Road', 'Healthcare', 'WaterFacility'] as const) {
  assert.equal(resolvePriorityScoringProfile({ type }).profile, null, `${type} remains inactive`);
}

const schoolAsset = reviewedAsset('School');
const schoolRows = factorList.map((factor) => evidence(factor));
schoolRows.find((row) => row.factor === 'populationServed')!.unit = 'students';
const schoolComplaintPeriod = schoolComplaintCoveragePeriod(reviewedAt)!;
const schoolComplaintRow = schoolRows.find((row) => row.factor === 'complaintsCount')!;
schoolComplaintRow.referencePeriod = schoolComplaintPeriod;
schoolComplaintRow.complaintCoverage!.reportingPeriod = schoolComplaintPeriod;
const schoolUtilizationRow = schoolRows.find((row) => row.factor === 'trafficLevel')!;
schoolUtilizationRow.value = 50;
schoolUtilizationRow.unit = 'percent';
schoolUtilizationRow.utilizationMeasurement!.observedValue = 10;
schoolUtilizationRow.utilizationMeasurement!.denominator = 20;
schoolUtilizationRow.utilizationMeasurement!.thresholdReference = SCHOOL_PRIORITY_V1_POLICY.thresholdReference;
const schoolReview = reviewFor(SCHOOL_PRIORITY_V1_PROFILE, schoolAsset, schoolRows);
const schoolReadiness = evaluatePriorityEvidenceReadiness(schoolAsset, schoolReview, SCHOOL_PRIORITY_V1_PROFILE);
assert.equal(schoolReadiness.readyForScoring, true);
assert.equal(schoolReadiness.factors.find((factor) => factor.factor === 'lastMaintenanceDate')?.normalizationDate, reviewedAt.toISOString(),
  'maintenance age uses the accepted evidence review date');
const schoolResult = calculatePriorityWithProfile(SCHOOL_PRIORITY_V1_PROFILE, schoolReadiness, new Date('2030-01-01T00:00:00.000Z'));
assert.ok(schoolResult);
assert.equal(schoolResult?.profileId, 'SCHOOL_PRIORITY_V1');
assert.equal(schoolResult?.profileVersion, '1.0.0');
assert.equal(schoolResult?.factors.condition?.normalizedScore, 15);
assert.equal(schoolResult?.factors.trafficLevel?.normalizedScore, 40);
assert.equal(schoolResult?.factors.lastMaintenanceDate?.normalizedScore, 30,
  'maintenance age is anchored to evidence review date rather than score calculation time');
const missingCapacityRows = schoolRows.map((row) => row.factor === 'trafficLevel'
  ? { ...row, utilizationMeasurement: { ...row.utilizationMeasurement!, denominator: 0 } }
  : row);
const missingCapacity = evaluatePriorityEvidenceReadiness(schoolAsset,
  reviewFor(SCHOOL_PRIORITY_V1_PROFILE, schoolAsset, missingCapacityRows), SCHOOL_PRIORITY_V1_PROFILE);
assert.equal(missingCapacity.readyForScoring, false, 'missing sanctioned capacity leaves School utilization unavailable');
const wrongComplaintPeriodRows = schoolRows.map((row) => row.factor === 'complaintsCount'
  ? { ...row, referencePeriod: '2026', complaintCoverage: { ...row.complaintCoverage!, reportingPeriod: '2026' } }
  : row);
const wrongComplaintPeriod = evaluatePriorityEvidenceReadiness(schoolAsset,
  reviewFor(SCHOOL_PRIORITY_V1_PROFILE, schoolAsset, wrongComplaintPeriodRows), SCHOOL_PRIORITY_V1_PROFILE);
assert.equal(wrongComplaintPeriod.readyForScoring, false, 'School complaint counts require the approved rolling review-date period');
const missingComplaintRows = schoolRows.filter((row) => row.factor !== 'complaintsCount');
const missingComplaint = evaluatePriorityEvidenceReadiness(schoolAsset,
  reviewFor(SCHOOL_PRIORITY_V1_PROFILE, schoolAsset, missingComplaintRows), SCHOOL_PRIORITY_V1_PROFILE);
assert.equal(missingComplaint.readyForScoring, false, 'no complaint evidence is missing data, not a confirmed zero');
assert.equal(missingComplaint.factors.find((factor) => factor.factor === 'complaintsCount')?.state, 'APPLICABLE_MISSING');

assert.equal(calculateSchoolUtilizationPercent(90, 100, '2025-2026', '2025-2026'), 90);
assert.equal(calculateSchoolUtilizationPercent(90, 100, '2025-2026', '2024-2025'), null,
  'utilization requires enrollment and sanctioned capacity from the same declared period');
assert.equal(calculateSchoolUtilizationPercent(90, 100, '2025-2026', '2024-2025', 'official compatible-period methodology reference'), 90,
  'a different period is usable only when compatibility is explicitly evidenced');
assert.equal(calculateSchoolUtilizationPercent(90, 0, '2025-2026', '2025-2026'), null,
  'missing/zero sanctioned capacity cannot produce utilization');
assert.equal(normalizeSchoolUtilization(49.99), 20);
assert.equal(normalizeSchoolUtilization(50.00), 40);
assert.equal(normalizeSchoolUtilization(74.99), 40);
assert.equal(normalizeSchoolUtilization(75.00), 60);
assert.equal(normalizeSchoolUtilization(89.99), 60);
assert.equal(normalizeSchoolUtilization(90.00), 80);
assert.equal(normalizeSchoolUtilization(99.99), 80);
assert.equal(normalizeSchoolUtilization(100.00), 100);
assert.equal(normalizeSchoolUtilization(null), null);
assert.equal(calculateSchoolUtilizationPercent(7499, 10000, '2025-2026', '2025-2026'), 74.99,
  'fractional utilization is retained without rounding before classification');
const maintenanceNormalizer = SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.lastMaintenanceDate!.normalization!;
const maintenanceCases: Array<[string, string, number]> = [
  ['2025-01-15', '2026-01-14', 10],
  ['2025-01-15', '2026-01-15', 30],
  ['2024-01-15', '2026-01-14', 30],
  ['2024-01-15', '2026-01-15', 50],
  ['2023-01-15', '2026-01-14', 50],
  ['2023-01-15', '2026-01-15', 75],
  ['2021-01-15', '2026-01-14', 75],
  ['2021-01-15', '2026-01-15', 100]
];
for (const [completionDate, reviewDate, expectedScore] of maintenanceCases) {
  assert.equal(normalizeProfileFactorValue(maintenanceNormalizer, completionDate, new Date(`${reviewDate}T00:00:00.000Z`)), expectedScore,
    `calendar age from ${completionDate} to ${reviewDate} maps to ${expectedScore}`);
}
assert.equal(normalizeProfileFactorValue(maintenanceNormalizer, '2025-01-15T23:59:00.000Z', new Date('2026-01-15T00:00:00.000Z')), 30,
  'maintenance thresholds compare calendar dates, not time-of-day');
const accessibilityNormalizer = SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.alternativeDistanceKm!.normalization!;
for (const [distance, expectedScore] of [
  [0.99, 10], [1.00, 30], [1.99, 30], [2.00, 60], [4.99, 60], [5.00, 80], [9.99, 80], [10.00, 100]
] as const) {
  assert.equal(normalizeProfileFactorValue(accessibilityNormalizer, distance, reviewedAt), expectedScore,
    `${distance} km maps to the owner-approved accessibility score`);
}
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.populationServed!.normalization!, 0, reviewedAt), 20);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.populationServed!.normalization!, 250, reviewedAt), 20);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.populationServed!.normalization!, 251, reviewedAt), 40);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.populationServed!.normalization!, 500, reviewedAt), 40);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.populationServed!.normalization!, 501, reviewedAt), 60);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.populationServed!.normalization!, 1000, reviewedAt), 60);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.populationServed!.normalization!, 1001, reviewedAt), 80);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.populationServed!.normalization!, 2000, reviewedAt), 80);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.populationServed!.normalization!, 2001, reviewedAt), 100);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.complaintsCount!.normalization!, 0, reviewedAt), 0);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.complaintsCount!.normalization!, 1, reviewedAt), 20);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.complaintsCount!.normalization!, 2, reviewedAt), 40);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.complaintsCount!.normalization!, 3, reviewedAt), 60);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.complaintsCount!.normalization!, 4, reviewedAt), 80);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.complaintsCount!.normalization!, 5, reviewedAt), 100);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.complaintsCount!.normalization!, 7, reviewedAt), 100,
  'complaint counts above five remain in the capped top band');
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.populationServed!.normalization!, null, reviewedAt), null,
  'missing population evidence stays unavailable');
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.lastMaintenanceDate!.normalization!, null, reviewedAt), null,
  'missing maintenance evidence stays unavailable');
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.lastMaintenanceDate!.normalization!, new Date('2027-01-01T00:00:00.000Z'), reviewedAt), null,
  'future completion date is invalid for maintenance-age normalization');
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.condition!.normalization!, 'Needs_Maintenance', reviewedAt), 65);
assert.equal(normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.condition!.normalization!, 'Unknown', reviewedAt), null,
  'unknown condition categories do not silently receive a score');
assert.equal(Object.entries({ Good: 15, Average: 40, Needs_Maintenance: 65, Poor: 85, Bad: 100 }).every(([value, score]) =>
  normalizeProfileFactorValue(SCHOOL_PRIORITY_V1_PROFILE.factorDefinitions.condition!.normalization!, value, reviewedAt) === Number(score)),
true, 'all five owner-approved condition category mappings normalize exactly');
const invalidBands = structuredClone(SCHOOL_PRIORITY_V1_PROFILE);
invalidBands.factorDefinitions.populationServed!.normalization = { kind: 'RANGE_BANDS', bands: [
  { minInclusive: 0, maxExclusive: 200, score: 0 },
  { minInclusive: 201, maxExclusive: null, score: 100 }
] };
assert.equal(validatePriorityScoringProfile(invalidBands).valid, false, 'gaps in configured ranges fail profile validation');

const schoolTestProfile = profile('School');
const schoolTestAsset = reviewedAsset('School');
const incompleteReadiness = evaluatePriorityEvidenceReadiness(schoolTestAsset, reviewFor(schoolTestProfile, schoolTestAsset, [evidence('condition')]), schoolTestProfile);
assert.equal(incompleteReadiness.readyForScoring, false, 'missing required evidence keeps profile unavailable');
assert.equal(calculatePriorityWithProfile(schoolTestProfile, incompleteReadiness, reviewedAt), null, 'calculator fails closed on a missing applicable factor');

const oneFactor = profile('School', 'school-condition-only-test');
oneFactor.applicableFactors = ['condition'];
oneFactor.factorWeights = { condition: 1 };
for (const factor of factorList) {
  if (factor !== 'condition') oneFactor.factorDefinitions[factor] = {
    applicability: 'NOT_APPLICABLE', semantics: 'Explicit test-only N/A decision', readinessRequirements: []
  };
}
assert.equal(validatePriorityScoringProfile(oneFactor).valid, true);
const oneFactorReview = reviewFor(oneFactor, schoolTestAsset, [evidence('condition')]);
const oneFactorReadiness = evaluatePriorityEvidenceReadiness(schoolTestAsset, oneFactorReview, oneFactor);
assert.equal(oneFactorReadiness.readyForScoring, true);
assert.deepEqual(oneFactorReadiness.notApplicableFactors, factorList.filter((factor) => factor !== 'condition'));
const oneFactorResult = calculatePriorityWithProfile(oneFactor, oneFactorReadiness, reviewedAt);
assert.equal(oneFactorResult?.priorityScore, 15, 'N/A factors contribute nothing and are not replaced with zero; the profile explicitly assigns weight 1 to its sole factor');
assert.deepEqual(Object.keys(oneFactorResult?.factors || {}), ['condition']);

const importedUnscored = getPriorityAvailability({ dataOrigin: 'SOURCE_EXCEL', priorityScorable: false, type: 'School' });
assert.equal(importedUnscored.eligible, false);
const mangalore100 = Array.from({ length: 100 }, () => getPriorityAvailability({
  dataOrigin: 'SOURCE_EXCEL', priorityScorable: false, type: 'School'
}));
assert.equal(mangalore100.every((result) => !result.eligible), true, 'imported Mangalore records remain unavailable');

const legacy = PriorityScoringService.calculate({
  type: 'School', condition: 'Good', complaintsCount: 2, populationServed: 1000, trafficLevel: 'Low',
  lastMaintenanceDate: new Date(), alternativeDistanceKm: 2
}, { weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS, limits: DEFAULT_LIMITS });
assert.equal(legacy.priorityScore, 22.5, 'legacy six-factor arithmetic remains unchanged');

const comparableItems: Array<ProfileRankable & { id: string }> = [
  { id: 'school-high', scoringProfile: { profileId: 'school-v1', profileVersion: '1', infrastructureType: 'School', status: 'APPROVED' }, scoringStatus: 'SCORED', priorityScore: 90 },
  { id: 'road-lower', scoringProfile: { profileId: 'road-v1', profileVersion: '1', infrastructureType: 'Road', status: 'APPROVED' }, scoringStatus: 'SCORED', priorityScore: 50 }
];
const profileRanked = rankWithinScoringProfiles(comparableItems);
assert.deepEqual(profileRanked.map((item) => item.id), ['road-lower', 'school-high'], 'scores from different profiles are not globally sorted against each other');
assert.deepEqual(profileRanked.map((item) => item.profileRank), [1, 1], 'rank restarts within each profile/version');
assert.equal(profileRanked[0].priorityScore, 50);
assert.equal(profileRanked[1].priorityScore, 90);

console.log('PASS: versioned type profiles, validation, fail-closed readiness/scoring, legacy compatibility, profile provenance, and within-profile ranking.');
