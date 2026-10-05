import assert from 'node:assert/strict';
import {
  getPriorityAvailability,
  getUnavailablePriorityFields
} from './services/priorityScoringService.js';

const completeInputs = {
  condition: 'Good',
  complaintsCount: 2,
  populationServed: 0,
  trafficLevel: 'Low',
  lastMaintenanceDate: new Date('2025-01-01T00:00:00.000Z'),
  alternativeDistanceKm: 0
};

const baseSourceRecord = {
  dataOrigin: 'SOURCE_EXCEL',
  priorityScorable: false,
  ...completeInputs,
  location: { type: 'Point', coordinates: [74.85, 12.87] },
  coordinateSource: 'PUBLIC_MAP_APPROXIMATE',
  coordinateStatus: 'APPROXIMATE',
  coordinatesVerified: false
};

const oneMissing = getPriorityAvailability({ ...baseSourceRecord, condition: null });
assert.deepEqual(oneMissing.missingScoringInputs.map((input) => input.code), ['condition']);
assert.equal(oneMissing.eligible, false, 'the existing SOURCE_EXCEL gate remains authoritative');

const multipleMissing = getPriorityAvailability({
  ...baseSourceRecord,
  condition: undefined,
  trafficLevel: undefined,
  alternativeDistanceKm: undefined
});
assert.deepEqual(multipleMissing.missingScoringInputs.map((input) => input.code), [
  'condition', 'trafficLevel', 'alternativeDistanceKm'
]);

const allMissing = getPriorityAvailability({ dataOrigin: 'SOURCE_EXCEL', priorityScorable: false, status: 'Operational' });
assert.deepEqual(allMissing.missingScoringInputs.map((input) => input.code), [
  'condition', 'complaintsCount', 'populationServed', 'trafficLevel', 'lastMaintenanceDate', 'alternativeDistanceKm'
]);

const explicitZeros = getPriorityAvailability({
  ...baseSourceRecord,
  complaintsCount: 0,
  populationServed: 0
});
assert.equal(explicitZeros.missingScoringInputs.some((input) => input.code === 'complaintsCount'), false);
assert.equal(explicitZeros.missingScoringInputs.some((input) => input.code === 'populationServed'), false);

assert.deepEqual(getPriorityAvailability(baseSourceRecord).dataQualityWarnings.map((warning) => warning.code), [
  'APPROXIMATE_COORDINATES', 'UNVERIFIED_COORDINATES'
]);
assert.deepEqual(getPriorityAvailability({
  ...baseSourceRecord,
  coordinateSource: 'FIELD_SURVEY',
  coordinateStatus: 'VERIFIED',
  coordinatesVerified: true
}).dataQualityWarnings, []);

const withNonScoringFields = getPriorityAvailability({
  ...baseSourceRecord,
  estimatedMaintenanceCost: 0,
  lineGeometry: { type: 'LineString', coordinates: [] }
});
const reportedInputCodes = withNonScoringFields.missingScoringInputs.map((input) => input.code as string);
assert.equal(reportedInputCodes.includes('estimatedMaintenanceCost'), false);
assert.equal(reportedInputCodes.includes('lineGeometry'), false);

const unavailable = getUnavailablePriorityFields(baseSourceRecord);
assert.equal(unavailable.priorityScore, null);
assert.equal(unavailable.priorityLevel, 'Unavailable');
assert.equal(unavailable.scoringStatus, 'UNAVAILABLE');
assert.deepEqual(unavailable.priorityAvailability, getPriorityAvailability(baseSourceRecord));

const listAvailability = getUnavailablePriorityFields(baseSourceRecord).priorityAvailability;
const byIdAvailability = getUnavailablePriorityFields(baseSourceRecord).priorityAvailability;
assert.deepEqual(listAvailability, byIdAvailability, 'list and get-by-id paths share the same availability helper');

assert.equal(getPriorityAvailability({ dataOrigin: 'SOURCE_EXCEL', priorityScorable: true, ...completeInputs }).eligible, true);
assert.equal(getPriorityAvailability({ dataOrigin: 'DEMO', priorityScorable: false, ...completeInputs }).eligible, true,
  'non-SOURCE_EXCEL eligibility remains as before');

console.log('PASS: Priority availability reasons, coordinate warnings, eligibility, and unavailable result contract.');
