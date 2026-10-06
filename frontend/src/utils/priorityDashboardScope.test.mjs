import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyPriorityResultIfCurrent,
  buildPriorityRequestPath,
  createPriorityRequestGate,
  filterAndSortPriorityItems,
  groupScoredPriorityItems,
  getPriorityAvailabilityDisplay,
  getPriorityDisplaySummary,
  getPriorityEmptyState,
  getUnavailablePriorityItems,
  parsePriorityResponse,
  resolveInitialPriorityPanchayat,
  shouldShowUnavailablePrioritySection,
  updatePrioritySearchParams,
} from './priorityDashboardScope.mjs';

const panchayats = [{ _id: 'A', name: 'Panchayat A' }, { _id: 'B', name: 'Panchayat B' }];
assert.deepEqual(resolveInitialPriorityPanchayat(panchayats, 'B'), { selectedId: 'B', error: null });
assert.deepEqual(resolveInitialPriorityPanchayat(panchayats, null), { selectedId: '', error: null }, 'multiple Panchayats require explicit choice');
assert.deepEqual(resolveInitialPriorityPanchayat([panchayats[0]], null), { selectedId: 'A', error: null }, 'a single permitted Panchayat is selected like Gap Analysis');
assert.equal(resolveInitialPriorityPanchayat(panchayats, 'outside-scope').selectedId, '');
assert.match(resolveInitialPriorityPanchayat(panchayats, 'outside-scope').error, /unavailable|access/i);

const search = updatePrioritySearchParams(new URLSearchParams('tab=assets&keep=yes'), 'A');
assert.equal(search.get('panchayatId'), 'A');
assert.equal(search.get('tab'), 'assets');
assert.equal(search.get('keep'), 'yes');
assert.equal(updatePrioritySearchParams(search, '').has('panchayatId'), false);
assert.equal(buildPriorityRequestPath('A'), '/api/priorities?panchayatId=A');
assert.throws(() => buildPriorityRequestPath(''), /Select a Panchayat/);

const stats = { total: 3, critical: 0, high: 1, medium: 1, low: 0, unscored: 1, averageScore: 42 };
const scoredHigh = { _id: 'high', name: 'Main Road', type: 'Road', priorityScore: 64, priorityLevel: 'High', complaintsCount: 3, populationServed: 1200 };
const scoredZero = { _id: 'zero', name: 'Primary School', type: 'School', priorityScore: 0, priorityLevel: 'Low', complaintsCount: 0, populationServed: 0 };
const unscored = { _id: 'unknown', name: 'Source Facility', type: 'Other', priorityScore: null, priorityLevel: 'Unavailable', complaintsCount: null, populationServed: null };
const response = parsePriorityResponse({ items: [scoredHigh, scoredZero, unscored], stats });
assert.deepEqual(response.items, [scoredHigh, scoredZero, unscored], 'the actual { items, stats } response contract is retained');

assert.throws(() => parsePriorityResponse({ data: [scoredHigh], stats }), /invalid/i, 'legacy/wrong data property must not become successful empty data');
assert.throws(() => parsePriorityResponse({ items: 'not-an-array', stats }), /invalid/i);
assert.throws(() => parsePriorityResponse({ items: [scoredHigh], stats: { total: 1 } }), /invalid/i);

const summary = getPriorityDisplaySummary(response.items, response.stats);
assert.deepEqual(summary, {
  total: 3, scored: 2, unscored: 1, critical: 0, high: 1, medium: 1, low: 0,
  scoredProfileCount: 2,
  averageScore: null,
  averageScoreUnavailableReason: 'Scores from different profiles are not directly comparable.'
});
assert.equal(summary.total, summary.scored + summary.unscored, 'total is not confused with scored count');
const oneProfile = { profileId: 'SCHOOL_PRIORITY_V1', profileVersion: '1.0.0', infrastructureType: 'School', status: 'APPROVED' };
const oneProfileSummary = getPriorityDisplaySummary([
  { ...scoredHigh, scoringProfile: oneProfile }, { ...scoredZero, scoringProfile: oneProfile }
], { ...stats, total: 2, averageScore: 42 });
assert.equal(oneProfileSummary.averageScore, 42, 'average is taken from backend stats when all scored records share one profile');
assert.equal(oneProfileSummary.averageScoreUnavailableReason, null);
assert.equal(oneProfileSummary.scoredProfileCount, 1);
const noScoredSummary = getPriorityDisplaySummary([unscored], { total: 1, critical: 0, high: 0, medium: 0, low: 0, unscored: 1, averageScore: 0 });
assert.equal(noScoredSummary.averageScore, null, 'backend sentinel zero is not presented as an average when no assets are scored');

