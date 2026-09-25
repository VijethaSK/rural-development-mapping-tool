import mongoose, { Schema, Document, Model } from 'mongoose';

export type UserRole = 'citizen' | 'pdo' | 'admin';

export interface UserDoc extends Document {
  name: string;
  email: string;
  username?: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
  panchayatId?: mongoose.Types.ObjectId;
  ward?: string;
  village?: string;
  isActive: boolean;
  isDemoAccount?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CitizenUserDoc extends UserDoc {
  role: 'citizen';
  voterId?: string;
  address?: string;
  complaintsSubmittedCount: number;
}

export interface PdoUserDoc extends UserDoc {
  role: 'pdo';
  designation: 'PDO' | 'Junior_Engineer' | 'Ward_Member' | 'Supervisor';
  assignedWard?: string;
  department: string;
  activeAssignmentsCount: number;
}

export interface AdminUserDoc extends UserDoc {
  role: 'admin';
  permissions: string[];
  lastLoginAt?: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      index: true
    },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['citizen', 'pdo', 'admin'],
      required: true,
      index: true
    },
    panchayatId: { type: Schema.Types.ObjectId, ref: 'Panchayat', index: true },
    ward: { type: String, trim: true },
    village: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    isDemoAccount: { type: Boolean, default: false, index: true }
  },
  {
    timestamps: true,
    discriminatorKey: 'role'
  }
);

// Indexes
UserSchema.index({ role: 1, panchayatId: 1 });
UserSchema.index({ role: 1, ward: 1 });

export const User: Model<UserDoc> = mongoose.model<UserDoc>('User', UserSchema);

// Citizen Discriminator
export const CitizenUser: Model<CitizenUserDoc> = User.discriminator<CitizenUserDoc>(
  'citizen',
  new Schema({
    voterId: { type: String, trim: true },
    address: { type: String, trim: true },
    complaintsSubmittedCount: { type: Number, default: 0 }
  })
);

// Member/PDO Discriminator
export const PdoUser: Model<PdoUserDoc> = User.discriminator<PdoUserDoc>(
  'pdo',
  new Schema({
    designation: {
      type: String,
      enum: ['PDO', 'Junior_Engineer', 'Ward_Member', 'Supervisor'],
      default: 'PDO'
    },
    assignedWard: { type: String, trim: true },
    department: { type: String, default: 'Rural Development & Panchayat Raj' },
    activeAssignmentsCount: { type: Number, default: 0 }
  })
);

// Admin Discriminator
export const AdminUser: Model<AdminUserDoc> = User.discriminator<AdminUserDoc>(
  'admin',
  new Schema({
    permissions: {
      type: [String],
      default: ['manage_users', 'configure_weights', 'verify_work', 'manage_infrastructure']
    },
    lastLoginAt: { type: Date }
  })
);
