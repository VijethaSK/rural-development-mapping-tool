export interface Coordinate {
  lat: number;
  lng: number;
}

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
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
  distanceToThresholdRatio: number;
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
  totalPopulation: number;
  populationAffected: number;
  percentagePopulationAffected: number;
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
