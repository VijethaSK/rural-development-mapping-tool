import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countRoadRecords,
  filterMappedRoads,
  filterRoadRecords,
  getRoadLineCoordinates,
  roadGeometryAvailability
} from './roadGeometry.ts';

const approximateSourceRoad = {
  _id: 'source-road',
  name: 'Public road network',
  ward: null,
  condition: null,
  dataOrigin: 'SOURCE_EXCEL',
  location: { type: 'Point', coordinates: [74.93052, 12.867023] },
  coordinateSource: 'PUBLIC_MAP_APPROXIMATE',
  coordinateStatus: 'APPROXIMATE',
  coordinatesVerified: false
};

const demoRoad = {
  _id: 'demo-road',
  name: 'Kerehalli Santhe Main Road',
  dataOrigin: 'DEMO',
  isSynthetic: true,
  lineGeometry: {
    type: 'LineString',
    coordinates: [[75.5, 13.9], [75.51, 13.9], [75.52, 13.9]]
  }
};

test('Point-only source road remains a road record but is not counted or rendered as mapped', () => {
  assert.deepEqual(getRoadLineCoordinates(approximateSourceRoad), null);
  assert.deepEqual(filterMappedRoads([approximateSourceRoad]), []);
  assert.deepEqual(countRoadRecords([approximateSourceRoad]), { roadRecords: 1, mappedRoads: 0 });
  assert.equal(roadGeometryAvailability(approximateSourceRoad), 'Geometry unavailable — approximate location only');
});

test('Roads page keeps Point-only source roads in the visible record list', () => {
  const visibleRecords = filterRoadRecords([approximateSourceRoad], '', '');
  assert.equal(visibleRecords.length, 1);
  assert.equal(visibleRecords[0].name, 'Public road network');
});

test('valid demo LineString remains mapped and its synthetic provenance is preserved', () => {
  assert.deepEqual(getRoadLineCoordinates(demoRoad), [[75.5, 13.9], [75.51, 13.9], [75.52, 13.9]]);
  assert.deepEqual(filterMappedRoads([approximateSourceRoad, demoRoad]), [demoRoad]);
  assert.deepEqual(countRoadRecords([approximateSourceRoad, demoRoad]), { roadRecords: 2, mappedRoads: 1 });
  assert.equal(demoRoad.dataOrigin, 'DEMO');
  assert.equal(demoRoad.isSynthetic, true);
});

test('invalid or underspecified LineStrings are not counted as mapped roads', () => {
  const invalidRoads = [
    { lineGeometry: { type: 'Point', coordinates: [[75.5, 13.9], [75.51, 13.9]] } },
    { lineGeometry: { type: 'LineString', coordinates: [] } },
    { lineGeometry: { type: 'LineString', coordinates: [[75.5, 13.9]] } },
    { lineGeometry: { type: 'LineString', coordinates: [[181, 13.9], [75.51, 13.9]] } },
    { lineGeometry: { type: 'LineString', coordinates: [[12.34], [56.78, 90.12]] } },
    { lineGeometry: { type: 'LineString', coordinates: [[12.34, 56.78, 90.12], [13.34, 57.78]] } },
    { lineGeometry: { type: 'LineString', coordinates: [['12.34', 56.78], [13.34, 57.78]] } },
    { lineGeometry: { type: 'LineString', coordinates: [null, [13.34, 57.78]] } },
    { lineGeometry: { type: 'LineString', coordinates: ['12.34,56.78', [13.34, 57.78]] } }
  ];
  for (const road of invalidRoads) {
    assert.equal(getRoadLineCoordinates(road), null, 'invalid coordinate structure is rejected');
  }
  assert.equal(filterMappedRoads(invalidRoads).length, 0);
});
