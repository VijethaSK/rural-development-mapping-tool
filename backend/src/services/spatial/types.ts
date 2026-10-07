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
export type CoverageStatus = 'WITHIN_THRESHOLD' | 'AT_THRESHOLD' | 'BEYOND_THRESHOLD' | 'NO_FACILITY';

export interface UnderservedArea {
  id: string;
  name: string;
  areaType: 'Habitation' | 'GridCell';
  ward?: string;
  center: Coordinate;
  polygonGeometry?: GeoPolygon;
  populationAffected: number | null;
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
  /** Worst of school/road distance-to-configured-threshold ratios; null if either distance is unavailable. */
  distanceToThresholdRatio: number | null;
  schoolDistanceToThresholdRatio: number | null;
  roadDistanceToThresholdRatio: number | null;
  severityBasis: 'SCHOOL_DISTANCE' | 'ROAD_DISTANCE' | 'SCHOOL_AND_ROAD_DISTANCE' | 'MISSING_FACILITY_DISTANCE';
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
  totalPopulation: number | null;
  populationInUnderservedHabitations: number | null;
  populationAffected: number | null;
  percentagePopulationAffected: number | null;
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
  /** Internal opt-in used only by the isolated synthetic preview process. */
  includeSyntheticDemo?: boolean;
}

export interface GapAnalysisResult {
  spatialAnalysisAvailable?: boolean;
  spatialAnalysisUnavailableReason?: string;
  metrics: AccessibilityMetrics;
  underservedAreas: UnderservedArea[];
  /** Present only when explicitly tagged synthetic preview facilities are included. */
  demonstrationGridCells?: UnderservedArea[];
  /** True only when the analysis includes the isolated synthetic coverage fixture. */
  syntheticDemonstration?: boolean;
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
