import assert from 'node:assert/strict';
import {
  canSavePriorityConfiguration,
  commitPriorityConfigRequestIfCurrent,
  createPriorityConfigRequestGate,
  parsePriorityConfigResponse
} from './priorityConfigRequest.mjs';

const gate = createPriorityConfigRequestGate();
const state = { panchayatId: null, weights: null, error: null, loading: false };
const context = (panchayatId, isOpen = true) => ({ panchayatId, isOpen });

// A late success after switching A -> B cannot replace B's state.
const requestA = gate.begin('A');
state.loading = true;
const requestB = gate.begin('B');
state.panchayatId = 'B';
commitPriorityConfigRequestIfCurrent(gate, requestA, context('B'), () => {
  state.panchayatId = 'A';
  state.weights = 'A weights';
  state.loading = false;
});
assert.equal(state.panchayatId, 'B');
assert.equal(state.weights, null);
assert.equal(state.loading, true);
assert.equal(commitPriorityConfigRequestIfCurrent(gate, requestB, context('B'), () => {
  state.panchayatId = 'B';
  state.weights = 'B weights';
  state.loading = false;
}), true);
assert.equal(state.weights, 'B weights');
assert.equal(state.loading, false);

// Closing invalidates a pending request, including its success/error/finally commits.
const closeRequest = gate.begin('A');
state.loading = true;
assert.equal(gate.invalidate(closeRequest), true);
assert.equal(commitPriorityConfigRequestIfCurrent(gate, closeRequest, context('A', false), () => {
  state.weights = 'closed modal update';
  state.loading = false;
}), false);
assert.equal(state.weights, 'B weights');
assert.equal(state.loading, true, 'stale finally cannot alter state after close');

// An older failure cannot replace B state or clear B's loading state.
const failingA = gate.begin('A');
const loadingB = gate.begin('B');
state.loading = true;
assert.equal(commitPriorityConfigRequestIfCurrent(gate, failingA, context('B'), () => {
  state.error = 'A failed';
  state.loading = false;
}), false);
assert.equal(state.error, null);
assert.equal(state.loading, true);
assert.equal(commitPriorityConfigRequestIfCurrent(gate, loadingB, context('B'), () => {
  state.error = null;
  state.loading = false;
}), true);

const saveContext = (overrides = {}) => ({
  isOpen: true,
  isLoading: false,
  loadSucceeded: true,
  loadedPanchayatId: 'B',
  selectedPanchayatId: 'B',
  ...overrides
});
assert.equal(canSavePriorityConfiguration(saveContext({ isLoading: true })), false, 'saving is disabled while loading');
assert.equal(canSavePriorityConfiguration(saveContext({ loadedPanchayatId: 'A' })), false, 'A config cannot be saved under B');
assert.equal(canSavePriorityConfiguration(saveContext({ loadSucceeded: false })), false);
assert.equal(canSavePriorityConfiguration(saveContext({ isOpen: false })), false);
assert.equal(canSavePriorityConfiguration(saveContext()), true, 'successfully loaded B config can be saved for B');
assert.equal(canSavePriorityConfiguration(saveContext({ loadSucceeded: false })), false,
  'an incomplete response cannot enable Save after its parser rejects it');

const validConfig = {
  weights: { condition: 0.3, complaints: 0.2, population: 0.15, traffic: 0.15, maintenanceAge: 0.1, alternativeDistance: 0.1 },
  thresholds: { critical: 80, high: 60, medium: 40 },
  limits: { maxComplaintsCap: 5 },
};
assert.deepEqual(parsePriorityConfigResponse(validConfig), validConfig, 'complete direct API config remains supported');
assert.deepEqual(parsePriorityConfigResponse({ config: validConfig }), validConfig, 'the existing wrapped response shape remains supported');
assert.throws(() => parsePriorityConfigResponse({}), /weight/i);
assert.throws(() => parsePriorityConfigResponse({ thresholds: validConfig.thresholds }), /weight/i);
assert.throws(() => parsePriorityConfigResponse({ weights: validConfig.weights }), /threshold/i);
assert.throws(() => parsePriorityConfigResponse({
  ...validConfig,
  weights: { ...validConfig.weights, traffic: undefined }
}), /weight/i);
assert.throws(() => parsePriorityConfigResponse({
  ...validConfig,
  weights: { ...validConfig.weights, traffic: Number.NaN }
}), /weight/i);
assert.throws(() => parsePriorityConfigResponse({
  ...validConfig,
  thresholds: { ...validConfig.thresholds, high: Number.POSITIVE_INFINITY }
}), /threshold/i);
assert.throws(() => parsePriorityConfigResponse({
  ...validConfig,
  weights: { ...validConfig.weights, traffic: '0.15' }
}), /weight/i);

// A stale cleanup cannot invalidate a newer request.
const oldRequest = gate.begin('A');
const newRequest = gate.begin('B');
assert.equal(gate.invalidate(oldRequest), false);
assert.equal(gate.isCurrent(newRequest, context('B')), true);
console.log('PASS: Priority configuration request races, close invalidation, and save-scope guards.');
