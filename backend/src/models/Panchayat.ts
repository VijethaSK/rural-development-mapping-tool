import mongoose, { Schema, Document, Model } from 'mongoose';
import { GeoPoint, GeoPointSchema } from './common/Location.js';

export interface CenterCoord {
  lat: number;
  lng: number;
}

export interface VillageHabitation {
  name: string;
  ward: string;
  population: number;
  location: GeoPoint;
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
  dataOrigin?: 'SOURCE_EXCEL' | 'LEGACY_DEMO' | 'DEMO';
  sourceWorkbook?: string;
  sourceWorksheet?: string;
  sourceRow?: number;
  sourceKey?: string;
  isSynthetic?: boolean;
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
    population: { type: Number, default: 0 },
    location: { type: GeoPointSchema, required: true }
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
    dataOrigin: { type: String, enum: ['SOURCE_EXCEL', 'LEGACY_DEMO', 'DEMO'] },
    sourceWorkbook: { type: String, trim: true },
    sourceWorksheet: { type: String, trim: true },
    sourceRow: { type: Number, min: 1 },
    sourceKey: { type: String, trim: true },
    isSynthetic: { type: Boolean, default: false },
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
