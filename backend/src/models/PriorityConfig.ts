import mongoose, { Schema, Document, Model } from 'mongoose';

export interface PriorityWeights {
  condition: number;
  complaints: number;
  population: number;
  traffic: number;
  maintenanceAge: number;
  alternativeDistance: number;
}

export interface PriorityThresholds {
  critical: number; // e.g. 80
  high: number;     // e.g. 60
  medium: number;   // e.g. 40
  low: number;      // e.g. 0
}

export interface NormalizationLimits {
  maxComplaintsCap: number;     // e.g. 5 complaints = 100 score
  maxPopulationCap: number;     // e.g. 5000 population = 100 score
  maxMaintenanceAgeDays: number;// e.g. 1095 days (3 years) = 100 score
  maxAlternativeDistanceKm: number; // e.g. 5 km = 100 score
}

export interface PriorityConfigDoc extends Document {
  panchayatId?: mongoose.Types.ObjectId;
  name: string;
  weights: PriorityWeights;
  thresholds: PriorityThresholds;
  limits: NormalizationLimits;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PriorityConfigSchema = new Schema<PriorityConfigDoc>(
  {
    panchayatId: { type: Schema.Types.ObjectId, ref: 'Panchayat', index: true },
    name: { type: String, default: 'Default Panchayat Priority Model' },
    weights: {
      condition: { type: Number, default: 0.30, min: 0, max: 1 },
      complaints: { type: Number, default: 0.20, min: 0, max: 1 },
      population: { type: Number, default: 0.15, min: 0, max: 1 },
      traffic: { type: Number, default: 0.15, min: 0, max: 1 },
      maintenanceAge: { type: Number, default: 0.10, min: 0, max: 1 },
      alternativeDistance: { type: Number, default: 0.10, min: 0, max: 1 }
    },
    thresholds: {
      critical: { type: Number, default: 80, min: 0, max: 100 },
      high: { type: Number, default: 60, min: 0, max: 100 },
      medium: { type: Number, default: 40, min: 0, max: 100 },
      low: { type: Number, default: 0, min: 0, max: 100 }
    },
    limits: {
      maxComplaintsCap: { type: Number, default: 5 },
      maxPopulationCap: { type: Number, default: 5000 },
      maxMaintenanceAgeDays: { type: Number, default: 1095 },
      maxAlternativeDistanceKm: { type: Number, default: 5 }
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Validate weights sum to approximately 1.0 (allow 0.001 delta for floating point precision)
PriorityConfigSchema.pre('validate', function (next) {
  const w = this.weights;
  if (w) {
    const sum =
      (w.condition || 0) +
      (w.complaints || 0) +
      (w.population || 0) +
      (w.traffic || 0) +
      (w.maintenanceAge || 0) +
      (w.alternativeDistance || 0);

    const delta = Math.abs(sum - 1.0);
    if (delta > 0.01) {
      next(new Error(`Priority weights must sum to 1.0. Current sum is ${sum.toFixed(3)}.`));
      return;
    }
  }
  next();
});

export const PriorityConfig: Model<PriorityConfigDoc> = mongoose.model<PriorityConfigDoc>(
  'PriorityConfig',
  PriorityConfigSchema
);
