import { GAP_ANALYSIS_DEMO_SOURCE } from './gapAnalysisDemoProvenance.js';

/**
 * Spatial-analysis trust policy. A structurally valid coordinate is not evidence
 * of location accuracy. Until an additional source is explicitly approved,
 * FIELD_SURVEY is the only accepted coordinate source. SOURCE_EXCEL describes
 * record origin and is never trusted by itself.
 */
export const TRUSTED_SPATIAL_COORDINATE_SOURCES = new Set(['FIELD_SURVEY']);

export interface SpatialCoordinateProvenance {
  coordinatesVerified?: unknown;
  coordinateStatus?: unknown;
  coordinateSource?: unknown;
  dataOrigin?: unknown;
  isSynthetic?: unknown;
  source?: unknown;
}

export interface GeoPointLike {
  type?: unknown;
  coordinates?: unknown;
  lat?: unknown;
  lng?: unknown;
}

export interface GeoLineStringLike {
  type?: unknown;
  coordinates?: unknown;
}

export interface VerifiedSpatialRecord extends SpatialCoordinateProvenance {
  type?: unknown;
  location?: unknown;
  lineGeometry?: unknown;
  geometry?: unknown;
  syntheticDemoRoles?: unknown;
}

export interface SpatialCoordinate {
  lat: number;
  lng: number;
}

export function hasTrustedSpatialProvenance(record: SpatialCoordinateProvenance): boolean {
  return record.coordinatesVerified === true &&
    record.coordinateStatus === 'VERIFIED' &&
    typeof record.coordinateSource === 'string' &&
    TRUSTED_SPATIAL_COORDINATE_SOURCES.has(record.coordinateSource) &&
    record.isSynthetic !== true &&
    record.dataOrigin !== 'DEMO' &&
    record.dataOrigin !== 'LEGACY_DEMO' &&
    record.source !== GAP_ANALYSIS_DEMO_SOURCE;
}

export function isValidGeoPoint(value: unknown): value is GeoPointLike {
  if (!value || typeof value !== 'object') return false;
  const point = value as GeoPointLike;
  const coordinates = point.coordinates;
  const lng = Array.isArray(coordinates) ? coordinates[0] : point.lng;
  const lat = Array.isArray(coordinates) ? coordinates[1] : point.lat;
  if (point.type != null && point.type !== 'Point') return false;
  return Array.isArray(coordinates)
    ? coordinates.length === 2 && isValidLatLng(lat, lng)
    : isValidLatLng(lat, lng);
}

export function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

export function getVerifiedSpatialPoint(
  record: SpatialCoordinateProvenance,
  point: unknown = (record as VerifiedSpatialRecord).location
): SpatialCoordinate | null {
  if (!hasTrustedSpatialProvenance(record) || !isValidGeoPoint(point)) return null;
  const candidate = point as GeoPointLike;
  if (Array.isArray(candidate.coordinates)) {
    return { lng: candidate.coordinates[0] as number, lat: candidate.coordinates[1] as number };
  }
  return { lat: candidate.lat as number, lng: candidate.lng as number };
}

export function isValidGeoLineString(value: unknown): value is GeoLineStringLike & { coordinates: [number, number][] } {
  if (!value || typeof value !== 'object') return false;
  const line = value as GeoLineStringLike;
  return line.type === 'LineString' &&
    Array.isArray(line.coordinates) &&
    line.coordinates.length >= 2 &&
    line.coordinates.every((coordinate) => Array.isArray(coordinate) &&
      coordinate.length === 2 && isValidLngLat(coordinate[0], coordinate[1]));
}

function isValidLngLat(lng: unknown, lat: unknown): boolean {
  return typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180 &&
    typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function getVerifiedRoadLineString(record: SpatialCoordinateProvenance & {
  lineGeometry?: unknown;
  geometry?: unknown;
}): (GeoLineStringLike & { coordinates: [number, number][] }) | null {
  if (!hasTrustedSpatialProvenance(record)) return null;
  const line = isValidGeoLineString(record.lineGeometry)
    ? record.lineGeometry
    : isValidGeoLineString(record.geometry)
      ? record.geometry
      : null;
  return line;
}

/** A route stop may use a trusted road line midpoint, or its trusted point. */
export function getVerifiedInfrastructurePoint(record: VerifiedSpatialRecord): SpatialCoordinate | null {
  if (record.type === 'Road') {
    const line = getVerifiedRoadLineString(record);
    if (line) {
      const point = line.coordinates[Math.floor(line.coordinates.length / 2)];
      return { lng: point[0], lat: point[1] };
    }
  }
  return getVerifiedSpatialPoint(record);
}

/** Demo rows are permitted only by the explicit isolated preview path. */
export function isExplicitSyntheticDemoRecord(record: VerifiedSpatialRecord): boolean {
  return record.source === GAP_ANALYSIS_DEMO_SOURCE &&
    record.dataOrigin === 'SYNTHETIC_DEMO' &&
    record.isSynthetic === true &&
    record.coordinatesVerified === false &&
    record.coordinateSource === 'SYNTHETIC' &&
    record.coordinateStatus === 'DEMO_ONLY';
}

/** Explicit preview-only accessors. They never participate in trusted helpers above. */
export function getExplicitSyntheticDemoPoint(
  record: VerifiedSpatialRecord,
  point: unknown = record.location
): SpatialCoordinate | null {
  if (!isExplicitSyntheticDemoRecord(record)) return null;
  if (!isValidGeoPoint(point)) return null;
  const geoPoint = point as GeoPointLike;
  if (Array.isArray(geoPoint.coordinates)) {
    return { lng: geoPoint.coordinates[0] as number, lat: geoPoint.coordinates[1] as number };
  }
  return { lat: geoPoint.lat as number, lng: geoPoint.lng as number };
}

export function getExplicitSyntheticDemoRoadLineString(
  record: VerifiedSpatialRecord
): (GeoLineStringLike & { coordinates: [number, number][] }) | null {
  if (!isExplicitSyntheticDemoRecord(record)) return null;
  const line = record.lineGeometry;
  return isValidGeoLineString(line) ? line : null;
}
