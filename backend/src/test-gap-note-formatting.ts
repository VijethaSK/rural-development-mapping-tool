import assert from 'node:assert/strict';
import { buildGridCellGapNotes, buildHabitationGapNotes } from './services/spatial/gapDetectionService.js';

const habitationUnavailable = buildHabitationGapNotes('Remote Hamlet', 4.2, 3, undefined, undefined, 1);
assert.match(habitationUnavailable, /Road distance unavailable \(no usable road geometry\)/);
assert.doesNotMatch(habitationUnavailable, /Infinity|NaN/);

const gridUnavailable = buildGridCellGapNotes('cell-1', Infinity, 3, Infinity, 1);
assert.match(gridUnavailable, /School gap = unavailable/);
assert.match(gridUnavailable, /Road distance unavailable \(no usable road geometry\)/);
assert.doesNotMatch(gridUnavailable, /Infinity|NaN/);

const habitationZero = buildHabitationGapNotes('Central Village', 0, 3, undefined, 0, 1);
assert.match(habitationZero, /nearest road is 0\.0 km \(threshold: 1 km\)/);

const gridZero = buildGridCellGapNotes('cell-2', 0, 3, 0, 1);
assert.match(gridZero, /Road gap = 0\.0 km \(threshold: 1 km\)/);

console.log('PASS: habitation and grid notes show unavailable road distance safely and preserve genuine zero distances.');
