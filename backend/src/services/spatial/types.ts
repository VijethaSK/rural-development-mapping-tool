export interface Coordinate {
  lat: number;
  lng: number;
}

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: [number, number][][]; // GeoJSON polygon rings: array of [lng, lat]
}

export interface FacilityCandidate {
  id: string;
  name: string;
  type: string;
  location: Coordinate;
  properties?: Record<string, any>;
}

export interface RoadSegmentCandidate {
  id: string;
  name: string;
  condition: string;
  surfaceType?: string;
  coordinates: [number, number][]; // [lng, lat]
}

export type GapSeverity = 'Critical' | 'High' | 'Moderate' | 'Served';
export type CoverageStatus = 'WITHIN_THRESHOLD' | 'BEYOND_THRESHOLD' | 'NO_FACILITY';

export interface UnderservedArea {
  id: string;
  name: string;
  areaType: 'Habitation' | 'GridCell';
  ward?: string;
  center: Coordinate;
  polygonGeometry?: GeoPolygon;
  populationAffected: number;
  nearestSchool?: {
    id: string;
    name: string;
    geographicDistanceKm: number;
    networkDistanceKm?: number;
    thresholdKm: number;
    isUnderserved: boolean;
    circuityFactor?: number;
  };
  schoolCoverageStatus: CoverageStatus;
  nearestRoad?: {
    id: string;
    name: string;
    condition?: string;
    geographicDistanceKm: number;
    thresholdKm: number;
    isUnderserved: boolean;
  };
  roadCoverageStatus: CoverageStatus;
  primaryIssue: 'School_Gap' | 'Road_Isolation' | 'Dual_Deprivation' | 'Served';
  overallSeverity: GapSeverity;
  distanceToThresholdRatio: number; // e.g. 1.8x threshold
  notes: string;
}

export interface SchoolBufferZone {
  schoolId: string;
  schoolName: string;
  center: Coordinate;
  radiusKm: number;
  bufferPolygon: GeoPolygon;
}

export interface AccessibilityMetrics {
  totalSchools: number;
  totalRoads: number;
  totalHabitations: number;
  totalAnalyzedAreas: number;
  underservedAreasCount: number;
  percentageAreaUnderserved: number; // % of spatial grid cells without threshold access
  totalPopulation: number;
  populationAffected: number;
  percentagePopulationAffected: number;
  averageDistanceToSchoolKm: number;
  averageDistanceToRoadKm: number;
  schoolThresholdKm: number;
  roadThresholdKm: number;
}

export interface GapAnalysisOptions {
  panchayatId?: string;
  schoolThresholdKm?: number; // default 3.0 km (configurable by admin)
  roadThresholdKm?: number; // default 1.0 km (configurable by admin)
  gridResolutionKm?: number; // default 0.8 km
  computeNetworkDistance?: boolean; // run Dijkstra for network comparison
}

export interface GapAnalysisResult {
  spatialAnalysisAvailable?: boolean;
  spatialAnalysisUnavailableReason?: string;
  metrics: AccessibilityMetrics;
  underservedAreas: UnderservedArea[];
  schoolBuffers: SchoolBufferZone[];
  configuredThresholds: {
    schoolMaxDistanceKm: number;
    roadMaxDistanceKm: number;
    gridResolutionKm: number;
  };
  methodologyNotes: {
    geographicVsNetwork: string;
    severityCriteria: string;
  };
}
