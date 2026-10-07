export interface Coordinate {
  lat: number;
  lng: number;
}

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
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
  percentageAreaUnderserved: number;
  totalPopulation: number | null;
  populationInUnderservedHabitations: number | null;
  populationAffected: number | null;
  percentagePopulationAffected: number | null;
  averageDistanceToSchoolKm: number;
  averageDistanceToRoadKm: number;
  schoolThresholdKm: number;
  roadThresholdKm: number;
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
