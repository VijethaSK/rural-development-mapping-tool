import assert from 'node:assert/strict';
import {
  commitMapDataIfCurrent,
  createMapBootstrapGuard,
  createMapRequestGate,
  deriveScopedMapCenter,
  runMapRequestIfCurrent,
} from './mapPageScope.mjs';

// A cleaned-up bootstrap response cannot set the Panchayat list or selection,
// and its cleanup is isolated from a newer effect instance.
const oldBootstrap = createMapBootstrapGuard();
const currentBootstrap = createMapBootstrapGuard();
let bootstrapState = { panchayats: [], selectedPanchayat: null };
oldBootstrap.cleanup();
assert.equal(
  oldBootstrap.run(() => { bootstrapState = { panchayats: ['stale'], selectedPanchayat: 'stale' }; }),
  false,
  'an unmounted bootstrap effect cannot update Panchayat state'
);
assert.deepEqual(bootstrapState, { panchayats: [], selectedPanchayat: null });
assert.equal(
  currentBootstrap.run(() => { bootstrapState = { panchayats: ['current'], selectedPanchayat: 'current' }; }),
  true,
  'a newer bootstrap effect remains active after older cleanup'
);
assert.deepEqual(bootstrapState, { panchayats: ['current'], selectedPanchayat: 'current' });

const gate = createMapRequestGate();
let requestCount = 0;
gate.select(null);
const unresolvedRequest = gate.begin(null);
if (unresolvedRequest) requestCount += 1;
assert.equal(unresolvedRequest, null, 'unresolved Panchayat selection cannot begin a map data request');
assert.equal(requestCount, 0, 'no unscoped request is started');

gate.select('panchayat-a');
const requestA = gate.begin('panchayat-a');
assert.ok(requestA);
const cache = {};
let displayedData = 'initial';

gate.select('panchayat-b');
const staleApplied = commitMapDataIfCurrent(
  gate,
  requestA,
  'panchayat-a_All',
  'response-a',
  cache,
  data => { displayedData = data; }
);
assert.equal(staleApplied, false, 'late Panchayat A response is rejected');
assert.equal(displayedData, 'initial', 'stale response cannot update page state');
assert.equal(cache['panchayat-a_All'], undefined, 'stale response cannot update cache');

const requestB = gate.begin('panchayat-b');
assert.ok(requestB);
const currentApplied = commitMapDataIfCurrent(
  gate,
  requestB,
  'panchayat-b_All',
  'response-b',
  cache,
  data => { displayedData = data; }
);
assert.equal(currentApplied, true, 'current Panchayat response can be applied');
assert.equal(displayedData, 'response-b');
assert.equal(cache['panchayat-b_All'], 'response-b');

// A -> B -> A must not make the first A request current again.
const abaGate = createMapRequestGate();
const abaCache = {};
let abaDisplayedData = 'initial';
abaGate.select('panchayat-a');
const firstARequest = abaGate.begin('panchayat-a');
assert.ok(firstARequest);
abaGate.select('panchayat-b');
abaGate.begin('panchayat-b');
abaGate.select('panchayat-a');
const secondARequest = abaGate.begin('panchayat-a');
assert.ok(secondARequest);
assert.equal(
  commitMapDataIfCurrent(abaGate, firstARequest, 'panchayat-a_All', 'old-a', abaCache, data => { abaDisplayedData = data; }),
  false,
  'the first A response stays stale after returning to A'
);
assert.equal(abaDisplayedData, 'initial');
assert.equal(abaCache['panchayat-a_All'], undefined);
assert.equal(
  commitMapDataIfCurrent(abaGate, secondARequest, 'panchayat-a_All', 'new-a', abaCache, data => { abaDisplayedData = data; }),
  true,
  'the latest A request may apply'
);

