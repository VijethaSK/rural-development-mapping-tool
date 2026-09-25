import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Infrastructure } from './models/Infrastructure.js';

const panchayatId = new mongoose.Types.ObjectId();

async function validateCoordinateMetadata(coordinateSource: unknown, coordinateStatus: unknown) {
  const document = new Infrastructure({
    panchayatId,
    name: 'Coordinate metadata schema check',
    type: 'Other',
    coordinateSource,
    coordinateStatus
  });
  await document.validate();
}

for (const source of ['SOURCE_EXCEL', 'FIELD_SURVEY', 'UNAVAILABLE', 'PUBLIC_MAP_APPROXIMATE', null]) {
  await validateCoordinateMetadata(source, 'APPROXIMATE');
}

for (const status of ['VERIFIED', 'APPROXIMATE', 'UNVERIFIED']) {
  await validateCoordinateMetadata('PUBLIC_MAP_APPROXIMATE', status);
}

await assert.rejects(
  () => validateCoordinateMetadata('UNSUPPORTED_SOURCE', 'APPROXIMATE'),
  /coordinateSource/
);
await assert.rejects(
  () => validateCoordinateMetadata('PUBLIC_MAP_APPROXIMATE', 'UNSUPPORTED_STATUS'),
  /coordinateStatus/
);

console.log('Infrastructure coordinate provenance schema checks passed.');
