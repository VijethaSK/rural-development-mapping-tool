const PRIORITY_LEVELS = new Set(['Critical', 'High', 'Medium', 'Low', 'Unavailable']);

function normalizeId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function resolveInitialPriorityPanchayat(panchayats, requestedId) {
  const requested = normalizeId(requestedId);
  if (requested) {
    const match = panchayats.find((panchayat) => normalizeId(panchayat?._id) === requested);
    return match
      ? { selectedId: match._id, error: null }
      : { selectedId: '', error: 'The requested Panchayat is unavailable or you do not have access to it.' };
  }
  if (panchayats.length === 1) return { selectedId: panchayats[0]._id, error: null };
  return { selectedId: '', error: null };
}

export function updatePrioritySearchParams(current, panchayatId) {
  const next = new URLSearchParams(current);
  const normalized = normalizeId(panchayatId);
  if (normalized) next.set('panchayatId', normalized);
  else next.delete('panchayatId');
  return next;
}

export function buildPriorityRequestPath(panchayatId) {
  const normalized = normalizeId(panchayatId);
  if (!normalized) throw new Error('Select a Panchayat before loading priorities.');
  const params = new URLSearchParams({ panchayatId: normalized });
  return `/api/priorities?${params.toString()}`;
}

function validStats(stats) {
  if (!stats || typeof stats !== 'object') return false;
  const countFields = ['total', 'critical', 'high', 'medium', 'low'];
  if (!countFields.every((key) => Number.isInteger(stats[key]) && stats[key] >= 0)) return false;
  if (stats.unscored != null && (!Number.isInteger(stats.unscored) || stats.unscored < 0)) return false;
  return typeof stats.averageScore === 'number' && Number.isFinite(stats.averageScore);
}

function validItem(item) {
  return Boolean(item && typeof item === 'object' && !Array.isArray(item) &&
    typeof item._id === 'string' && typeof item.name === 'string' && typeof item.type === 'string' &&
    (item.priorityScore === null || (typeof item.priorityScore === 'number' && Number.isFinite(item.priorityScore))) &&
    PRIORITY_LEVELS.has(item.priorityLevel));
}

export function parsePriorityResponse(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response) ||
    !Array.isArray(response.items) || !response.items.every(validItem) || !validStats(response.stats)) {
    throw new Error('The priority response was invalid. Expected an items array and valid stats.');
  }
  return { items: response.items, stats: response.stats };
}

export function isScoredPriority(item) {
  return typeof item?.priorityScore === 'number' && Number.isFinite(item.priorityScore) &&
    item.priorityLevel !== 'Unavailable';
}

export function getPriorityDisplaySummary(items, stats) {
  const scoredCount = items.filter(isScoredPriority).length;
  const derivedUnscoredCount = Math.max(0, items.length - scoredCount);
  return {
    total: stats.total,
    scored: scoredCount,
    unscored: stats.unscored ?? derivedUnscoredCount,
    critical: stats.critical,
    high: stats.high,
    medium: stats.medium,
    low: stats.low,
    averageScore: scoredCount > 0 ? stats.averageScore : null
  };
}

export function getPriorityEmptyState({ selectedPanchayat, panchayatCount, selectionError, items, stats, scoredCount, filteredCount }) {
  if (!selectedPanchayat) {
    if (selectionError) return 'invalid-selection';
    return panchayatCount === 0 ? 'no-panchayats' : 'select-panchayat';
  }
  if (items.length === 0 && stats?.total === 0) return 'no-assets';
  if (items.length === 0) return 'inconsistent-response';
  if (scoredCount === 0) return 'none-scorable';
  if (filteredCount === 0) return 'filters-empty';
  return null;
}

export function filterAndSortPriorityItems(items, { typeFilter, priorityFilter, searchTerm, sortBy }) {
  const term = searchTerm.trim().toLowerCase();
  return items.filter(isScoredPriority).filter((asset) => {
    if (typeFilter !== 'All' && asset.type.toLowerCase() !== typeFilter.toLowerCase()) return false;
    if (priorityFilter !== 'All' && asset.priorityLevel !== priorityFilter) return false;
    if (term) {
      const matchName = asset.name.toLowerCase().includes(term);
      const matchHabitation = asset.habitationName?.toLowerCase().includes(term);
      const matchType = asset.type.toLowerCase().includes(term);
      if (!matchName && !matchHabitation && !matchType) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === 'score') return (b.priorityScore ?? -1) - (a.priorityScore ?? -1);
    if (sortBy === 'complaints') return (b.complaintsCount ?? -1) - (a.complaintsCount ?? -1);
    if (sortBy === 'population') return (b.populationServed ?? -1) - (a.populationServed ?? -1);
    return 0;
  });
}

export function createPriorityRequestGate() {
  let generation = 0;
  let selectedPanchayatId = null;
  let lifecycleSequence = 0;
  let activeLifecycleId = null;

  return {
    activate() {
      const lifecycleId = ++lifecycleSequence;
      activeLifecycleId = lifecycleId;
      generation += 1;
      return lifecycleId;
    },
    deactivate(lifecycleId) {
      if (lifecycleId !== activeLifecycleId) return false;
      activeLifecycleId = null;
      generation += 1;
      return true;
    },
    select(panchayatId) {
      selectedPanchayatId = normalizeId(panchayatId);
      generation += 1;
    },
    begin(panchayatId) {
      const normalizedId = normalizeId(panchayatId);
      if (!activeLifecycleId || !normalizedId || normalizedId !== selectedPanchayatId) return null;
      generation += 1;
      return { generation, panchayatId: normalizedId, lifecycleId: activeLifecycleId };
    },
    isCurrent(request) {
      return Boolean(request) && request.generation === generation &&
        request.panchayatId === selectedPanchayatId && request.lifecycleId === activeLifecycleId;
    },
    invalidateIfCurrent(request) {
      if (!request || request.generation !== generation || request.panchayatId !== selectedPanchayatId ||
        request.lifecycleId !== activeLifecycleId) return false;
      generation += 1;
      return true;
    }
  };
}

export function applyPriorityResultIfCurrent(gate, request, effect) {
  if (!gate.isCurrent(request)) return false;
  effect();
  return true;
}
