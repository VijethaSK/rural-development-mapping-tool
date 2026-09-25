import mongoose, { Schema, Document, Model } from 'mongoose';
import { GeoPoint, GeoPointSchema, GeoLineString, GeoLineStringSchema } from './common/Location.js';

export interface RouteStop {
  stopOrder: number;
  infrastructureId?: mongoose.Types.ObjectId;
  assignmentId?: mongoose.Types.ObjectId;
  name: string;
  location: GeoPoint;
  legDistanceMeters: number;
  legDurationSeconds: number;
  priorityScore: number;
}

export const RouteStopSchema = new Schema<RouteStop>(
  {
    stopOrder: { type: Number, required: true },
    infrastructureId: { type: Schema.Types.ObjectId, ref: 'Infrastructure' },
    assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment' },
    name: { type: String, required: true },
    location: { type: GeoPointSchema, required: true },
    legDistanceMeters: { type: Number, default: 0 },
    legDurationSeconds: { type: Number, default: 0 },
    priorityScore: { type: Number, default: 0 }
  },
  { _id: false }
);

export interface RouteDestination {
  infrastructureId: mongoose.Types.ObjectId;
  assignmentId?: mongoose.Types.ObjectId;
  name: string;
  location: GeoPoint;
  priority: number;
}

export const RouteDestinationSchema = new Schema<RouteDestination>(
  {
    infrastructureId: { type: Schema.Types.ObjectId, ref: 'Infrastructure', required: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment' },
    name: { type: String, required: true },
    location: { type: GeoPointSchema, required: true },
    priority: { type: Number, default: 0 }
  },
  { _id: false }
);

export interface RouteDoc extends Document {
  panchayatId: mongoose.Types.ObjectId;
  name: string;
  assignedMember: mongoose.Types.ObjectId; // User (PDO/Member)
  startLocation: GeoPoint;
  destinations: RouteDestination[];
  orderedStops: RouteStop[];
  geometry: GeoLineString;
  totalDistance: number; // in meters
  totalDistanceKm: number; // in kilometers (derived/convenience)
  estimatedDuration: number | null; // null when no honest estimate is available
  routingMethod: 'NETWORK_ROUTE' | 'STRAIGHT_LINE_FALLBACK' | 'LEGACY_UNKNOWN';
  fallbackUsed?: boolean;
  algorithmUsed: string;
  status: 'Planned' | 'In_Progress' | 'Completed' | 'Cancelled';
  generatedAt: Date;
  isSynthetic?: boolean;
  dataOrigin?: 'DEMO' | 'OPTIMIZED' | 'LEGACY_DEMO';
  createdAt: Date;
  updatedAt: Date;
}

const RouteSchema = new Schema<RouteDoc>(
  {
    panchayatId: { type: Schema.Types.ObjectId, ref: 'Panchayat', required: true, index: true },
    name: { type: String, required: true, trim: true },
    assignedMember: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    startLocation: { type: GeoPointSchema, required: true },
    destinations: { type: [RouteDestinationSchema], default: [] },
    orderedStops: { type: [RouteStopSchema], default: [] },
    geometry: { type: GeoLineStringSchema, required: true },
    totalDistance: { type: Number, required: true, default: 0 },
    totalDistanceKm: { type: Number, default: 0 },
    estimatedDuration: { type: Number, default: null },
    routingMethod: { type: String, enum: ['NETWORK_ROUTE', 'STRAIGHT_LINE_FALLBACK', 'LEGACY_UNKNOWN'], default: 'LEGACY_UNKNOWN' },
    fallbackUsed: { type: Boolean },
    algorithmUsed: { type: String, default: 'Dijkstra + 2-Opt TSP' },
    status: {
      type: String,
      enum: ['Planned', 'In_Progress', 'Completed', 'Cancelled'],
      default: 'Planned',
      index: true
    },
    generatedAt: { type: Date, default: Date.now, index: true },
    isSynthetic: { type: Boolean, default: false, index: true },
    dataOrigin: { type: String, enum: ['DEMO', 'OPTIMIZED', 'LEGACY_DEMO'], index: true }
  },
  { timestamps: true }
);

// Indexes
RouteSchema.index({ geometry: '2dsphere' });
RouteSchema.index({ startLocation: '2dsphere' });
RouteSchema.index({ assignedMember: 1, status: 1 });
RouteSchema.index({ panchayatId: 1, generatedAt: -1 });

// Helper hook to sync totalDistanceKm
RouteSchema.pre('save', function (next) {
  if (this.totalDistance != null) {
    this.totalDistanceKm = Number((this.totalDistance / 1000).toFixed(2));
  }
  next();
});

export const Route: Model<RouteDoc> = mongoose.model<RouteDoc>('Route', RouteSchema);
