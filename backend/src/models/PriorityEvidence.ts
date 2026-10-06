import mongoose, { Document, Model, Schema } from 'mongoose';

export const PRIORITY_EVIDENCE_FACTORS = [
  'condition',
  'complaintsCount',
  'populationServed',
  'trafficLevel',
  'lastMaintenanceDate',
  'alternativeDistanceKm'
] as const;

export type PriorityEvidenceFactor = typeof PRIORITY_EVIDENCE_FACTORS[number];
export type PriorityEvidenceVerificationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type PriorityEvidenceApplicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNRESOLVED';
export type PriorityEvidenceDerivation = 'DIRECT' | 'CALCULATED';
export type PriorityEvidenceConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type PriorityEvidenceScopeClass =
  | 'INDIVIDUAL_ASSET'
  | 'AGGREGATE_OR_NETWORK'
  | 'SERVICE_ADMINISTRATIVE'
  | 'UNRESOLVED';

export interface PriorityFactorEvidence {
  factor: PriorityEvidenceFactor;
  value?: unknown;
  unit?: string;
  applicability: PriorityEvidenceApplicability;
  sourceName: string;
  sourceRecordReference: string;
  sourceUrl?: string;
  observedAt: Date;
  referencePeriod?: string;
  derivationKind: PriorityEvidenceDerivation;
  derivationMethod?: string;
  confidence: PriorityEvidenceConfidence;
  verificationStatus: PriorityEvidenceVerificationStatus;
  submittedBy?: mongoose.Types.ObjectId | null;
  submittedAt?: Date | null;
  reviewedBy?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date | null;
  rejectionReason?: string;
  reviewerNotes?: string;
  notes?: string;
  current: boolean;
  complaintCoverage?: {
    reportingPeriod: string;
    coveredChannels: string;
    coverageConfirmed: boolean;
    includedStatuses?: string;
  };
  utilizationMeasurement?: {
    observedValue: number;
    unit: string;
    denominator: number;
    denominatorUnit: string;
    thresholdReference: string;
    numeratorReferencePeriod?: string;
    denominatorReferencePeriod?: string;
    compatiblePeriodEvidenceReference?: string;
  };
  maintenanceEvidence?: {
    qualifyingWorkType: string;
    actualCompletionConfirmed: boolean;
    completionEvidenceReference: string;
  };
  geospatialEvidence?: {
    assetCoordinatesVerified: boolean;
    alternativeCoordinatesVerified: boolean;
    alternativeReference: string;
    distanceMethod: string;
    distanceMetric: 'NETWORK_TRAVEL' | 'STRAIGHT_LINE';
    providerName: string;
    providerVersion: string;
  };
}

export interface PriorityEvidenceDoc extends Document {
  infrastructureId: mongoose.Types.ObjectId;
  sourceKey?: string;
  scopeClass: PriorityEvidenceScopeClass;
  scopeVerificationStatus: PriorityEvidenceVerificationStatus;
  resolvedSubtype?: string;
  policyProfileId?: string;
  policyProfileVersion?: string;
  policyProfileStatus: PriorityEvidenceVerificationStatus;
  policyProfileReviewedBy?: mongoose.Types.ObjectId | null;
  policyProfileReviewedAt?: Date | null;
  reviewedBy?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date | null;
  factors: PriorityFactorEvidence[];
  createdAt: Date;
  updatedAt: Date;
}

const FactorEvidenceSchema = new Schema<PriorityFactorEvidence>({
  factor: { type: String, enum: PRIORITY_EVIDENCE_FACTORS, required: true },
  value: { type: Schema.Types.Mixed },
  unit: { type: String, trim: true },
  applicability: {
    type: String,
    enum: ['APPLICABLE', 'NOT_APPLICABLE', 'UNRESOLVED'],
    required: true,
    default: 'UNRESOLVED'
  },
  sourceName: { type: String, required: true, trim: true },
  sourceRecordReference: { type: String, required: true, trim: true },
  sourceUrl: { type: String, trim: true },
  observedAt: { type: Date, required: true },
  referencePeriod: { type: String, trim: true },
  derivationKind: { type: String, enum: ['DIRECT', 'CALCULATED'], required: true },
  derivationMethod: { type: String, trim: true },
  confidence: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'], required: true },
  verificationStatus: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
    required: true,
    default: 'PENDING'
  },
  submittedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  submittedAt: { type: Date, default: null },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  rejectionReason: { type: String, trim: true },
  reviewerNotes: { type: String, trim: true },
  notes: { type: String, trim: true },
  current: { type: Boolean, default: true },
  complaintCoverage: {
    reportingPeriod: { type: String, trim: true },
    coveredChannels: { type: String, trim: true },
    coverageConfirmed: { type: Boolean },
    includedStatuses: { type: String, trim: true }
  },
  utilizationMeasurement: {
    observedValue: { type: Number },
    unit: { type: String, trim: true },
    denominator: { type: Number },
    denominatorUnit: { type: String, trim: true },
    thresholdReference: { type: String, trim: true },
    numeratorReferencePeriod: { type: String, trim: true },
    denominatorReferencePeriod: { type: String, trim: true },
    compatiblePeriodEvidenceReference: { type: String, trim: true }
  },
  maintenanceEvidence: {
    qualifyingWorkType: { type: String, trim: true },
    actualCompletionConfirmed: { type: Boolean },
    completionEvidenceReference: { type: String, trim: true }
  },
  geospatialEvidence: {
    assetCoordinatesVerified: { type: Boolean },
    alternativeCoordinatesVerified: { type: Boolean },
    alternativeReference: { type: String, trim: true },
    distanceMethod: { type: String, trim: true },
    distanceMetric: { type: String, enum: ['NETWORK_TRAVEL', 'STRAIGHT_LINE'] },
    providerName: { type: String, trim: true },
    providerVersion: { type: String, trim: true }
  }
}, { timestamps: true });

const PriorityEvidenceSchema = new Schema<PriorityEvidenceDoc>({
  infrastructureId: {
    type: Schema.Types.ObjectId,
    ref: 'Infrastructure',
    required: true,
    index: true
  },
  sourceKey: { type: String, trim: true },
  scopeClass: {
    type: String,
    enum: ['INDIVIDUAL_ASSET', 'AGGREGATE_OR_NETWORK', 'SERVICE_ADMINISTRATIVE', 'UNRESOLVED'],
    default: 'UNRESOLVED'
  },
  scopeVerificationStatus: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
    default: 'PENDING'
  },
  resolvedSubtype: { type: String, trim: true },
  policyProfileId: { type: String, trim: true },
  policyProfileVersion: { type: String, trim: true },
  policyProfileStatus: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
    default: 'PENDING'
  },
  policyProfileReviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  policyProfileReviewedAt: { type: Date, default: null },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  factors: { type: [FactorEvidenceSchema], default: [] }
}, { timestamps: true });

PriorityEvidenceSchema.index({ infrastructureId: 1, updatedAt: -1 });

export const PriorityEvidence: Model<PriorityEvidenceDoc> = mongoose.model<PriorityEvidenceDoc>(
  'PriorityEvidence',
  PriorityEvidenceSchema
);
