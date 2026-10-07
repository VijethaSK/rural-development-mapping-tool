import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSyntheticGapDemonstration, visibleGapCoverageCells } from './gapAnalysisCoverage.mjs';

const polygonGeometry = { type: 'Polygon', coordinates: [[[74.9, 12.84], [74.91, 12.84], [74.9, 12.85], [74.9, 12.84]]] };
const area = (id, severity, issue = 'Served') => ({
  id,
  areaType: 'GridCell',
  polygonGeometry,
  overallSeverity: severity,
  primaryIssue: issue
});

test('synthetic coverage map includes served and underserved cells and filters by severity', () => {
  const result = {
    syntheticDemonstration: true,
    demonstrationGridCells: [area('served', 'Served'), area('moderate', 'Moderate', 'Road_Isolation')],
    underservedAreas: [area('moderate', 'Moderate', 'Road_Isolation')]
  };

  assert.equal(hasSyntheticGapDemonstration(result), true);
  assert.deepEqual(visibleGapCoverageCells(result).map((cell) => cell.id), ['served', 'moderate']);
  assert.deepEqual(visibleGapCoverageCells(result, 'All', 'Served').map((cell) => cell.id), ['served']);
  assert.deepEqual(visibleGapCoverageCells(result, 'Road_Isolation').map((cell) => cell.id), ['moderate']);
});

test('ordinary analyses continue to map only underserved grid cells', () => {
  const result = {
    underservedAreas: [
      area('critical', 'Critical', 'School_Gap'),
      { ...area('habitation', 'High'), areaType: 'Habitation' }
    ]
  };

  assert.equal(hasSyntheticGapDemonstration(result), false);
  assert.deepEqual(visibleGapCoverageCells(result).map((cell) => cell.id), ['critical']);
});

test('missing-distance critical cells retain a null ratio without a fabricated map value', () => {
  const missingDistance = { ...area('missing', 'Critical'), distanceToThresholdRatio: null, severityBasis: 'MISSING_FACILITY_DISTANCE' };
  const result = { syntheticDemonstration: true, demonstrationGridCells: [missingDistance], underservedAreas: [missingDistance] };

  assert.equal(visibleGapCoverageCells(result)[0].distanceToThresholdRatio, null);
});
