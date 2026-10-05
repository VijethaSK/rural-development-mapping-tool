export function createPriorityConfigRequestGate() {
  let generation = 0;
  let activeRequest = null;

  return {
    begin(panchayatId) {
      if (typeof panchayatId !== 'string' || !panchayatId.trim()) return null;
      const request = { generation: ++generation, panchayatId: panchayatId.trim() };
      activeRequest = request;
      return request;
    },
    invalidate(request) {
      if (!request || activeRequest !== request) return false;
      activeRequest = null;
      generation += 1;
      return true;
    },
    isCurrent(request, { isOpen, panchayatId }) {
      return Boolean(isOpen && request && activeRequest === request && request.panchayatId === panchayatId);
    }
  };
}

export function commitPriorityConfigRequestIfCurrent(gate, request, context, effect) {
  if (!gate.isCurrent(request, context)) return false;
  effect();
  return true;
}

const WEIGHT_FIELDS = [
  'condition',
  'complaints',
  'population',
  'traffic',
  'maintenanceAge',
  'alternativeDistance'
];
const THRESHOLD_FIELDS = ['critical', 'high', 'medium'];

export function parsePriorityConfigResponse(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('Priority configuration response must be an object.');
  }
  const config = response.config ?? response;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Priority configuration response must contain a configuration object.');
  }
  if (!config.weights || typeof config.weights !== 'object' || Array.isArray(config.weights) ||
    !WEIGHT_FIELDS.every((field) => Number.isFinite(config.weights[field]) && config.weights[field] >= 0 && config.weights[field] <= 1)) {
    throw new Error('Priority configuration must contain all valid weight values.');
  }
  const weightTotal = WEIGHT_FIELDS.reduce((sum, field) => sum + config.weights[field], 0);
  if (Math.abs(weightTotal - 1) > 0.01) {
    throw new Error('Priority configuration weights must sum to 100%.');
  }
  if (!config.thresholds || typeof config.thresholds !== 'object' || Array.isArray(config.thresholds) ||
    !THRESHOLD_FIELDS.every((field) => Number.isFinite(config.thresholds[field]) && config.thresholds[field] >= 0 && config.thresholds[field] <= 100)) {
    throw new Error('Priority configuration must contain all valid threshold values.');
  }
  if (config.notes != null && typeof config.notes !== 'string') {
    throw new Error('Priority configuration notes must be text when provided.');
  }
  return config;
}

export function canSavePriorityConfiguration({
  isOpen,
  isLoading,
  loadSucceeded,
  loadedPanchayatId,
  selectedPanchayatId
}) {
  return Boolean(isOpen && !isLoading && loadSucceeded && selectedPanchayatId &&
    loadedPanchayatId === selectedPanchayatId);
}
