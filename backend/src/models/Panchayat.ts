import mongoose, { Schema, Document, Model } from 'mongoose';
import { GeoPoint, GeoPointSchema } from './common/Location.js';

export interface CenterCoord {
  lat: number;
  lng: number;
}

export interface VillageHabitation {
  name: string;
  ward: string;
  population?: number | null;
  location: GeoPoint;
  dataOrigin?: 'SYNTHETIC_DEMO';
  coordinatesVerified?: boolean;
  coordinateSource?: 'SYNTHETIC';
  coordinateStatus?: 'DEMO_ONLY';
  isSynthetic?: boolean;
}

export interface PanchayatDoc extends Document {
  name: string;
  district?: string;
  state?: string;
  taluka?: string;
  villages?: string[];
  numberOfVillages?: number;
  administrativeNote?: string;
  source?: string;
  dataOrigin?: 'SOURCE_EXCEL' | 'LEGACY_DEMO' | 'DEMO' | 'SYNTHETIC_DEMO';
  lgdCode?: string;
  sourceWorkbook?: string;
  sourceWorksheet?: string;
  sourceRow?: number;
  sourceKey?: string;
  isSynthetic?: boolean;
  coordinatesVerified?: boolean;
  coordinateSource?: 'SOURCE_EXCEL' | 'FIELD_SURVEY' | 'UNAVAILABLE' | 'PUBLIC_MAP_APPROXIMATE' | 'SYNTHETIC' | null;
  coordinateStatus?: 'VERIFIED' | 'APPROXIMATE' | 'UNVERIFIED' | 'DEMO_ONLY';
  sourceData?: Record<string, unknown>;
  wards: string[];
  contactPhone?: string;
  contactEmail?: string;
  centerCoord?: CenterCoord | null;
  location?: GeoPoint;
  habitations?: VillageHabitation[];
  createdAt: Date;
  updatedAt: Date;
}

const VillageHabitationSchema = new Schema<VillageHabitation>(
  {
    name: { type: String, required: true },
    ward: { type: String, required: true },
    // No default: missing population must remain distinguishable from an explicit zero.
    // Historical zero values may still be ambiguous because this field previously defaulted to zero.
    population: { type: Number, min: 0 },
    location: { type: GeoPointSchema, required: true },
    dataOrigin: { type: String, enum: ['SYNTHETIC_DEMO'] },
    coordinatesVerified: { type: Boolean },
    coordinateSource: { type: String, enum: ['SYNTHETIC'] },
    coordinateStatus: { type: String, enum: ['DEMO_ONLY'] },
    isSynthetic: { type: Boolean }
  },
  { _id: false }
);

const PanchayatSchema = new Schema<PanchayatDoc>(
  {
    name: { type: String, required: true, trim: true },
    district: { type: String, trim: true },
    state: { type: String, trim: true },
    taluka: { type: String, trim: true },
    villages: { type: [String], default: [] },
    numberOfVillages: { type: Number, min: 0 },
    administrativeNote: { type: String, trim: true },
    source: { type: String, trim: true },
    dataOrigin: { type: String, enum: ['SOURCE_EXCEL', 'LEGACY_DEMO', 'DEMO', 'SYNTHETIC_DEMO'] },
    lgdCode: { type: String, trim: true },
    sourceWorkbook: { type: String, trim: true },
    sourceWorksheet: { type: String, trim: true },
    sourceRow: { type: Number, min: 1 },
    sourceKey: { type: String, trim: true },
    isSynthetic: { type: Boolean, default: false },
    coordinatesVerified: { type: Boolean, default: false },
    coordinateSource: { type: String, enum: ['SOURCE_EXCEL', 'FIELD_SURVEY', 'UNAVAILABLE', 'PUBLIC_MAP_APPROXIMATE', 'SYNTHETIC', null] },
    coordinateStatus: { type: String, enum: ['VERIFIED', 'APPROXIMATE', 'UNVERIFIED', 'DEMO_ONLY'] },
    sourceData: { type: Schema.Types.Mixed },
    wards: { type: [String], default: [] },
    contactPhone: { type: String, trim: true },
    contactEmail: { type: String, trim: true },
    centerCoord: {
      lat: { type: Number },
      lng: { type: Number }
    },
    location: { type: GeoPointSchema, required: false },
    habitations: { type: [VillageHabitationSchema], default: [] }
  },
  { timestamps: true }
);

// Pre-save hook to synchronize location GeoJSON Point and centerCoord
PanchayatSchema.pre('save', function (next) {
  if (this.centerCoord && !this.location) {
    this.location = {
      type: 'Point',
      coordinates: [this.centerCoord.lng, this.centerCoord.lat]
    };
  } else if (this.location && !this.centerCoord) {
    this.centerCoord = {
      lng: this.location.coordinates[0],
      lat: this.location.coordinates[1]
    };
  }
  next();
});

PanchayatSchema.index({ location: '2dsphere' }, { sparse: true });
PanchayatSchema.index({ sourceKey: 1 }, { unique: true, sparse: true });

export const Panchayat: Model<PanchayatDoc> = mongoose.model<PanchayatDoc>('Panchayat', PanchayatSchema);
