import mongoose, { Schema, Document, Model } from 'mongoose';
import { GeoPoint, GeoPointSchema } from './common/Location.js';

export type ComplaintCategory = 'Road' | 'School' | 'Healthcare' | 'Water' | 'Sanitation' | 'Electricity' | 'Other';
export type ComplaintPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type ComplaintStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'PRIORITY_SET'
  | 'ASSIGNED'
  | 'REASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'VERIFIED'
  | 'CLOSED'
  | 'REJECTED';

// ---------------- SUB-SCHEMAS ----------------

export interface ComplaintImage {
  url: string;
  caption?: string;
  uploadedAt: Date;
}

export const ComplaintImageSchema = new Schema<ComplaintImage>(
  {
    url: { type: String, required: true },
    caption: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

export interface StatusHistoryItem {
  oldStatus?: string;
  fromStatus?: string;
  newStatus?: string;
  toStatus?: string;
  status: string; // compatibility
  changedBy?: mongoose.Types.ObjectId;
  changedByName?: string;
  changedByRole?: string;
  updatedBy?: mongoose.Types.ObjectId;
  updatedByName?: string;
  comment?: string;
  notes?: string;
  timestamp: Date;
}

export const StatusHistorySchema = new Schema<StatusHistoryItem>(
  {
    oldStatus: { type: String },
    fromStatus: { type: String },
    newStatus: { type: String },
    toStatus: { type: String },
    status: { type: String },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changedByName: { type: String, default: 'System' },
    changedByRole: { type: String, default: 'system' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedByName: { type: String },
    comment: { type: String, default: '' },
    notes: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
  },
  { _id: false }
);

StatusHistorySchema.pre('validate', function (next) {
  const self = this as any;
  if (!self.newStatus && self.status) self.newStatus = self.status;
  if (!self.status && self.newStatus) self.status = self.newStatus;
  if (!self.toStatus && self.newStatus) self.toStatus = self.newStatus;
  if (!self.fromStatus && self.oldStatus) self.fromStatus = self.oldStatus;
  if (!self.oldStatus && self.fromStatus) self.oldStatus = self.fromStatus;
  if (!self.changedBy && self.updatedBy) self.changedBy = self.updatedBy;
  if (!self.updatedBy && self.changedBy) self.updatedBy = self.changedBy;
  if (!self.changedByName && self.updatedByName) self.changedByName = self.updatedByName;
  if (!self.updatedByName && self.changedByName) self.updatedByName = self.changedByName;
  if (!self.comment && self.notes) self.comment = self.notes;
  if (!self.notes && self.comment) self.notes = self.comment;
  next();
});

export interface Comment {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  userName: string;
  userRole: string;
  text: string;
  createdAt: Date;
}

export const CommentSchema = new Schema<Comment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    userRole: { type: String, default: 'citizen' },
    text: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

export interface Vote {
  userId: mongoose.Types.ObjectId;
  votedAt: Date;
}

export const VoteSchema = new Schema<Vote>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    votedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

// ---------------- MAIN COMPLAINT DOCUMENT ----------------

export interface ComplaintDoc extends Document {
  panchayatId: mongoose.Types.ObjectId;
  infrastructureId?: mongoose.Types.ObjectId | null;
  citizenId?: mongoose.Types.ObjectId | null;
  title: string;
  description: string;
  category: ComplaintCategory;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  statusHistory: StatusHistoryItem[];
  location?: GeoPoint | null;
  ward: string;
  village: string;
  images: ComplaintImage[];
  comments: Comment[];
  votes: Vote[];
  upvotesCount: number;
  reporterName?: string;
  reporterPhone?: string;
  photoUrl?: string; // Legacy compatibility
  schoolId?: mongoose.Types.ObjectId | null; // Legacy compatibility
  roadId?: mongoose.Types.ObjectId | null; // Legacy compatibility
  isSynthetic?: boolean;
  dataOrigin?: 'DEMO' | 'USER_SUBMITTED' | 'LEGACY_DEMO';
  createdAt: Date;
  updatedAt: Date;
}

const ComplaintSchema = new Schema<ComplaintDoc>(
  {
    panchayatId: { type: Schema.Types.ObjectId, ref: 'Panchayat', required: true, index: true },
    infrastructureId: { type: Schema.Types.ObjectId, ref: 'Infrastructure', index: true },
    citizenId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Road', 'School', 'Healthcare', 'Water', 'Sanitation', 'Electricity', 'Other'],
      required: true,
      index: true
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
      index: true
    },
    status: {
      type: String,
      enum: [
        'SUBMITTED',
        'UNDER_REVIEW',
        'PRIORITY_SET',
        'ASSIGNED',
        'REASSIGNED',
        'IN_PROGRESS',
        'COMPLETED',
        'VERIFIED',
        'CLOSED',
        'REJECTED',
      ],
      default: 'SUBMITTED',
      index: true
    },
    statusHistory: { type: [StatusHistorySchema], default: [] },
    location: { type: GeoPointSchema, required: false },
    ward: { type: String, required: true, trim: true, index: true },
    village: { type: String, default: '', trim: true },
    images: { type: [ComplaintImageSchema], default: [] },
    comments: { type: [CommentSchema], default: [] },
    votes: { type: [VoteSchema], default: [] },
    upvotesCount: { type: Number, default: 0, index: true },

    // Legacy fields for backward compatibility with existing controllers
    reporterName: { type: String, trim: true },
    reporterPhone: { type: String, trim: true },
    photoUrl: { type: String, trim: true },
    schoolId: { type: Schema.Types.ObjectId, ref: 'Infrastructure' },
    roadId: { type: Schema.Types.ObjectId, ref: 'Infrastructure' },
    isSynthetic: { type: Boolean, default: false, index: true },
    dataOrigin: { type: String, enum: ['DEMO', 'USER_SUBMITTED', 'LEGACY_DEMO'], index: true }
  },
  { timestamps: true }
);

// Indexes
ComplaintSchema.index({ location: '2dsphere' });
ComplaintSchema.index({ panchayatId: 1, status: 1 });
ComplaintSchema.index({ category: 1, priority: 1 });
ComplaintSchema.index({ ward: 1, status: 1 });
ComplaintSchema.index({ createdAt: -1 });

// Pre-validate hook to convert legacy { lat, lng } to GeoJSON Point
ComplaintSchema.pre('validate', function (next) {
  const loc: any = this.location;
  if (loc && typeof loc === 'object' && loc.lat != null && loc.lng != null && !Array.isArray(loc.coordinates)) {
    this.location = {
      type: 'Point',
      coordinates: [Number(loc.lng), Number(loc.lat)]
    };
  }
  if (!this.title && this.description) {
    this.title = this.description.slice(0, 50) + (this.description.length > 50 ? '...' : '');
  }
  next();
});

// Middleware to keep upvotesCount in sync and set photoUrl
ComplaintSchema.pre('save', function (next) {
  if (this.votes) {
    this.upvotesCount = this.votes.length;
  }
  if (!this.photoUrl && this.images && this.images.length > 0) {
    this.photoUrl = this.images[0].url;
  }
  if (this.photoUrl && (!this.images || this.images.length === 0)) {
    this.images = [{ url: this.photoUrl, uploadedAt: new Date(), caption: '' }];
  }
  if (!this.title && this.description) {
    this.title = this.description.slice(0, 50) + (this.description.length > 50 ? '...' : '');
  }
  if (!this.statusHistory || this.statusHistory.length === 0) {
    const cur = this.status || 'SUBMITTED';
    this.statusHistory = [
      {
        newStatus: cur,
        toStatus: cur,
        status: cur,
        changedByName: 'Citizen Reporter',
        changedByRole: 'citizen',
        comment: 'Grievance registered and logged in Panchayat system',
        notes: 'Grievance registered and logged in Panchayat system',
        timestamp: new Date()
      }
    ];
  }
  next();
});

export const Complaint: Model<ComplaintDoc> = mongoose.model<ComplaintDoc>('Complaint', ComplaintSchema);

// Backward-compatible alias
export const IssueReport = Complaint;
export type IssueDoc = ComplaintDoc;
