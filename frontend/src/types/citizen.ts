export type ComplaintCategory =
  | 'Road'
  | 'School'
  | 'Healthcare'
  | 'Water'
  | 'Sanitation'
  | 'Electricity'
  | 'Other';

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

export interface ComplaintImage {
  url: string;
  caption?: string;
  uploadedAt?: string;
}

export interface StatusHistoryItem {
  oldStatus?: string;
  fromStatus?: string;
  newStatus?: string;
  toStatus?: string;
  status: ComplaintStatus;
  comment?: string;
  notes?: string;
  changedBy?: string | { _id: string; name: string; role: string };
  changedByName?: string;
  changedByRole?: string;
  updatedBy?: {
    _id: string;
    name: string;
    role: string;
  };
  updatedByName?: string;
  timestamp: string;
}

export interface AvailableTransition {
  targetState: string;
  description: string;
}

export interface CommentItem {
  _id?: string;
  userId: string | { _id: string; name: string; role: string };
  userName: string;
  userRole: string;
  text: string;
  createdAt: string;
}

export interface ComplaintItem {
  _id: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  ward: string;
  village?: string;
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  infrastructureId?: {
    _id: string;
    name: string;
    type: string;
    ward: string;
    village?: string;
    condition?: string;
    priorityScore?: number;
    location?: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
  citizenId?: {
    _id: string;
    name: string;
    phone?: string;
    voterId?: string;
  };
  images?: ComplaintImage[];
  comments?: CommentItem[];
  upvotesCount: number;
  hasVoted?: boolean;
  statusHistory?: StatusHistoryItem[];
  reporterName?: string;
  reporterPhone?: string;
  lifecycle?: LifecycleInfo;
  createdAt: string;
  updatedAt: string;
}

export interface LifecycleInfo {
  currentStatus: ComplaintStatus;
  normalizedStatus?: string;
  stepIndex: number;
  isRejected: boolean;
  isReassigned: boolean;
  steps: string[];
  availableTransitions?: AvailableTransition[];
}