const profileItems = [
  { ...scoredHigh, _id: 'school-high', type: 'School', priorityScore: 88, scoringProfile: { profileId: 'SCHOOL_PRIORITY_V1', profileVersion: '1.0.0', infrastructureType: 'School', status: 'APPROVED' } },
  { ...scoredZero, _id: 'legacy-low', type: 'Road', priorityScore: 31, scoringProfile: { profileId: 'LEGACY_FIXED_SIX_FACTOR', profileVersion: '1', infrastructureType: 'Road', status: 'LEGACY' } }
];
const profileGroups = groupScoredPriorityItems(profileItems, { typeFilter: 'All', priorityFilter: 'All', searchTerm: '', sortBy: 'score' });
assert.equal(profileGroups.length, 2, 'scores produced under different profiles are separated into distinct groups');
assert.deepEqual(profileGroups.flatMap((group) => group.items.map((item) => item._id)).sort(), ['legacy-low', 'school-high']);
const incomparableSummary = getPriorityDisplaySummary(profileItems, { ...stats, total: 2, averageScore: 59.5 });
assert.equal(incomparableSummary.averageScore, null, 'aggregate averages across different scoring profiles are not displayed');
assert.match(incomparableSummary.averageScoreUnavailableReason, /different profiles/);

assert.deepEqual(filterAndSortPriorityItems(response.items, {
  typeFilter: 'All', priorityFilter: 'All', searchTerm: '', sortBy: 'score'
}).map((item) => item._id), ['high', 'zero'], 'unscored assets are excluded from the ranked list');
assert.deepEqual(getUnavailablePriorityItems([
  { ...scoredHigh, _id: 'contradictory', scoringStatus: 'UNAVAILABLE' }
]).map((item) => item._id), ['contradictory'], 'explicit backend unavailable status takes precedence over a contradictory numeric value');
assert.deepEqual(filterAndSortPriorityItems(response.items, {
  typeFilter: 'Road', priorityFilter: 'All', searchTerm: '', sortBy: 'score'
}).map((item) => item._id), ['high'], 'type filter remains functional');
assert.deepEqual(filterAndSortPriorityItems(response.items, {
  typeFilter: 'All', priorityFilter: 'High', searchTerm: '', sortBy: 'score'
}).map((item) => item._id), ['high'], 'urgency filter remains functional');
assert.deepEqual(filterAndSortPriorityItems(response.items, {
  typeFilter: 'All', priorityFilter: 'All', searchTerm: 'school', sortBy: 'score'
}).map((item) => item._id), ['zero'], 'search remains functional');
assert.deepEqual(filterAndSortPriorityItems([scoredZero, scoredHigh], {
  typeFilter: 'All', priorityFilter: 'All', searchTerm: '', sortBy: 'complaints'
}).map((item) => item._id), ['high', 'zero'], 'sort by complaints remains functional');
assert.deepEqual(filterAndSortPriorityItems([scoredHigh, scoredZero], {
  typeFilter: 'All', priorityFilter: 'All', searchTerm: '', sortBy: 'population'
}).map((item) => item._id), ['high', 'zero'], 'sort by population remains functional');

assert.deepEqual(getUnavailablePriorityItems(response.items).map((item) => item._id), ['unknown'],
  'unavailable records are displayed separately and never included in the ranked list');
