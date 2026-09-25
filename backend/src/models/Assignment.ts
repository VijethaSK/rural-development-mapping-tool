import mongoose, { Schema, Document, Model } from 'mongoose';
import { GeoPoint, GeoPointSchema } from './common/Location.js';
import { ComplaintImage, ComplaintImageSchema } from './Complaint.js';

export type AssignmentStatus =
  | 'Assigned'
  | 'Accepted'
  | 'In_Progress'
  | 'Completed'
  | 'Verified'
  | 'Rejected';

export interface AssignmentStatusHistoryItem {
  fromStatus: string;
  toStatus: string;
  changedBy?: mongoose.Types.ObjectId;
  changedByName: string;
  changedByRole: string;
  notes?: string;
  timestamp: Date;
}

export type AssignmentPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface AssignmentDoc extends Document {
  panchayatId: mongoose.Types.ObjectId;
  assignmentNumber: string;
  title: string;
  description?: string;
  infrastructureId: mongoose.Types.ObjectId;
  complaintId?: mongoose.Types.ObjectId | null;
  assignedMember: mongoose.Types.ObjectId; // User (PDO/Member)
  assignedBy: mongoose.Types.ObjectId; // User (Admin)
  priority: AssignmentPriority;
  scheduledDate: Date;
  targetCompletionDate?: Date;
  status: AssignmentStatus;
  statusHistory: AssignmentStatusHistoryItem[];
  startLocation?: GeoPoint | null;
  completionLocation?: GeoPoint | null;
  completionImages: ComplaintImage[];
  completionNotes?: string;
  completedAt?: Date;
  verifiedBy?: mongoose.Types.ObjectId | null;
  verifiedAt?: Date;
  verificationNotes?: string;
  allocatedBudget: number;
  actualCost: number;
  isSynthetic?: boolean;
  dataOrigin?: 'DEMO' | 'ADMIN_CREATED' | 'LEGACY_DEMO';
  createdAt: Date;
  updatedAt: Date;
}

const AssignmentSchema = new Schema<AssignmentDoc>(
  {
    panchayatId: { type: Schema.Types.ObjectId, ref: 'Panchayat', required: true, index: true },
    assignmentNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    infrastructureId: { type: Schema.Types.ObjectId, ref: 'Infrastructure', required: true, index: true },
    complaintId: { type: Schema.Types.ObjectId, ref: 'Complaint', index: true },
    assignedMember: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
      index: true
    },
    scheduledDate: { type: Date, required: true, default: Date.now },
    targetCompletionDate: { type: Date },
    status: {
      type: String,
      enum: ['Assigned', 'Accepted', 'In_Progress', 'Completed', 'Verified', 'Rejected'],
      default: 'Assigned',
      index: true
    },
    statusHistory: [{
      fromStatus: { type: String, required: true },
      toStatus: { type: String, required: true },
      changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      changedByName: { type: String, required: true },
      changedByRole: { type: String, required: true },
      notes: { type: String, default: '' },
      timestamp: { type: Date, default: Date.now }
    }],
    startLocation: { type: GeoPointSchema, required: false },
    completionLocation: { type: GeoPointSchema, required: false },
    completionImages: { type: [ComplaintImageSchema], default: [] },
    completionNotes: { type: String, default: '' },
    completedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    verificationNotes: { type: String, default: '' },
    allocatedBudget: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 },
    isSynthetic: { type: Boolean, default: false, index: true },
    dataOrigin: { type: String, enum: ['DEMO', 'ADMIN_CREATED', 'LEGACY_DEMO'], index: true }
  },
  { timestamps: true }
);

// Indexes
AssignmentSchema.index({ completionLocation: '2dsphere' }, { sparse: true });
AssignmentSchema.index({ startLocation: '2dsphere' }, { sparse: true });
AssignmentSchema.index({ assignedMember: 1, status: 1 });
AssignmentSchema.index({ panchayatId: 1, status: 1 });
AssignmentSchema.index({ priority: 1, scheduledDate: 1 });

export const Assignment: Model<AssignmentDoc> = mongoose.model<AssignmentDoc>('Assignment', AssignmentSchema);
