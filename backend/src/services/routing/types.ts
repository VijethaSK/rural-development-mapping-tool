export interface Coordinate {
  lat: number;
  lng: number;
}

export interface GraphEdge {
  to: string; // target node ID
  weightMeters: number;
  geometry: [number, number][]; // [lng, lat] along edge
  roadId?: string;
  roadName?: string;
}

export interface GraphNode {
  id: string; // e.g. "77.594600,12.971600"
  coord: Coordinate;
  edges: GraphEdge[];
}

/** Stable identifiers for a routing engine and the work it performed. */
export type RoutingProviderId = 'INTERNAL' | 'OSRM';
export type RoutingMethod = 'DIJKSTRA' | 'OSRM_TABLE' | 'OSRM_ROUTE' | 'HAVERSINE_FALLBACK';

/** One directed origin-to-destination metric. Null values represent unavailable/unreachable values. */
export interface DistanceMatrixCell {
  reachable: boolean;
  distanceMeters: number | null;
  durationSeconds: number | null;
  provider: RoutingProviderId;
  method: RoutingMethod;
  fallbackUsed: boolean;
}

export interface ShortestPathResult {
  source: Coordinate;
  target: Coordinate;
  distanceMeters: number;
  durationSeconds?: number | null;
  coordinates: [number, number][]; // [lng, lat] GeoJSON LineString coordinates
  reachable: boolean;
  /** @deprecated Optional display compatibility label; provider/method are canonical. */
  algorithm?: string;
  provider: RoutingProviderId;
  method: RoutingMethod;
  routingMethod: 'NETWORK_ROUTE' | 'STRAIGHT_LINE_FALLBACK';
  fallbackUsed: boolean;
  snapDistanceMeters?: { source: number; target: number };
}

export interface DistanceMatrixResult {
  points: Coordinate[];
  /** Directed N x N matrix. Entries must not be mirrored by consumers. */
  matrix: DistanceMatrixCell[][];
  provider: RoutingProviderId;
  methodsUsed: RoutingMethod[];
  fallbackUsed: boolean;
}

/** Geometry and per-leg results for a selected, ordered sequence of coordinates. */
export interface ProviderRouteResult {
  reachable: boolean;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  distanceMeters: number | null;
  durationSeconds: number | null;
  legs: ShortestPathResult[];
  provider: RoutingProviderId;
  methodsUsed: RoutingMethod[];
  fallbackUsed: boolean;
}

export interface IRoutingProvider {
  name: string;
  provider: RoutingProviderId;
  findShortestPath(start: Coordinate, end: Coordinate): Promise<ShortestPathResult>;
  getDistanceMatrix(points: Coordinate[]): Promise<DistanceMatrixResult>;
  getRoute(orderedPoints: Coordinate[]): Promise<ProviderRouteResult>;
}

export interface StopCandidate {
  infrastructureId: string;
  infrastructureName?: string;
  type?: string;
  location: Coordinate;
  priorityScore: number;
  priorityLevel: 'Critical' | 'High' | 'Medium' | 'Low';
}

export interface OrderedStop {
  sequence: number;
  infrastructureId: string;
  infrastructureName: string;
  type?: string;
  location: Coordinate;
  priorityScore: number;
  priorityLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  distanceFromPreviousKm: number;
  durationSeconds: number | null;
  cumulativeDistanceKm: number;
  estimatedArrivalMinutes?: number;
  estimatedArrivalTime?: string; // formatted clock time e.g. "09:45 AM"
  routingMethod: 'NETWORK_ROUTE' | 'STRAIGHT_LINE_FALLBACK';
  provider: RoutingProviderId;
  method: RoutingMethod;
  reasonForOrder: string;
}

export interface RouteOptimizationOptions {
  priorityWeight?: number; // default 1.2 (balances priority vs distance)
  averageSpeedKmph?: number; // default 30 km/h (rural roads)
  startTime?: string; // e.g. "09:00"
  apply2Opt?: boolean; // default true
  panchayatId?: string;
}

export interface RouteOptimizationResult {
  orderedStops: OrderedStop[];
  routeGeometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  totalDistanceKm: number;
  totalDistanceMeters: number;
  estimatedDurationMinutes: number | null;
  provider: RoutingProviderId | null;
  methodsUsed: RoutingMethod[];
  matrixFallbackUsed: boolean;
  routingMethod: 'NETWORK_ROUTE' | 'STRAIGHT_LINE_FALLBACK';
  fallbackUsed: boolean;
  unreachableStops: Array<{ infrastructureId: string; infrastructureName: string; reason: string }>;
  stopsCount: number;
  originalDistanceKm?: number;
  optimizedDistanceKm?: number;
  distanceSavingsKm?: number;
  savingsPercent?: number;
  algorithm: {
    /** @deprecated Emitted only for pure internal Dijkstra results. */
    shortestPath?: 'Dijkstra';
    ordering: 'Priority-Weighted Nearest Neighbor';
    improvement: '2-opt';
    description: string;
  };
  explanation: {
    summary: string;
    tradeoffRationale: string;
    stopOrderReasons: string[];
  };
}