assert.equal(shouldShowUnavailablePrioritySection({ loading: false, error: null, items: response.items }), true);
assert.equal(shouldShowUnavailablePrioritySection({ loading: true, error: null, items: response.items }), false,
  'loading is not presented as a data-readiness result');
assert.equal(shouldShowUnavailablePrioritySection({ loading: false, error: 'API unavailable', items: response.items }), false,
  'API failure is not presented as a data-readiness result');
assert.equal(shouldShowUnavailablePrioritySection({ loading: false, error: null, items: [scoredHigh, scoredZero] }), false,
  'scored Varthur-like records preserve the existing ranked behavior');

const readiness = {
  eligible: false,
  reasonCode: 'SOURCE_DATA_REVIEW_REQUIRED',
  reason: 'Review this source record.',
  missingScoringInputs: [{ code: 'condition', label: 'Condition' }, { code: 'populationServed', label: 'Population served' }],
  dataQualityWarnings: [{ code: 'APPROXIMATE_COORDINATES', message: 'Coordinates are approximate.' }],
  coordinateProvenance: { source: 'PUBLIC_MAP_APPROXIMATE', status: 'APPROXIMATE', verified: false }
};
const readinessDisplay = getPriorityAvailabilityDisplay(readiness);
assert.equal(readinessDisplay.hasStructuredAvailability, true);
assert.deepEqual(readinessDisplay.missingScoringInputs.map((input) => input.label), ['Condition', 'Population served']);
assert.deepEqual(readinessDisplay.dataQualityWarnings.map((warning) => warning.message), ['Coordinates are approximate.']);
assert.match(readinessDisplay.reason, /Review this source record/);
assert.equal(getPriorityAvailabilityDisplay(undefined).hasStructuredAvailability, false);
assert.equal(getPriorityAvailabilityDisplay(undefined).missingScoringInputs.length, 0,
  'older API responses safely show no structured details without making up missing-field reasons');
const evidenceAvailability = getPriorityAvailabilityDisplay({ ...readiness, evidenceReadiness: { factors: [
  { factor: 'condition', state: 'APPLICABLE_MISSING', value: null, unit: null, reason: 'No accepted evidence.' },
  { factor: 'populationServed', state: 'PENDING_VERIFICATION', value: null, unit: null, reason: 'Awaiting review.' }
] } });
assert.deepEqual(evidenceAvailability.factorReadiness.map(({ factor, state }) => [factor, state]), [
  ['condition', 'APPLICABLE_MISSING'], ['populationServed', 'PENDING_VERIFICATION']
], 'backend factor readiness states are preserved for the details UI');

assert.equal(getPriorityEmptyState({ selectedPanchayat: false, panchayatCount: 0, selectionError: null, items: [], stats: null, scoredCount: 0, filteredCount: 0 }), 'no-panchayats');
assert.equal(getPriorityEmptyState({ selectedPanchayat: false, panchayatCount: 2, selectionError: null, items: [], stats: null, scoredCount: 0, filteredCount: 0 }), 'select-panchayat');
assert.equal(getPriorityEmptyState({ selectedPanchayat: true, panchayatCount: 2, selectionError: null, items: [], stats: { ...stats, total: 0 }, scoredCount: 0, filteredCount: 0 }), 'no-assets');
assert.equal(getPriorityEmptyState({ selectedPanchayat: true, panchayatCount: 2, selectionError: null, items: [unscored], stats, scoredCount: 0, filteredCount: 0 }), 'none-scorable');
assert.equal(getPriorityEmptyState({ selectedPanchayat: true, panchayatCount: 2, selectionError: null, items: [scoredHigh], stats, scoredCount: 1, filteredCount: 0 }), 'filters-empty');

