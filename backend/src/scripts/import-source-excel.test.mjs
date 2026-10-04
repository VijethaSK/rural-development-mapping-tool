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
  assert.equal(doc.coordinateSource, 'UNAVAILABLE');
  assert.equal(doc.coordinateStatus, 'UNVERIFIED');
  assert.equal(doc.priorityScorable, false);
  assert.equal(doc.condition, null);
  assert.equal(doc.complaintsCount, null);
  assert.equal(doc.populationServed, null);
  assert.equal(doc.estimatedMaintenanceCost, null);
  assert.equal(doc.sourceData['Verification / Notes'], sourceRow['Verification / Notes']);
  assert.ok(doc.missingDataFields.includes('coordinates'));
});

test('approximate workbook coordinate metadata maps to the supported approximate provenance and remains in raw data', () => {
  const row = {
    ...sourceRow,
    Latitude: 12.9716,
    Longitude: 77.5946,
    Coordinate_Status: 'APPROXIMATE_DEMO',
    Coordinate_Source: 'PUBLIC_MAP_AREA_CENTER_PLUS_DETERMINISTIC_OFFSET',
    Coordinates_Verified: false
  };
  const doc = makeInfrastructureDocument({ rowNumber: 3, sourceData: row }, 'source.xlsx', 'panchayat-id');

  assert.equal(doc.dataOrigin, 'SOURCE_EXCEL');
  assert.equal(doc.coordinateSource, 'PUBLIC_MAP_APPROXIMATE');
  assert.equal(doc.coordinateStatus, 'APPROXIMATE');
  assert.equal(doc.coordinatesVerified, false);
  assert.equal(doc.sourceData, row);
  assert.equal(doc.sourceData.Coordinate_Source, 'PUBLIC_MAP_AREA_CENTER_PLUS_DETERMINISTIC_OFFSET');
  assert.equal(doc.sourceData.Coordinate_Status, 'APPROXIMATE_DEMO');
});

test('valid coordinates without recognized quality metadata remain unverified Excel coordinates in GeoJSON order', () => {
  const row = { ...sourceRow, Latitude: '12.9716', Longitude: '77.5946' };
  const doc = makeInfrastructureDocument({ rowNumber: 4, sourceData: row }, 'source.xlsx', 'panchayat-id');

  assert.deepEqual(doc.location, { type: 'Point', coordinates: [77.5946, 12.9716] });
  assert.equal(doc.coordinateSource, 'SOURCE_EXCEL');
  assert.equal(doc.coordinateStatus, 'UNVERIFIED');
  assert.equal(doc.coordinatesVerified, false);
});

test('missing, invalid, out-of-range, nonnumeric, and incomplete coordinates are unavailable', () => {
  const cases = [
    { Latitude: null, Longitude: null },
    { Latitude: 91, Longitude: 77.5946 },
    { Latitude: 12.9716, Longitude: 181 },
    { Latitude: 'not-a-number', Longitude: 77.5946 },
    { Latitude: 12.9716, Longitude: undefined }
  ];

  for (const coordinates of cases) {
    const row = {
      ...sourceRow,
      ...coordinates,
      Coordinate_Status: 'APPROXIMATE_DEMO',
      Coordinate_Source: 'PUBLIC_MAP_AREA_CENTER_PLUS_DETERMINISTIC_OFFSET',
      Coordinates_Verified: false
    };
    const doc = makeInfrastructureDocument({ rowNumber: 5, sourceData: row }, 'source.xlsx', 'panchayat-id');

    assert.equal(doc.location, null);
    assert.equal(doc.coordinateSource, 'UNAVAILABLE');
    assert.equal(doc.coordinateStatus, 'UNVERIFIED');
    assert.equal(doc.coordinatesVerified, false);
  }
});

test('workbook verification flag alone does not mark coordinates verified', () => {
  const row = { ...sourceRow, Latitude: 12.9716, Longitude: 77.5946, Coordinates_Verified: true };
  const doc = makeInfrastructureDocument({ rowNumber: 6, sourceData: row }, 'source.xlsx', 'panchayat-id');

  assert.equal(doc.coordinateSource, 'SOURCE_EXCEL');
  assert.equal(doc.coordinateStatus, 'UNVERIFIED');
  assert.equal(doc.coordinatesVerified, false);
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
