import assert from 'node:assert/strict';
import {
  getVerifiedInfrastructurePoint,
  getVerifiedRoadLineString,
  getVerifiedSpatialPoint,
  hasTrustedSpatialProvenance
} from './services/spatial/spatialCoordinateEligibility.js';
import { roadDocumentsToLineInputs } from './services/routing/routingProvider.js';

const verified = {
  coordinatesVerified: true,
  coordinateStatus: 'VERIFIED',
  coordinateSource: 'FIELD_SURVEY',
  dataOrigin: 'SOURCE_EXCEL',
  isSynthetic: false,
  source: 'field verification record'
};

assert.equal(hasTrustedSpatialProvenance(verified), true, 'explicit field-survey verification is trusted');
assert.deepEqual(getVerifiedSpatialPoint(verified, { type: 'Point', coordinates: [74.93, 12.87] }), { lng: 74.93, lat: 12.87 });
assert.equal(getVerifiedSpatialPoint(verified, undefined), null, 'missing point coordinates are rejected');
assert.equal(getVerifiedSpatialPoint(verified, { type: 'Point', coordinates: [181, 12.87] }), null, 'out-of-range coordinates are rejected');

const invalidProvenance = [
  { ...verified, coordinatesVerified: false },
  { ...verified, coordinateStatus: undefined },
  { ...verified, coordinateStatus: 'APPROXIMATE' },
  { ...verified, coordinateSource: 'PUBLIC_MAP_APPROXIMATE' },
  { ...verified, coordinateSource: 'SOURCE_EXCEL' },
  { ...verified, coordinateSource: 'UNKNOWN_SOURCE' },
  { ...verified, isSynthetic: true },
  { ...verified, dataOrigin: 'DEMO' },
  { ...verified, source: 'RDMT_GAP_ANALYSIS_SYNTHETIC_DEMO_V1' }
];
for (const record of invalidProvenance) {
  assert.equal(hasTrustedSpatialProvenance(record), false);
  assert.equal(getVerifiedSpatialPoint(record, { type: 'Point', coordinates: [74.93, 12.87] }), null);
  assert.equal(getVerifiedRoadLineString({
    ...record,
    lineGeometry: { type: 'LineString', coordinates: [[74.93, 12.87], [74.94, 12.88]] }
  }), null);
}

const verifiedLine = { ...verified, lineGeometry: { type: 'LineString', coordinates: [[74.93, 12.87], [74.94, 12.88]] } };
assert.deepEqual(getVerifiedRoadLineString(verifiedLine)?.coordinates, [[74.93, 12.87], [74.94, 12.88]]);
assert.equal(roadDocumentsToLineInputs([verifiedLine]).length, 1, 'verified LineString becomes a graph input');
assert.equal(roadDocumentsToLineInputs([{
  ...verifiedLine,
  coordinatesVerified: false,
  coordinateSource: 'PUBLIC_MAP_APPROXIMATE',
  coordinateStatus: 'APPROXIMATE'
}]).length, 0, 'valid-looking but unverified LineString never becomes a graph input');

assert.deepEqual(getVerifiedInfrastructurePoint({
  ...verified,
  type: 'Road',
  ...verifiedLine
}), { lng: 74.94, lat: 12.88 }, 'road route stop is derived from a verified line midpoint');

console.log('PASS: spatial provenance helper, points, road LineStrings, synthetic/demo rejection, and graph inputs.');
