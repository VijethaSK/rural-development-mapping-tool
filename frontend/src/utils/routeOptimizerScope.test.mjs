import assert from 'node:assert/strict';
import {
  candidateRequestPath,
  isFiniteCoordinate,
  panchayatsVisibleToUser,
  resetRouteSelection,
  routeMethodOverlayLabel,
  resolveRouteOrigin,
  shouldApplyCandidateResponse,
  shouldApplyOptimizationResponse
} from './routeOptimizerScope.ts';

const selectedId = 'panchayat-a';
assert.equal(
  candidateRequestPath(selectedId),
  '/api/routes/candidates?panchayatId=panchayat-a',
  'candidate requests include the selected Panchayat ID'
);
assert.equal(candidateRequestPath(''), null, 'no selection means no candidate request');

const reset = resetRouteSelection();
assert.deepEqual(reset.candidates, [], 'changing Panchayat clears prior candidates');
assert.equal(reset.selectedIds.size, 0, 'changing Panchayat clears prior stop selections');
assert.equal(reset.startCoord, null, 'changing Panchayat resets the depot');
assert.equal(reset.result, null, 'changing Panchayat clears the previous route result');

assert.equal(shouldApplyCandidateResponse('panchayat-a', 'panchayat-a'), true);
assert.equal(
  shouldApplyCandidateResponse('panchayat-a', 'panchayat-b'),
  false,
  'a stale response cannot replace candidates after selection changes'
);

let selectedPanchayatId = 'panchayat-a';
let optimizationVersion = 1;
const requestPanchayatId = selectedPanchayatId;
const requestVersion = optimizationVersion;
let displayedResult = null;

selectedPanchayatId = 'panchayat-b';
optimizationVersion += 1;
const resultForA = { panchayatId: 'panchayat-a', route: 'route-a' };
if (shouldApplyOptimizationResponse(requestPanchayatId, selectedPanchayatId, requestVersion, optimizationVersion)) {
  displayedResult = resultForA;
}
assert.equal(displayedResult, null, 'a response for Panchayat A is ignored after switching to Panchayat B');

const currentRequestVersion = ++optimizationVersion;
const resultForB = { panchayatId: 'panchayat-b', route: 'route-b' };
if (shouldApplyOptimizationResponse('panchayat-b', selectedPanchayatId, currentRequestVersion, optimizationVersion)) {
  displayedResult = resultForB;
}
assert.deepEqual(displayedResult, resultForB, 'the current Panchayat/request generation can populate the result');

assert.equal(
  shouldApplyOptimizationResponse('panchayat-b', 'panchayat-b', currentRequestVersion, currentRequestVersion + 1),
  false,
  'an older request for the same Panchayat is ignored after a newer request starts'
);

const orderingLabel = 'Priority-weighted nearest-neighbor ordering | 2-opt heuristic';
assert.equal(
  routeMethodOverlayLabel({ routingMethod: 'NETWORK_ROUTE', fallbackUsed: false, orderedStops: [{ routingMethod: 'NETWORK_ROUTE' }] }),
  `Dijkstra per leg | ${orderingLabel}`,
  'network legs retain the Dijkstra label'
);
assert.equal(
  routeMethodOverlayLabel({ routingMethod: 'STRAIGHT_LINE_FALLBACK', fallbackUsed: true, orderedStops: [{ routingMethod: 'STRAIGHT_LINE_FALLBACK' }] }),
  `Straight-line fallback | ${orderingLabel}`,
  'fallback-only results do not claim Dijkstra routing'
);
assert.equal(
  routeMethodOverlayLabel({ routingMethod: 'STRAIGHT_LINE_FALLBACK', fallbackUsed: true, orderedStops: [{ routingMethod: 'NETWORK_ROUTE' }, { routingMethod: 'STRAIGHT_LINE_FALLBACK' }] }),
  `Mixed network and straight-line fallback | ${orderingLabel}`,
  'mixed legs are identified as mixed routing'
);
assert.equal(
  routeMethodOverlayLabel(null),
  `Routing method pending | ${orderingLabel}`,
  'the overlay does not claim a route method before a result exists'
);

assert.deepEqual(panchayatsVisibleToUser([
  { _id: 'panchayat-a', name: 'Panchayat A' },
  { _id: 'panchayat-b', name: 'Panchayat B' }
], 'panchayat-b').map((item) => item._id), ['panchayat-b']);
assert.equal(panchayatsVisibleToUser([
  { _id: 'panchayat-a', name: 'Panchayat A' }
]).length, 1, 'system-wide users can see all returned Panchayats');

assert.equal(resolveRouteOrigin(null, 'Panchayat A', null), null, 'no Panchayat and no stop must not invent an origin');
assert.deepEqual(
  resolveRouteOrigin({ lat: 12.5, lng: 76.5 }, 'Panchayat A', { lat: 1, lng: 2 }),
  { coordinate: { lat: 12.5, lng: 76.5 }, name: 'Panchayat A center', estimated: false },
  'the selected Panchayat center takes precedence over candidate coordinates'
);
assert.deepEqual(
  resolveRouteOrigin(null, 'Panchayat A', { lat: 12.6, lng: 76.6 }),
  { coordinate: { lat: 12.6, lng: 76.6 }, name: 'Estimated origin at first available infrastructure', estimated: true },
  'missing centers use only a clearly labelled selected-Panchayat candidate origin'
);
assert.equal(isFiniteCoordinate({ lat: 91, lng: 76 }), false);

console.log('PASS: Route Optimizer Panchayat scoping helpers (request, reset, stale response, options, and depot).');
