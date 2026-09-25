import test from 'node:test';
import assert from 'node:assert/strict';
import { makeInfrastructureDocument, makePanchayatDocument, stableSourceKey } from './import-source-excel.mjs';

const sourceRow = {
  Panchayat: 'Adyar',
  'Village/Area': 'Adyar; Arkula',
  'Infrastructure / Facility': 'Government education facilities',
  Category: 'Education',
  Type: 'Government school(s)',
  Ownership: 'Government',
  'Reported Quantity': 'Multiple / verify',
  Status: 'Reported',
  Latitude: null,
  Longitude: null,
  Source: 'Current education records required',
  'Source Vintage': '2026',
  'Verification / Notes': 'Obtain the current official list; exact names require verification.'
};

test('source identity is deterministic and normalizes formatting only', () => {
  assert.equal(stableSourceKey(sourceRow), stableSourceKey({ ...sourceRow, Panchayat: ' adyar ', 'Village/Area': 'Adyar;   Arkula' }));
  assert.notEqual(stableSourceKey(sourceRow), stableSourceKey({ ...sourceRow, Category: 'Childcare' }));
});

test('source document retains raw data and never fills missing coordinates or scoring facts', () => {
  const doc = makeInfrastructureDocument({ rowNumber: 2, sourceData: sourceRow }, 'source.xlsx', 'panchayat-id', new Date('2026-09-25T00:00:00Z'));
  assert.equal(doc.dataOrigin, 'SOURCE_EXCEL');
  assert.equal(doc.isSynthetic, false);
  assert.equal(doc.type, 'School');
  assert.equal(doc.sourceStatus, 'Reported');
  assert.equal(doc.normalizedStatus, null);
  assert.equal(doc.sourceReportedQuantity, 'Multiple / verify');
  assert.equal(doc.location, null);
  assert.equal(doc.coordinatesVerified, false);
  assert.equal(doc.priorityScorable, false);
  assert.equal(doc.condition, null);
  assert.equal(doc.complaintsCount, null);
  assert.equal(doc.populationServed, null);
  assert.equal(doc.estimatedMaintenanceCost, null);
  assert.equal(doc.sourceData['Verification / Notes'], sourceRow['Verification / Notes']);
  assert.ok(doc.missingDataFields.includes('coordinates'));
});

test('Panchayat document uses only provided administrative fields and has no invented center or wards', () => {
  const doc = makePanchayatDocument({
    Panchayat: 'Adyar', Taluka: 'Mangaluru Taluka', Villages: 'Adyar; Arkula',
    'Number of Villages': 2, 'Administrative Note': 'Adyar GP covers two villages.', Source: 'VillageInfo', sourceRow: 2
  }, 'source.xlsx', new Date('2026-09-25T00:00:00Z'));
  assert.deepEqual(doc.villages, ['Adyar', 'Arkula']);
  assert.equal(doc.taluka, 'Mangaluru Taluka');
  assert.equal(doc.district, undefined);
  assert.equal(doc.state, undefined);
  assert.deepEqual(doc.wards, []);
  assert.equal(doc.centerCoord, null);
  assert.equal(doc.location, null);
  assert.deepEqual(doc.habitations, []);
});
