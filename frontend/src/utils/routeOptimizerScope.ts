import type { Coordinate } from '../types/route';

export interface RoutePanchayatOption {
  _id: string;
  name: string;
}

export interface RouteOrigin {
  coordinate: Coordinate;
  name: string;
  estimated: boolean;
}

export function candidateRequestPath(panchayatId: string | null | undefined): string | null {
  if (!panchayatId) return null;
  return `/api/routes/candidates?panchayatId=${encodeURIComponent(panchayatId)}`;
}

export function shouldApplyCandidateResponse(
  requestPanchayatId: string,
  selectedPanchayatId: string
): boolean {
  return requestPanchayatId === selectedPanchayatId;
}

export function shouldApplyOptimizationResponse(
  requestPanchayatId: string,
  selectedPanchayatId: string,
  requestVersion: number,
  currentVersion: number
): boolean {
  return requestPanchayatId === selectedPanchayatId && requestVersion === currentVersion;
}

export type RouteDisplayMethod = 'NETWORK_ROUTE' | 'STRAIGHT_LINE_FALLBACK';

export interface RouteDisplaySummary {
  routingMethod: RouteDisplayMethod;
  fallbackUsed: boolean;
  orderedStops: readonly { routingMethod: RouteDisplayMethod }[];
}

export function routeMethodOverlayLabel(result: RouteDisplaySummary | null): string {
  const base = 'Priority-weighted nearest-neighbor ordering | 2-opt heuristic';
  if (!result) return `Routing method pending | ${base}`;

  const methods = new Set(result.orderedStops.map((stop) => stop.routingMethod));
  const hasNetwork = methods.has('NETWORK_ROUTE');
  const hasFallback = methods.has('STRAIGHT_LINE_FALLBACK');

  if (hasNetwork && hasFallback) return `Mixed network and straight-line fallback | ${base}`;
  if (hasFallback || result.fallbackUsed || result.routingMethod === 'STRAIGHT_LINE_FALLBACK') {
    return `Straight-line fallback | ${base}`;
  }
  if (hasNetwork) return `Dijkstra per leg | ${base}`;
  return `No route legs | ${base}`;
}

export function resetRouteSelection() {
  return {
    candidates: [],
    selectedIds: new Set<string>(),
    startCoord: null,
    startName: 'Select a Panchayat',
    result: null
  };
}

export function resolveRouteOrigin(
  center: Coordinate | null | undefined,
  panchayatName: string | null | undefined,
  firstCandidate: Coordinate | null | undefined
): RouteOrigin | null {
  if (isFiniteCoordinate(center)) {
    return {
      coordinate: center,
      name: `${panchayatName || 'Selected Panchayat'} center`,
      estimated: false
    };
  }
  if (isFiniteCoordinate(firstCandidate)) {
    return {
      coordinate: firstCandidate,
      name: 'Estimated origin at first available infrastructure',
      estimated: true
    };
  }
  return null;
}

export function isFiniteCoordinate(value: Coordinate | null | undefined): value is Coordinate {
  return Boolean(value) && Number.isFinite(value?.lat) && Number.isFinite(value?.lng) &&
    value!.lat >= -90 && value!.lat <= 90 && value!.lng >= -180 && value!.lng <= 180;
}

export function panchayatsVisibleToUser<T extends RoutePanchayatOption>(
  panchayats: T[],
  assignedPanchayatId?: string | null
): T[] {
  return assignedPanchayatId
    ? panchayats.filter((panchayat) => String(panchayat._id) === String(assignedPanchayatId))
    : panchayats;
}
