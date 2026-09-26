export type RoadCoordinate = [number, number];

export interface RoadLineString {
  type: 'LineString';
  coordinates: RoadCoordinate[];
}

export interface RoadGeometryRecord {
  lineGeometry?: unknown;
  geometry?: unknown;
  location?: unknown;
  coordinatesVerified?: boolean;
  coordinateSource?: string | null;
  coordinateStatus?: string;
  dataOrigin?: string;
}

export function isValidRoadLineString(value: unknown): value is RoadLineString {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; coordinates?: unknown };
  if (candidate.type !== 'LineString' || !Array.isArray(candidate.coordinates) || candidate.coordinates.length < 2) {
    return false;
  }

  return candidate.coordinates.every((coordinate): coordinate is RoadCoordinate =>
    Array.isArray(coordinate) &&
    coordinate.length === 2 &&
    typeof coordinate[0] === 'number' && Number.isFinite(coordinate[0]) &&
    coordinate[0] >= -180 && coordinate[0] <= 180 &&
    typeof coordinate[1] === 'number' && Number.isFinite(coordinate[1]) &&
    coordinate[1] >= -90 && coordinate[1] <= 90
  );
}

export function getRoadLineCoordinates(record: RoadGeometryRecord): RoadCoordinate[] | null {
  if (isValidRoadLineString(record.lineGeometry)) return record.lineGeometry.coordinates;
  if (isValidRoadLineString(record.geometry)) return record.geometry.coordinates;
  return null;
}

export function filterMappedRoads<T extends RoadGeometryRecord>(records: readonly T[]): T[] {
  return records.filter((record) => getRoadLineCoordinates(record) !== null);
}

export function countRoadRecords<T extends RoadGeometryRecord>(records: readonly T[]) {
  return {
    roadRecords: records.length,
    mappedRoads: filterMappedRoads(records).length
  };
}

export function filterRoadRecords<T extends { ward?: string | null; condition?: string | null }>(
  records: readonly T[],
  ward: string,
  condition: string
): T[] {
  return records.filter((record) =>
    (!ward || (record.ward || '') === ward) &&
    (!condition || (record.condition || '') === condition)
  );
}

export function roadGeometryAvailability(record: RoadGeometryRecord): string {
  if (getRoadLineCoordinates(record)) return 'Line geometry available';

  const location = record.location;
  const pointCoordinates = location && typeof location === 'object'
    ? (location as { coordinates?: unknown }).coordinates
    : undefined;
  const hasPoint = Array.isArray(pointCoordinates) &&
    pointCoordinates.length === 2 &&
    typeof pointCoordinates[0] === 'number' && Number.isFinite(pointCoordinates[0]) &&
    pointCoordinates[0] >= -180 && pointCoordinates[0] <= 180 &&
    typeof pointCoordinates[1] === 'number' && Number.isFinite(pointCoordinates[1]) &&
    pointCoordinates[1] >= -90 && pointCoordinates[1] <= 90;

  if (hasPoint && (
    record.coordinateStatus === 'APPROXIMATE' ||
    record.coordinateSource === 'PUBLIC_MAP_APPROXIMATE'
  )) {
    return 'Geometry unavailable — approximate location only';
  }
  if (hasPoint) return 'Geometry unavailable — point location only';
  return 'Geometry unavailable — no road line geometry recorded';
}
