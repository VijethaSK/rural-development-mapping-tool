function normalizePanchayatId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Owns bootstrap side effects for one effect setup/cleanup pair. */
export function createMapBootstrapGuard() {
  let active = true;

  return {
    isActive() {
      return active;
    },
    run(effect) {
      if (!active) return false;
      effect();
      return true;
    },
    cleanup() {
      active = false;
    },
  };
}

/** Tracks the selected Panchayat and invalidates work started for an older selection. */
export function createMapRequestGate() {
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
      selectedPanchayatId = normalizePanchayatId(panchayatId);
      generation += 1;
    },
    invalidate() {
      generation += 1;
      return true;
    },
    begin(panchayatId) {
      const normalizedId = normalizePanchayatId(panchayatId);
      if (!normalizedId || normalizedId !== selectedPanchayatId) return null;
      generation += 1;
      return { generation, panchayatId: normalizedId, lifecycleId: activeLifecycleId };
    },
    isCurrent(request) {
      return Boolean(request) && request.generation === generation && request.panchayatId === selectedPanchayatId &&
        request.lifecycleId === activeLifecycleId;
    }
  };
}

/** Apply both cache and UI updates only while the request still owns the selection. */
export function commitMapDataIfCurrent(gate, request, cacheKey, data, cache, apply) {
  return runMapRequestIfCurrent(gate, request, () => {
    cache[cacheKey] = data;
    apply(data);
  });
}

/** Run a request side effect only while that request still owns the selection. */
export function runMapRequestIfCurrent(gate, request, effect) {
  if (!gate.isCurrent(request)) return false;
  effect();
  return true;
}

function isValidLatLng(lat, lng) {
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

function getAssetCenter(asset) {
  const coordinates = asset?.location?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length === 2 && isValidLatLng(coordinates[1], coordinates[0])) {
    return [coordinates[1], coordinates[0]];
  }

  const location = asset?.location;
  if (location && isValidLatLng(location.lat, location.lng)) return [location.lat, location.lng];
  return null;
}

/** Uses the selected Panchayat center or a valid coordinate from its own assets only. */
export function deriveScopedMapCenter(panchayat, assets) {
  const panchayatId = normalizePanchayatId(panchayat?._id);
  if (!panchayatId) return null;

  const center = panchayat.centerCoord;
  if (center && isValidLatLng(center.lat, center.lng)) return [center.lat, center.lng];

  for (const asset of assets) {
    if (String(asset?.panchayatId ?? '') !== panchayatId) continue;
    const assetCenter = getAssetCenter(asset);
    if (assetCenter) return assetCenter;
  }

  return null;
}
