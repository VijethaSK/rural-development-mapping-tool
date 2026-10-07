import assert from 'node:assert/strict';
import test from 'node:test';
import { hasVerifiedSpatialProvenance } from './spatialProvenance.mjs';

const verifiedSurvey = {
  coordinatesVerified: true,
  coordinateStatus: 'VERIFIED',
  coordinateSource: 'FIELD_SURVEY'
};

test('only explicitly verified trusted-source coordinates are distinguished as verified', () => {
  assert.equal(hasVerifiedSpatialProvenance(verifiedSurvey), true);
  for (const record of [
    null,
    {},
    { ...verifiedSurvey, coordinatesVerified: false },
    { ...verifiedSurvey, coordinateStatus: undefined },
    { ...verifiedSurvey, coordinateStatus: 'APPROXIMATE' },
    { ...verifiedSurvey, coordinateSource: 'PUBLIC_MAP_APPROXIMATE' },
    { ...verifiedSurvey, coordinateSource: 'SOURCE_EXCEL' },
    { ...verifiedSurvey, isSynthetic: true },
    { ...verifiedSurvey, dataOrigin: 'DEMO' },
    { ...verifiedSurvey, source: 'RDMT_GAP_ANALYSIS_SYNTHETIC_DEMO_V1' }
  ]) assert.equal(hasVerifiedSpatialProvenance(record), false);
});
