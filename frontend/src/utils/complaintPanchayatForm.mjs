export function normalizeComplaintPanchayats(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item._id === 'string' && item._id && typeof item.name === 'string' && item.name);
}

export function resetComplaintPanchayatFields() {
  return { infrastructureId: '', ward: '', village: '', assets: [] };
}

export function selectComplaintPanchayat(panchayatId) {
  return { selectedPanchayatId: panchayatId || '', ...resetComplaintPanchayatFields() };
}

export function shouldUseAssetLocation(currentCoordinates) {
  return currentCoordinates == null;
}

export function complaintAssetPanchayatQuery(panchayatId) {
  return panchayatId ? `/priorities?panchayatId=${encodeURIComponent(panchayatId)}` : null;
}

export function filterComplaintAssetsByPanchayat(items, panchayatId) {
  if (!Array.isArray(items) || !panchayatId) return [];
  return items.filter((item) => item && String(item.panchayatId) === String(panchayatId));
}
