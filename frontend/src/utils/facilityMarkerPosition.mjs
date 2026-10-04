const isValidLatLng = (lat, lng) =>
  typeof lat === 'number' &&
  Number.isFinite(lat) &&
  lat >= -90 &&
  lat <= 90 &&
  typeof lng === 'number' &&
  Number.isFinite(lng) &&
  lng >= -180 &&
  lng <= 180;

/** Converts supported infrastructure point fields to Leaflet's [latitude, longitude] order. */
export function toFacilityMarkerPosition(location) {
  if (!location || typeof location !== 'object') return null;

  const coordinates = location.coordinates;
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    const [longitude, latitude] = coordinates;
    if (isValidLatLng(latitude, longitude)) return [latitude, longitude];
  }

  if (isValidLatLng(location.lat, location.lng)) return [location.lat, location.lng];
  return null;
}
