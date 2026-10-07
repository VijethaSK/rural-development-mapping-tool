import mongoose, { Schema, Document, Model } from 'mongoose';
import { GeoPoint, GeoPointSchema, GeoLineString, GeoLineStringSchema } from './common/Location.js';

export type InfrastructureType = 'Road' | 'School' | 'Healthcare' | 'WaterFacility' | 'Other';
export type InfrastructureCondition = 'Good' | 'Average' | 'Poor' | 'Bad';
export type InfrastructureStatus =
  | 'Operational'
  | 'Needs_Maintenance'
  | 'Needs_Repair'
  | 'Under_Maintenance'
  | 'Under_Repair'
  | 'Decommissioned';
export type InfrastructureDataOrigin = 'SOURCE_EXCEL' | 'LEGACY_DEMO' | 'DEMO' | 'OTHER';
export type InfrastructureCoordinateSource =
  | 'SOURCE_EXCEL'
  | 'FIELD_SURVEY'
  | 'UNAVAILABLE'
  | 'PUBLIC_MAP_APPROXIMATE'
  | null;
export type InfrastructureCoordinateStatus = 'VERIFIED' | 'APPROXIMATE' | 'UNVERIFIED';

export interface InfrastructureDoc extends Document {
  panchayatId: mongoose.Types.ObjectId;
  name: string;
  type: InfrastructureType;
  description?: string;
  ward?: string | null;
  village?: string;
  location?: GeoPoint | null;
  condition?: InfrastructureCondition | null;
  status?: InfrastructureStatus | null;
  complaintsCount?: number | null;
  populationServed?: number | null;
  lastMaintenanceDate?: Date;
  priorityScore?: number | null;
  estimatedMaintenanceCost?: number | null;
  dataOrigin?: InfrastructureDataOrigin;
  isSynthetic?: boolean;
  sourceKey?: string;
  sourceWorkbook?: string;
  sourceWorksheet?: string;
  sourceRow?: number;
  sourceCategory?: string;
  sourceType?: string;
  sourceOwnership?: string;
  sourceReportedQuantity?: unknown;
  sourceStatus?: string;
  normalizedStatus?: InfrastructureStatus | null;
  source?: string;
  sourceVintage?: string;
  verificationNotes?: string;
  verificationRequired?: boolean;
  coordinatesVerified?: boolean;
  coordinateSource?: InfrastructureCoordinateSource;
  coordinateStatus?: InfrastructureCoordinateStatus;
  priorityScorable?: boolean;
  missingDataFields?: string[];
  sourceData?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------- ROAD ----------------
export interface RoadDoc extends InfrastructureDoc {
  type: 'Road';
  trafficLevel: 'Low' | 'Medium' | 'High';
  roadLength: number; // in kilometers
  lengthKm?: number; // compatibility alias
  surfaceType: 'Paved' | 'Kaccha' | 'Gravel';
  roadType: 'Panchayat' | 'Village' | 'MajorDistrict';
  lastRepairDate?: Date;
  estimatedRepairCost: number;
  lineGeometry?: GeoLineString;
  geometry?: GeoLineString; // compatibility alias
  connects: string[];
}

// ---------------- SCHOOL ----------------
export interface SchoolAccessibility {
  roadAccess: boolean;
  allWeatherAccessible: boolean;
  wheelchairAccessible: boolean;
  distanceToNearestRoadMeters?: number;
  notes?: string;
}

export interface SchoolFacilities {
  toilets: string;
  drinkingWater: boolean;
  playground: boolean;
  boundaryWall: boolean;
  electricity: boolean;
}

export interface SchoolDoc extends InfrastructureDoc {
  type: 'School';
  schoolType: 'Primary' | 'HighSchool' | 'PUC';
  management: 'Govt' | 'Private' | 'Aided';
  medium?: string;
  classesFrom?: number;
  classesTo?: number;
  studentCount: number;
  staffCount: number;
  accessibility: SchoolAccessibility;
  facilities: SchoolFacilities;
}

// ---------------- HEALTHCARE ----------------
export interface HealthcareDoc extends InfrastructureDoc {
  type: 'Healthcare';
  healthType: 'PHC' | 'SubCenter' | 'CommunityHospital';
  doctorCount: number;
  bedCount: number;
  emergencyAvailable: boolean;
}

// ---------------- WATER FACILITY ----------------
export interface WaterFacilityDoc extends InfrastructureDoc {
  type: 'WaterFacility';
  waterType: 'Borewell' | 'OverheadTank' | 'ROPlant' | 'OpenWell';
  functionalStatus: 'Functional' | 'Partial' | 'Defunct';
  capacityLitres: number;
  familiesServed: number;
  waterQualityStatus: 'Potable' | 'Contaminated' | 'Untested';
}

const InfrastructureSchema = new Schema<InfrastructureDoc>(
  {
    panchayatId: { type: Schema.Types.ObjectId, ref: 'Panchayat', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['Road', 'School', 'Healthcare', 'WaterFacility', 'Other'],
      required: true,
      index: true
    },
    description: { type: String, default: '' },
    ward: { type: String, required: false, trim: true, index: true },
    village: { type: String, default: '', trim: true },
    location: { type: GeoPointSchema, required: false, default: undefined },
    condition: {
      type: String,
      enum: ['Good', 'Average', 'Poor', 'Bad'],
      default: 'Good',
      index: true
    },
    status: {
      type: String,
      enum: ['Operational', 'Needs_Maintenance', 'Needs_Repair', 'Under_Maintenance', 'Under_Repair', 'Decommissioned'],
      default: 'Operational',
      index: true
    },
    complaintsCount: { type: Number, default: 0, index: true },
    populationServed: { type: Number, default: 0 },
    lastMaintenanceDate: { type: Date },
    priorityScore: { type: Number, default: 0, index: true },
    estimatedMaintenanceCost: { type: Number, default: 0 },
    dataOrigin: { type: String, enum: ['SOURCE_EXCEL', 'LEGACY_DEMO', 'DEMO', 'OTHER'], index: true },
    isSynthetic: { type: Boolean, default: false, index: true },
    sourceKey: { type: String, trim: true },
    sourceWorkbook: { type: String, trim: true },
    sourceWorksheet: { type: String, trim: true },
    sourceRow: { type: Number, min: 1 },
    sourceCategory: { type: String, trim: true, index: true },
    sourceType: { type: String, trim: true },
    sourceOwnership: { type: String, trim: true },
    sourceReportedQuantity: { type: Schema.Types.Mixed },
    sourceStatus: { type: String, trim: true },
    normalizedStatus: { type: String, enum: ['Operational', 'Needs_Maintenance', 'Needs_Repair', 'Under_Maintenance', 'Under_Repair', 'Decommissioned', null] },
    source: { type: String, trim: true },
    sourceVintage: { type: String, trim: true },
    verificationNotes: { type: String },
    verificationRequired: { type: Boolean, default: false, index: true },
    coordinatesVerified: { type: Boolean, default: false },
    coordinateSource: { type: String, enum: ['SOURCE_EXCEL', 'FIELD_SURVEY', 'UNAVAILABLE', 'PUBLIC_MAP_APPROXIMATE', null] },
    coordinateStatus: { type: String, enum: ['VERIFIED', 'APPROXIMATE', 'UNVERIFIED'] },
    priorityScorable: { type: Boolean, default: true },
    missingDataFields: { type: [String], default: [] },
    sourceData: { type: Schema.Types.Mixed }
  },
  {
    timestamps: true,
    discriminatorKey: 'type'
  }
);

// Pre-validate hook to convert legacy { lat, lng } to GeoJSON Point
InfrastructureSchema.pre('validate', function (next) {
  const loc: any = this.location;
  if (loc && typeof loc === 'object' && loc.lat != null && loc.lng != null && !Array.isArray(loc.coordinates)) {
    this.location = {
      type: 'Point',
      coordinates: [Number(loc.lng), Number(loc.lat)]
    };
  }
  next();
});

// Indexes
InfrastructureSchema.index({ location: '2dsphere' });
InfrastructureSchema.index({ type: 1, panchayatId: 1 });
InfrastructureSchema.index({ panchayatId: 1, condition: 1 });
InfrastructureSchema.index({ ward: 1, type: 1 });
InfrastructureSchema.index({ sourceKey: 1 }, { unique: true, sparse: true });

export const Infrastructure: Model<InfrastructureDoc> = mongoose.model<InfrastructureDoc>(
  'Infrastructure',
  InfrastructureSchema
);

// Road Discriminator
const RoadSchema = new Schema({
  trafficLevel: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  roadLength: { type: Number, default: 1.0 },
  lengthKm: { type: Number },
  surfaceType: { type: String, enum: ['Paved', 'Kaccha', 'Gravel'], default: 'Paved' },
  roadType: { type: String, enum: ['Panchayat', 'Village', 'MajorDistrict'], default: 'Village' },
  lastRepairDate: { type: Date },
  estimatedRepairCost: { type: Number, default: 0 },
  lineGeometry: { type: GeoLineStringSchema },
  geometry: { type: GeoLineStringSchema },
  connects: { type: [String], default: [] }
});

RoadSchema.pre('validate', function (next) {
  const self = this as any;
  if (self.lengthKm != null && self.roadLength == null) {
    self.roadLength = self.lengthKm;
  }
  if (self.roadLength != null && self.lengthKm == null) {
    self.lengthKm = self.roadLength;
  }
  if (self.geometry && !self.lineGeometry) {
    self.lineGeometry = self.geometry;
  }
  if (self.lineGeometry && !self.geometry) {
    self.geometry = self.lineGeometry;
  }
  // Auto-set location point from first coordinate of line if location is not set
  if (!self.location && (self.lineGeometry || self.geometry)) {
    const coords = (self.lineGeometry || self.geometry).coordinates;
    if (coords && coords.length > 0) {
      self.location = {
        type: 'Point',
        coordinates: coords[0]
      };
    }
  }
  next();
});

export const Road: Model<RoadDoc> = Infrastructure.discriminator<RoadDoc>('Road', RoadSchema);
Road.schema.index({ lineGeometry: '2dsphere' }, { sparse: true });
Road.schema.index({ geometry: '2dsphere' }, { sparse: true });

// School Discriminator
const SchoolSchema = new Schema({
  schoolType: { type: String, enum: ['Primary', 'HighSchool', 'PUC'], default: 'Primary' },
  management: { type: String, enum: ['Govt', 'Private', 'Aided'], default: 'Govt' },
  medium: { type: String, default: 'Kannada' },
  classesFrom: { type: Number, default: 1 },
  classesTo: { type: Number, default: 7 },
  studentCount: { type: Number, default: 0 },
  staffCount: { type: Number, default: 0 },
  accessibility: {
    roadAccess: { type: Boolean, default: true },
    allWeatherAccessible: { type: Boolean, default: true },
    wheelchairAccessible: { type: Boolean, default: false },
    distanceToNearestRoadMeters: { type: Number, default: 0 },
    notes: { type: String, default: '' }
  },
  facilities: {
    toilets: { type: String, default: 'Functional' },
    drinkingWater: { type: Boolean, default: true },
    playground: { type: Boolean, default: true },
    boundaryWall: { type: Boolean, default: true },
    electricity: { type: Boolean, default: true }
  }
});

export const School: Model<SchoolDoc> = Infrastructure.discriminator<SchoolDoc>('School', SchoolSchema);

// Healthcare Discriminator
export const Healthcare: Model<HealthcareDoc> = Infrastructure.discriminator<HealthcareDoc>(
  'Healthcare',
  new Schema({
    healthType: { type: String, enum: ['PHC', 'SubCenter', 'CommunityHospital'], default: 'PHC' },
    doctorCount: { type: Number, default: 1 },
    bedCount: { type: Number, default: 4 },
    emergencyAvailable: { type: Boolean, default: false }
  })
);

// Water Facility Discriminator
export const WaterFacility: Model<WaterFacilityDoc> = Infrastructure.discriminator<WaterFacilityDoc>(
  'WaterFacility',
  new Schema({
    waterType: { type: String, enum: ['Borewell', 'OverheadTank', 'ROPlant', 'OpenWell'], default: 'Borewell' },
    functionalStatus: { type: String, enum: ['Functional', 'Partial', 'Defunct'], default: 'Functional' },
    capacityLitres: { type: Number, default: 5000 },
    familiesServed: { type: Number, default: 50 },
    waterQualityStatus: { type: String, enum: ['Potable', 'Contaminated', 'Untested'], default: 'Potable' }
  })
);
