import type { Coordinate, RoutingMethod, RoutingProviderId } from '../types/route';

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
  provider?: RoutingProviderId | null;
  methodsUsed?: readonly RoutingMethod[];
  matrixFallbackUsed?: boolean;
  orderedStops: readonly { routingMethod: RouteDisplayMethod; provider?: RoutingProviderId; method?: RoutingMethod }[];
}

export function routeMethodOverlayLabel(result: RouteDisplaySummary | null): string {
  const base = 'Priority-weighted nearest-neighbor ordering | 2-opt heuristic';
  if (!result) return `Routing method pending | ${base}`;

  const methods = new Set<RoutingMethod>([
    ...(result.methodsUsed || []),
    ...result.orderedStops.flatMap((stop) => stop.method ? [stop.method] : [])
  ]);
  const hasLegacyNetwork = result.orderedStops.some((stop) => stop.routingMethod === 'NETWORK_ROUTE');
  const hasNetwork = methods.has('DIJKSTRA') || methods.has('OSRM_ROUTE') || hasLegacyNetwork;
  const hasFallback = methods.has('HAVERSINE_FALLBACK') || result.orderedStops.some((stop) => stop.routingMethod === 'STRAIGHT_LINE_FALLBACK');
  const hasFallbackLeg = result.orderedStops.some((stop) => stop.method === 'HAVERSINE_FALLBACK' || stop.routingMethod === 'STRAIGHT_LINE_FALLBACK');
  const provider = result.provider || result.orderedStops.find((stop) => stop.provider)?.provider;
  const networkLabel = methods.has('OSRM_ROUTE') || provider === 'OSRM'
    ? 'OSRM road route'
    : methods.has('DIJKSTRA') || provider === 'INTERNAL' || hasLegacyNetwork
      ? 'Dijkstra per leg'
      : 'Network route';

  if (hasNetwork && hasFallback && result.matrixFallbackUsed && !hasFallbackLeg) return `${networkLabel}; Haversine matrix fallback affected ordering | ${base}`;
  if (hasNetwork && hasFallback) return `Mixed ${networkLabel.toLowerCase()} and straight-line fallback | ${base}`;
  if (hasFallback || result.fallbackUsed || result.routingMethod === 'STRAIGHT_LINE_FALLBACK') {
    return `Straight-line fallback | ${base}`;
  }
  if (hasNetwork) return `${networkLabel} | ${base}`;
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
