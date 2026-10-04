function normalizeId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function resolveInitialGapPanchayat(panchayats, requestedId) {
  const requested = normalizeId(requestedId);
  if (requested) {
    const match = panchayats.find((panchayat) => normalizeId(panchayat?._id) === requested);
    return match
      ? { selectedId: match._id, error: null }
      : { selectedId: '', error: 'The requested Panchayat is unavailable or you do not have access to it. Select an available Panchayat.' };
  }

  if (panchayats.length === 1) return { selectedId: panchayats[0]._id, error: null };
  return { selectedId: '', error: null };
}

export function createGapAnalysisRequestGate() {
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

export function applyGapAnalysisIfCurrent(gate, request, effect) {
  if (!gate.isCurrent(request)) return false;
  effect();
  return true;
}

function validCoordinate(point) {
  return point && typeof point.lat === 'number' && Number.isFinite(point.lat) &&
    point.lat >= -90 && point.lat <= 90 && typeof point.lng === 'number' &&
    Number.isFinite(point.lng) && point.lng >= -180 && point.lng <= 180;
}

export function deriveGapAnalysisMapCenter(result) {
  for (const item of result?.schoolBuffers || []) {
    if (validCoordinate(item?.center)) return [item.center.lat, item.center.lng];
  }
  for (const area of result?.underservedAreas || []) {
    if (validCoordinate(area?.center)) return [area.center.lat, area.center.lng];
  }
  return null;
}
