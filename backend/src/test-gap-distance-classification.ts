import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assessOverallGap,
  calculateDistanceRatio,
  coverageStatusForRatio,
  severityForDistanceRatio
} from './services/spatial/distanceThresholdClassification.js';
import { GapDetectionService, buildGridCellGapNotes, buildHabitationGapNotes } from './services/spatial/gapDetectionService.js';

test('distance ratio uses actual distance divided by the configured threshold', () => {
  assert.ok(Math.abs(calculateDistanceRatio(1.2, 3)! - 0.4) < 1e-12);
  assert.equal(GapDetectionService.determineSeverity(1.2, 3), 'Served');
  assert.equal(calculateDistanceRatio(0, 3), 0);
  assert.equal(GapDetectionService.determineSeverity(0, 3), 'Served');
});

test('configured severity boundaries are exact and inclusive as specified', () => {
  const cases: Array<[number, 'Served' | 'Moderate' | 'High' | 'Critical']> = [
    [0.5, 'Served'],
    [0.99, 'Served'],
    [1.0, 'Moderate'],
    [1.49, 'Moderate'],
    [1.5, 'High'],
    [1.99, 'High'],
    [2.0, 'High'],
    [2.001, 'Critical']
  ];
  for (const [ratio, severity] of cases) assert.equal(severityForDistanceRatio(ratio), severity, `ratio ${ratio}`);
  assert.equal(GapDetectionService.determineSeverity(3, 3), 'Moderate');
  assert.equal(GapDetectionService.determineSeverity(4.5, 3), 'High');
  assert.equal(GapDetectionService.determineSeverity(6, 3), 'High');
  assert.equal(GapDetectionService.determineSeverity(6.1, 3), 'Critical');
});

test('screenshot regression: 1.2 km against a configured 3 km school threshold is within range', () => {
  const ratio = calculateDistanceRatio(1.2, 3);
  assert.ok(Math.abs(ratio! - 0.4) < 1e-12);
  assert.equal(severityForDistanceRatio(ratio), 'Served');

  const overall = assessOverallGap(1.2, 3, 0.4, 1);
  assert.ok(Math.abs(overall.schoolRatio! - 0.4) < 1e-12);
  assert.ok(Math.abs(overall.roadRatio! - 0.4) < 1e-12);
  assert.ok(Math.abs(overall.ratio! - 0.4) < 1e-12);
  assert.equal(overall.severity, 'Served');
});

test('combined coverage uses the worse configured school/road ratio and identifies its basis', () => {
  const schoolIsWorse = assessOverallGap(4.5, 3, 0.5, 1);
  assert.equal(schoolIsWorse.ratio, 1.5);
  assert.equal(schoolIsWorse.severity, 'High');
  assert.equal(schoolIsWorse.severityBasis, 'SCHOOL_DISTANCE');

  const roadIsWorse = assessOverallGap(1.2, 3, 2, 1);
  assert.equal(roadIsWorse.ratio, 2);
  assert.equal(roadIsWorse.severity, 'High');
  assert.equal(roadIsWorse.severityBasis, 'ROAD_DISTANCE');
});

test('unavailable or invalid distances have no fabricated ratio and preserve Critical no-facility status', () => {
  for (const distance of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    assert.equal(calculateDistanceRatio(distance, 3), null);
    assert.equal(GapDetectionService.determineSeverity(distance as number, 3), 'Critical');
  }
  assert.equal(calculateDistanceRatio(Number.MAX_VALUE, Number.MIN_VALUE), null,
    'overflowing ratios are treated as unavailable, not exposed as Infinity');

  const missingRoad = assessOverallGap(1.2, 3, null, 1);
  assert.ok(Math.abs(missingRoad.schoolRatio! - 0.4) < 1e-12);
  assert.equal(missingRoad.roadRatio, null);
  assert.equal(missingRoad.ratio, null);
  assert.equal(missingRoad.severity, 'Critical');
  assert.equal(missingRoad.severityBasis, 'MISSING_FACILITY_DISTANCE');
  assert.equal(coverageStatusForRatio(null), 'NO_FACILITY');
});

test('invalid thresholds are rejected and exact threshold is classified as an at-threshold gap', () => {
  for (const threshold of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => calculateDistanceRatio(1, threshold), /positive finite/);
  }
  assert.equal(coverageStatusForRatio(0.99), 'WITHIN_THRESHOLD');
  assert.equal(coverageStatusForRatio(1), 'AT_THRESHOLD');
  assert.equal(coverageStatusForRatio(1.01), 'BEYOND_THRESHOLD');
});

test('popup notes describe actual school and road threshold status rather than calling both distances gaps', () => {
  const gridNotes = buildGridCellGapNotes('cell-1', 1.2, 3, 0.4, 1);
  assert.match(gridNotes, /school distance is 1\.200 km .* ratio: 0\.4x; within acceptable threshold/);
  assert.match(gridNotes, /road distance is 0\.400 km .* ratio: 0\.4x; within acceptable threshold/);
  assert.doesNotMatch(gridNotes, /School gap =|Road gap =/);

  const unavailableNotes = buildHabitationGapNotes('Hamlet', 1.2, 3, undefined, undefined, 1);
  assert.match(unavailableNotes, /school distance is 1\.200 km .* within acceptable threshold/);
  assert.match(unavailableNotes, /road distance unavailable \(no usable road geometry\)/);
});