// Starting a newer request for the same selection invalidates the older request.
const newerGate = createMapRequestGate();
const newerCache = {};
let newerDisplayedData = 'initial';
newerGate.select('panchayat-a');
const oldARequest = newerGate.begin('panchayat-a');
const newerARequest = newerGate.begin('panchayat-a');
assert.ok(oldARequest && newerARequest);
assert.equal(
  commitMapDataIfCurrent(newerGate, oldARequest, 'panchayat-a_All', 'old-response', newerCache, data => { newerDisplayedData = data; }),
  false,
  'an old response cannot apply after a newer request starts'
);
assert.equal(newerDisplayedData, 'initial');
assert.equal(newerCache['panchayat-a_All'], undefined);

// The same guard used around request error handling prevents stale failures from
// changing the active error side effect/state.
let activeError = null;
const errorApplied = runMapRequestIfCurrent(newerGate, oldARequest, () => {
  activeError = 'stale request failed';
});
assert.equal(errorApplied, false);
assert.equal(activeError, null, 'a stale request failure cannot update active error state');

// Effect cleanup invalidates all requests from its lifecycle, including a
// manual refresh, while an old cleanup cannot invalidate a newer lifecycle.
const cleanupGate = createMapRequestGate();
const cleanupCache = {};
let cleanupDisplayedData = 'initial';
cleanupGate.select('panchayat-a');
const unmountedLifecycle = cleanupGate.activate();
const pendingUnmountRequest = cleanupGate.begin('panchayat-a');
assert.ok(pendingUnmountRequest);
const pendingRefreshRequest = cleanupGate.begin('panchayat-a');
assert.ok(pendingRefreshRequest);
assert.equal(cleanupGate.deactivate(unmountedLifecycle), true, 'effect cleanup deactivates its lifecycle');
assert.equal(
  commitMapDataIfCurrent(cleanupGate, pendingRefreshRequest, 'panchayat-a_All', 'late-response', cleanupCache, data => { cleanupDisplayedData = data; }),
  false,
  'a cleaned-up request cannot update state'
);
assert.equal(cleanupCache['panchayat-a_All'], undefined, 'a cleaned-up request cannot update cache');

const mountedLifecycle = cleanupGate.activate();
const cleanupNewerRequest = cleanupGate.begin('panchayat-a');
assert.ok(cleanupNewerRequest);
assert.equal(cleanupGate.deactivate(unmountedLifecycle), false, 'an old cleanup cannot deactivate a newer lifecycle');
assert.equal(
  commitMapDataIfCurrent(cleanupGate, cleanupNewerRequest, 'panchayat-a_All', 'current-response', cleanupCache, data => { cleanupDisplayedData = data; }),
  true,
  'the newer request remains current after an older cleanup'
);
assert.equal(cleanupDisplayedData, 'current-response');
assert.equal(cleanupGate.deactivate(mountedLifecycle), true);

const adyar = { _id: 'adyar', centerCoord: null };
const assets = [
  { panchayatId: 'varthur', location: { type: 'Point', coordinates: [77.75, 12.95] } },
  { panchayatId: 'adyar', location: { type: 'Point', coordinates: [74.93, 12.87] } },
  { panchayatId: 'adyar', location: { type: 'Point', coordinates: [181, 12.87] } }
];
assert.deepEqual(deriveScopedMapCenter(adyar, assets), [12.87, 74.93], 'fallback center comes from valid selected-Panchayat coordinates only');
assert.equal(deriveScopedMapCenter(adyar, [assets[0]]), null, 'other Panchayat coordinates cannot supply the fallback center');
assert.equal(deriveScopedMapCenter(adyar, [assets[2]]), null, 'invalid coordinates produce no invented center');
assert.equal(deriveScopedMapCenter({ _id: 'adyar', centerCoord: { lat: 91, lng: 74 } }, []), null, 'invalid Panchayat center is rejected');
assert.equal(deriveScopedMapCenter(null, assets), null, 'no selected Panchayat produces no center');

console.log('PASS: Map request scoping, ABA/newer-request races, stale failures, cleanup, and scoped center helpers.');
