export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export type RankedPriorityLevel = PriorityLevel | 'Unavailable';

export interface FactorDetail {
  score: number;
  weight: number;
  contribution: number;
  raw: string | number;
}

export interface PriorityExplanation {
  priorityScore: number;
  priorityLevel: PriorityLevel;
  factors: {
    condition: FactorDetail;
    complaints: FactorDetail;
    population: FactorDetail;
    traffic: FactorDetail;
    maintenanceAge: FactorDetail;
    alternativeDistance: FactorDetail;
  };
  summary: string;
}

export interface RankedInfrastructure {
  _id: string;
  id?: string;
  name: string;
  type: string;
  panchayatId?: string;
  ward?: string;
  village?: string;
  wardNumber?: number;
  habitationName?: string;
  location?: {
    type?: string;
    coordinates?: [number, number];
    lat?: number;
    lng?: number;
  };
  lineGeometry?: {
    type?: string;
    coordinates?: [number, number][];
  };
  condition: string | null;
  status: string | null;
  description?: string;
  complaintsCount: number | null;
  populationServed: number | null;
  trafficLevel?: string;
  roadLength?: number;
  studentCount?: number;
  accessibility?: any;
  lastMaintenanceDate?: string;
  lastRepairDate?: string;
  estimatedRepairCost?: number | null;
  estimatedMaintenanceCost?: number | null;
  priorityScore: number | null;
  priorityLevel: RankedPriorityLevel;
  scoringStatus?: 'SCORED' | 'UNAVAILABLE';
  dataOrigin?: string;
  isSynthetic?: boolean;
  sourceCategory?: string;
  sourceType?: string;
  sourceStatus?: string;
  sourceReportedQuantity?: unknown;
  source?: string;
  sourceVintage?: string;
  sourceWorkbook?: string;
  sourceRow?: number;
  verificationRequired?: boolean;
  verificationNotes?: string;
  coordinatesVerified?: boolean;
  coordinateSource?: string | null;
  missingDataFields?: string[];
  sourceData?: Record<string, unknown>;
  priorityExplanation?: PriorityExplanation;
  explanation?: PriorityExplanation;
}

export interface PriorityStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  unscored?: number;
  averageScore: number;
}

export interface PriorityWeights {
  condition: number;
  complaints: number;
  population: number;
  traffic: number;
  maintenanceAge: number;
  alternativeDistance: number;
}

export interface PriorityThresholds {
  critical: number;
  high: number;
  medium: number;
}

export interface NormalizationLimits {
  maxComplaintsCap: number;
  maxPopulationCap: number;
  maxMaintenanceAgeDays: number;
  maxAlternativeDistanceKm: number;
}

export interface PriorityConfig {
  _id?: string;
  version?: number;
  weights: PriorityWeights;
  thresholds: PriorityThresholds;
  limits: NormalizationLimits;
  notes?: string;
  updatedAt?: string;
}
