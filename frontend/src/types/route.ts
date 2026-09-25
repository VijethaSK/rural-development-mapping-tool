export interface Coordinate {
  lat: number;
  lng: number;
}

export interface StopCandidate {
  _id?: string;
  infrastructureId: string;
  panchayatId: string;
  name: string;
  type: string;
  condition?: string;
  complaintsCount?: number;
  populationServed?: number;
  priorityScore: number;
  priorityLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  location: Coordinate;
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
  estimatedArrivalTime?: string;
  routingMethod: 'NETWORK_ROUTE' | 'STRAIGHT_LINE_FALLBACK';
  reasonForOrder: string;
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

export interface MemberOption {
  _id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
}
