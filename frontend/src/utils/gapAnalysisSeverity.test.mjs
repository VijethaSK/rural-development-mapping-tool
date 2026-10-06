import assert from 'node:assert/strict';
import { test } from 'node:test';
import { criticalGapLegendText, formatCoverageStatus, formatDistanceRatio, formatGapSeverity, formatSeverityBasis } from './gapAnalysisSeverity.mjs';

test('display formatter does not round a ratio across a severity boundary', () => {
  const ratio = 4.499 / 3;
  assert.equal(formatDistanceRatio(ratio), '<1.5x');
  assert.equal(formatDistanceRatio(0.4), '0.4x');
  assert.equal(formatDistanceRatio(1.5), '1.5x');
});

test('unavailable ratios are never presented as a numeric multiplier', () => {
  for (const ratio of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    assert.equal(formatDistanceRatio(ratio), 'unavailable');
  }
});

test('Served has an explicit no-gap label and missing-distance critical basis is disclosed', () => {
  assert.equal(formatGapSeverity('Served'), 'No Gap / Within Acceptable Threshold');
  assert.match(formatSeverityBasis('MISSING_FACILITY_DISTANCE'), /distances are unavailable/);
  assert.match(formatCoverageStatus('AT_THRESHOLD'), /gap begins at 1.0x/);
});

test('Critical legend explains both ratio-based and unavailable-distance classification', () => {
  assert.equal(criticalGapLegendText, '> 2.0x ratio or required distance unavailable');
});