const gate = createPriorityRequestGate();
const lifecycle = gate.activate();
gate.select('A');
const requestA = gate.begin('A');
assert.ok(requestA);
let displayed = [];
gate.select('B');
displayed = [];
const requestB = gate.begin('B');
assert.ok(requestB);
assert.equal(applyPriorityResultIfCurrent(gate, requestA, () => { displayed = [scoredHigh]; }), false);
assert.deepEqual(displayed, [], 'late Panchayat A results are ignored');
assert.equal(applyPriorityResultIfCurrent(gate, requestB, () => { displayed = [scoredZero]; }), true);
assert.deepEqual(displayed, [scoredZero]);
gate.select('A');
const secondRequestA = gate.begin('A');
assert.ok(secondRequestA);
assert.equal(applyPriorityResultIfCurrent(gate, requestA, () => { displayed = [scoredHigh]; }), false,
  'the first A response remains stale after switching A to B and back to A');
assert.deepEqual(displayed, [scoredZero]);
assert.equal(applyPriorityResultIfCurrent(gate, secondRequestA, () => { displayed = [scoredHigh]; }), true);
assert.deepEqual(displayed, [scoredHigh]);
assert.equal(gate.deactivate(lifecycle), true);

const page = readFileSync(new URL('../pages/PriorityDashboardPage.tsx', import.meta.url), 'utf8');
const configModal = readFileSync(new URL('../components/PriorityConfigModal.tsx', import.meta.url), 'utf8');
const availabilityComponent = readFileSync(new URL('../components/PriorityAvailabilityDetails.tsx', import.meta.url), 'utf8');
const explanationModal = readFileSync(new URL('../components/ScoreExplanationModal.tsx', import.meta.url), 'utf8');
assert.match(page, /useSearchParams/);
assert.match(page, /apiAuth<PanchayatOption\[]>\('\/panchayats', token\)/);
assert.match(page, /buildPriorityRequestPath\(panchayatId\)/);
assert.match(page, /apiAuth<\{ items: RankedInfrastructure\[\]; stats: PriorityStats \}>\(url, tokenRef\.current\)/);
assert.match(page, /applyPriorityResultIfCurrent\(requestGateRef\.current, request/);
assert.match(page, /resolveInitialPriorityPanchayat/);
assert.match(page, /updatePrioritySearchParams/);
assert.match(page, /setAssets\(\[\]\);\s*setStats\(null\)/);
assert.match(page, /groupScoredPriorityItems\(assets/);
assert.match(page, /rankedGroups\.flatMap/);
assert.match(page, /Not Yet Scoreable/);
assert.match(page, /scoringProfile=\{asset\.scoringProfile\}/);
assert.match(availabilityComponent, /Missing data preventing priority scoring/);
assert.match(availabilityComponent, /Pending review/);
assert.match(availabilityComponent, /scoringProfile\.profileId/);
assert.match(availabilityComponent, /evidenceReadiness\.status/);
assert.match(availabilityComponent, /Coordinate \/ data-quality warnings/);
assert.match(availabilityComponent, /A detailed scoring-input assessment is unavailable/);
assert.match(explanationModal, /<PriorityAvailabilityDetails/,
  'the explanation modal reuses the same structured availability details');
assert.match(explanationModal, /profileExplanation\.applicableFactors/);
assert.match(explanationModal, /Population Served/);
assert.match(explanationModal, /Maintenance Age/);
assert.match(page, /panchayatId=\{selectedPanchayatId\}/, 'weight configuration receives the current Panchayat scope');
assert.match(configModal, /apiAuth<PriorityConfig[^\n]*>\(url, token\)/);
assert.match(configModal, /parsePriorityConfigResponse\(data\)/, 'configuration is validated before successful-load state is set');
assert.match(configModal, /panchayatId: savePanchayatId,\s*weights: payloadWeights/);
assert.match(configModal, /canSavePriorityConfiguration\(/, 'configuration saves require a successful load for the selected Panchayat');
assert.match(configModal, /isCurrent\(saveRequest, \{ isOpen, panchayatId: savePanchayatId \}\)/,
  'the save scope is rechecked before the request and before its completion updates state');
console.log('PASS: Priority response contract, scored/unscored summaries, Panchayat selection, request gating, and filters.');
