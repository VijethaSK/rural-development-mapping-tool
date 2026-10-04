import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyGapAnalysisIfCurrent,
  createGapAnalysisRequestGate,
  deriveGapAnalysisMapCenter,
  resolveInitialGapPanchayat,
} from './gapAnalysisScope.mjs';

const panchayats = [{ _id: 'A', name: 'Panchayat A' }, { _id: 'B', name: 'Panchayat B' }];
assert.deepEqual(resolveInitialGapPanchayat([panchayats[0]], null), { selectedId: 'A', error: null });
assert.deepEqual(resolveInitialGapPanchayat(panchayats, null), { selectedId: '', error: null });
assert.deepEqual(resolveInitialGapPanchayat(panchayats, 'B'), { selectedId: 'B', error: null });
assert.equal(resolveInitialGapPanchayat(panchayats, 'not-accessible').selectedId, '');
assert.match(resolveInitialGapPanchayat(panchayats, 'not-accessible').error, /unavailable|access/i);

const gate = createGapAnalysisRequestGate();
const lifecycle = gate.activate();
gate.select(null);
assert.equal(gate.begin(null), null, 'analysis cannot start without selected Panchayat scope');

gate.select('A');
const requestA = gate.begin('A');
assert.ok(requestA);
let view = { selectedId: 'A', result: { id: 'old-A' }, error: null, loading: false };

// Selection changes clear the old result before starting the next request.
gate.select('B');
view = { selectedId: 'B', result: null, error: null, loading: true };
const requestB = gate.begin('B');
assert.ok(requestB);
assert.deepEqual(view, { selectedId: 'B', result: null, error: null, loading: true });

assert.equal(
  applyGapAnalysisIfCurrent(gate, requestA, () => { view.result = { id: 'late-A' }; }),
  false,
  'late A response cannot overwrite B'
);
assert.equal(view.result, null);
assert.equal(
  applyGapAnalysisIfCurrent(gate, requestB, () => { view.result = { id: 'B' }; }),
  true,
  'current B response is accepted'
);
assert.deepEqual(view.result, { id: 'B' });

// A failed current request starts from a cleared result, while a later stale
// failure cannot set the active Panchayat error state.
gate.select('A');
const failedA = gate.begin('A');
view = { selectedId: 'A', result: null, error: null, loading: true };
gate.select('B');
view = { selectedId: 'B', result: null, error: null, loading: true };
assert.equal(applyGapAnalysisIfCurrent(gate, failedA, () => { view.error = 'A failed'; }), false);
assert.equal(view.error, null);
const failedB = gate.begin('B');
assert.ok(failedB);
assert.equal(applyGapAnalysisIfCurrent(gate, failedB, () => { view.error = 'B failed'; }), true);
assert.equal(view.result, null, 'failed B request does not leave A results visible');
assert.equal(view.error, 'B failed');

// A stale finally handler must not clear loading state owned by a newer
// Panchayat request. This uses the same guarded side-effect helper as the page.
const finallyGate = createGapAnalysisRequestGate();
finallyGate.activate();
finallyGate.select('A');
const finallyRequestA = finallyGate.begin('A');
assert.ok(finallyRequestA);
let finallyView = { selectedId: 'A', analyzing: true, loading: true };

finallyGate.select('B');
finallyView = { selectedId: 'B', analyzing: true, loading: true };
const finallyRequestB = finallyGate.begin('B');
assert.ok(finallyRequestB);

assert.equal(
  applyGapAnalysisIfCurrent(finallyGate, finallyRequestA, () => {
    finallyView.analyzing = false;
    finallyView.loading = false;
  }),
  false,
  'A finally handler is ignored after B becomes current'
);
assert.deepEqual(finallyView, { selectedId: 'B', analyzing: true, loading: true });

assert.equal(
  applyGapAnalysisIfCurrent(finallyGate, finallyRequestB, () => {
    finallyView.analyzing = false;
    finallyView.loading = false;
  }),
  true,
  'B finally handler can clear its own loading state'
);
assert.deepEqual(finallyView, { selectedId: 'B', analyzing: false, loading: false });

// invalidateIfCurrent invalidates its current request, but a stale request
// cannot invalidate a newer request.
const invalidationGate = createGapAnalysisRequestGate();
invalidationGate.activate();
invalidationGate.select('A');
const currentRequest = invalidationGate.begin('A');
assert.ok(currentRequest);
assert.equal(invalidationGate.invalidateIfCurrent(currentRequest), true);
assert.equal(invalidationGate.isCurrent(currentRequest), false);

invalidationGate.select('B');
const newerRequest = invalidationGate.begin('B');
assert.ok(newerRequest);
assert.equal(invalidationGate.invalidateIfCurrent(currentRequest), false);
assert.equal(invalidationGate.isCurrent(newerRequest), true);

const cleanedRequest = gate.begin('B');
assert.ok(cleanedRequest);
assert.equal(gate.deactivate(lifecycle), true);
assert.equal(applyGapAnalysisIfCurrent(gate, cleanedRequest, () => { view.result = { id: 'late' }; }), false);

assert.deepEqual(deriveGapAnalysisMapCenter({ schoolBuffers: [], underservedAreas: [] }), null);
assert.deepEqual(deriveGapAnalysisMapCenter({ schoolBuffers: [{ center: { lat: 12.9, lng: 74.8 } }] }), [12.9, 74.8]);
assert.equal(deriveGapAnalysisMapCenter({ schoolBuffers: [{ center: { lat: 91, lng: 74.8 } }] }), null);

const page = readFileSync(new URL('../pages/GapAnalysisPage.tsx', import.meta.url), 'utf8');
assert.match(page, /panchayatId,\s*schoolThresholdKm/);
assert.match(page, /applyGapAnalysisIfCurrent\(requestGateRef\.current, request/);
assert.match(page, /resolveInitialGapPanchayat/);
assert.match(page, /useSearchParams/);
assert.match(page, /mapCenter\s*\?\s*\(/);
assert.doesNotMatch(page, /return\s+\[0,\s*0\]/, 'the page does not use a default [0, 0] map center');
assert.match(page, /const selectPanchayat\s*=\s*\(panchayatId: string\)/);
assert.match(page, /setResult\(null\);[\s\S]*setError\(null\);[\s\S]*setLoading\(Boolean\(panchayatId\)\)/);
assert.match(page, /disabled=\{analyzing \|\| !selectedPanchayatId \|\| panchayatsLoading\}/);
console.log('PASS: Gap Analysis Panchayat selection, request gating, and empty map helpers.');
