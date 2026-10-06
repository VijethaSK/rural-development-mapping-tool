export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export type RankedPriorityLevel = PriorityLevel | 'Unavailable';

export type PriorityScoringInputCode =
  | 'condition'
  | 'complaintsCount'
  | 'populationServed'
  | 'trafficLevel'
  | 'lastMaintenanceDate'
  | 'alternativeDistanceKm';

export interface PriorityScoringInputIssue {
  code: PriorityScoringInputCode;
  label: string;
}

export interface PriorityDataQualityWarning {
  code: 'COORDINATES_UNAVAILABLE' | 'APPROXIMATE_COORDINATES' | 'UNVERIFIED_COORDINATES';
  message: string;
}

export interface PriorityAvailability {
  eligible: boolean;
  reasonCode: 'SOURCE_DATA_REVIEW_REQUIRED' | 'EVIDENCE_REVIEW_REQUIRED' | 'SCORING_PROFILE_UNAVAILABLE' | null;
  reason: string | null;
  missingScoringInputs: PriorityScoringInputIssue[];
  dataQualityWarnings: PriorityDataQualityWarning[];
  coordinateProvenance: {
    source: string | null;
    status: string | null;
    verified: boolean | null;
  };
  evidenceReadiness?: PriorityEvidenceReadiness;
}

export type PriorityEvidenceFactorState =
  | 'APPLICABLE_MISSING' | 'READY' | 'PENDING_VERIFICATION' | 'REJECTED'
  | 'NOT_APPLICABLE' | 'UNRESOLVED';

export interface PriorityEvidenceFactorReadiness {
  factor: PriorityScoringInputCode;
  state: PriorityEvidenceFactorState;
  value: string | number | null;
  unit: string | null;
  reason: string;
  provenance?: {
    sourceName?: string;
    sourceRecordReference?: string;
    sourceUrl?: string | null;
    observedAt?: string | null;
    referencePeriod?: string | null;
    derivationKind?: 'DIRECT' | 'CALCULATED' | null;
    derivationMethod?: string | null;
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
    verificationStatus?: string | null;
  } | null;
}

export interface PriorityEvidenceReadiness {
  readyForScoring: boolean;
  status: string;
  recordScope: string;
  scopeResolved: boolean;
  profileResolved: boolean;
  policyProfileId: string | null;
  policyProfileStatus: string | null;
  factors: PriorityEvidenceFactorReadiness[];
  missingFactors: PriorityScoringInputCode[];
  pendingFactors: PriorityScoringInputCode[];
  rejectedFactors: PriorityScoringInputCode[];
  notApplicableFactors: PriorityScoringInputCode[];
  unresolvedFactors: PriorityScoringInputCode[];
  readyFactors: PriorityScoringInputCode[];
}

export interface PriorityScoringProfileSummary {
  profileId: string;
  profileVersion: string;
  infrastructureType: string;
  status: 'LEGACY' | 'APPROVED' | 'UNAVAILABLE';
  applicableFactors: PriorityScoringInputCode[];
  reason?: string;
}

export interface ProfileFactorDetail {
  rawValue: string | number;
  normalizedScore: number;
  weight: number;
  contribution: number;
  description: string;
}

export interface TypeSpecificPriorityExplanation {
  priorityScore: number;
  priorityLevel: PriorityLevel;
  summary: string;
  profileId: string;
  profileVersion: string;
  applicableFactors: PriorityScoringInputCode[];
  factors: Partial<Record<PriorityScoringInputCode, ProfileFactorDetail>>;
  calculatedAt?: string;
}

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
  priorityScorable?: boolean;
  priorityAvailability?: PriorityAvailability;
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
  coordinateStatus?: string;
  alternativeDistanceKm?: number | null;
  missingDataFields?: string[];
  sourceData?: Record<string, unknown>;
  priorityExplanation?: PriorityExplanation;
  explanation?: PriorityExplanation | TypeSpecificPriorityExplanation | null;
  scoringProfile?: PriorityScoringProfileSummary;
  applicableFactors?: PriorityScoringInputCode[];
  factorReadiness?: PriorityEvidenceFactorReadiness[];
  profileRank?: number | null;
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
