import type { GeoPolygon } from '../types/gap';
import type { LatLngExpression } from 'leaflet';

export function toLeafletPolygonPositions(
  geometry: GeoPolygon | null | undefined
): LatLngExpression[][] | null;

export function isValidGapCenter(center: unknown): center is { lat: number; lng: number };
