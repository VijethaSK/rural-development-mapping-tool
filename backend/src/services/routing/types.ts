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

export interface ShortestPathResult {
  source: Coordinate;
  target: Coordinate;
  distanceMeters: number;
  coordinates: [number, number][]; // [lng, lat] GeoJSON LineString coordinates
  reachable: boolean;
  algorithm: 'Dijkstra' | 'Straight-line Haversine fallback';
  routingMethod: 'NETWORK_ROUTE' | 'STRAIGHT_LINE_FALLBACK';
  fallbackUsed: boolean;
  snapDistanceMeters?: { source: number; target: number };
}

export interface DistanceMatrixResult {
  points: Coordinate[];
  distancesMeters: number[][]; // N x N matrix
  paths: ShortestPathResult[][];
}

export interface IRoutingProvider {
  name: string;
  findShortestPath(start: Coordinate, end: Coordinate): Promise<ShortestPathResult>;
  getDistanceMatrix(points: Coordinate[]): Promise<DistanceMatrixResult>;
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
  cumulativeDistanceKm: number;
  estimatedArrivalMinutes?: number;
  estimatedArrivalTime?: string; // formatted clock time e.g. "09:45 AM"
  routingMethod: 'NETWORK_ROUTE' | 'STRAIGHT_LINE_FALLBACK';
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
  routingMethod: 'NETWORK_ROUTE' | 'STRAIGHT_LINE_FALLBACK';
  fallbackUsed: boolean;
  unreachableStops: Array<{ infrastructureId: string; infrastructureName: string; reason: string }>;
  stopsCount: number;
  originalDistanceKm?: number;
  optimizedDistanceKm?: number;
  distanceSavingsKm?: number;
  savingsPercent?: number;
  algorithm: {
    shortestPath: 'Dijkstra';
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
