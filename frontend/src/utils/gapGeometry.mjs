const isValidPosition = (position) =>
  Array.isArray(position) &&
  position.length === 2 &&
  typeof position[0] === 'number' && Number.isFinite(position[0]) &&
  position[0] >= -180 && position[0] <= 180 &&
  typeof position[1] === 'number' && Number.isFinite(position[1]) &&
  position[1] >= -90 && position[1] <= 90;

const hasAtLeastThreeDistinctPositionsAndArea = (ring) => {
  const vertices = ring.slice(0, -1);
  const uniqueVertices = new Set(vertices.map(([longitude, latitude]) =>
    `${longitude === 0 ? 0 : longitude},${latitude === 0 ? 0 : latitude}`
  ));
  if (uniqueVertices.size < 3) return false;

  let twiceArea = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const [longitude, latitude] = vertices[index];
    const [nextLongitude, nextLatitude] = vertices[(index + 1) % vertices.length];
    twiceArea += longitude * nextLatitude - nextLongitude * latitude;
  }
  return Number.isFinite(twiceArea) && twiceArea !== 0;
};

/** Convert a valid GeoJSON Polygon to Leaflet rings, swapping [lng, lat] to [lat, lng]. */
export function toLeafletPolygonPositions(geometry) {
  if (!geometry || typeof geometry !== 'object' || geometry.type !== 'Polygon') return null;
  if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) return null;

  const rings = Array.from(geometry.coordinates);
  const positionsByRing = [];
  for (const ring of rings) {
    if (!Array.isArray(ring)) return null;
    const positions = Array.from(ring);
    if (
      positions.length < 4 ||
      !positions.every(isValidPosition) ||
      positions[0][0] !== positions[positions.length - 1][0] ||
      positions[0][1] !== positions[positions.length - 1][1] ||
      !hasAtLeastThreeDistinctPositionsAndArea(positions)
    ) return null;
    positionsByRing.push(positions);
  }

  return positionsByRing.map((ring) => ring.map(([longitude, latitude]) => [latitude, longitude]));
}

export function isValidGapCenter(center) {
  return Boolean(
    center &&
    typeof center === 'object' &&
    typeof center.lat === 'number' && Number.isFinite(center.lat) &&
    center.lat >= -90 && center.lat <= 90 &&
    typeof center.lng === 'number' && Number.isFinite(center.lng) &&
    center.lng >= -180 && center.lng <= 180
  );
}
