export type PdoTaskStatus =
  | 'Assigned'
  | 'Accepted'
  | 'In_Progress'
  | 'Completed'
  | 'Verified'
  | 'Rejected';

export interface WorkCounts {
  assigned: number;
  accepted: number;
  inProgress: number;
  completed: number; // Completed / Awaiting Verification
  verified: number;
  total: number;
}

export interface CompletionImage {
  url: string;
  caption?: string;
  uploadedAt?: string;
}

export interface PdoAssignmentItem {
  _id: string;
  assignmentNumber: string;
  title: string;
  description?: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  status: PdoTaskStatus;
  scheduledDate: string;
  targetCompletionDate?: string;
  allocatedBudget: number;
  actualCost: number;
  startLocation?: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  completionLocation?: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  completionImages?: CompletionImage[];
  completionNotes?: string;
  completedAt?: string;
  verifiedAt?: string;
  verificationNotes?: string;
  infrastructureId?: {
    _id: string;
    name: string;
    type: string;
    ward: string;
    village?: string;
    condition: string;
    priorityScore: number;
    estimatedRepairCost?: number;
    estimatedMaintenanceCost?: number;
    location?: {
      type: string;
      coordinates: [number, number]; // [lng, lat]
    };
    lineGeometry?: {
      type: string;
      coordinates: [number, number][];
    };
    trafficLevel?: string;
    studentCount?: number;
    accessibility?: {
      roadAccess: boolean;
      allWeatherAccessible: boolean;
      distanceToNearestRoadMeters?: number;
    };
  };
  complaintId?: {
    _id: string;
    title: string;
    description: string;
    category: string;
    priority: string;
    status: string;
    images?: { url: string; caption?: string }[];
    location?: {
      type: string;
      coordinates: [number, number]; // [lng, lat]
    };
    upvotesCount: number;
    reporterName?: string;
    reporterPhone?: string;
  };
  assignedMember?: {
    _id: string;
    name: string;
    phone?: string;
    designation?: string;
    assignedWard?: string;
  };
  assignedBy?: {
    _id: string;
    name: string;
    role: string;
  };
  verifiedBy?: {
    _id: string;
    name: string;
    role: string;
  };
}

export interface PdoWorkResponse {
  counts: WorkCounts;
  assignments: PdoAssignmentItem[];
}

export interface PdoWorkDetailResponse {
  assignment: PdoAssignmentItem;
  priorityExplanation?: {
    priorityScore: number;
    priorityLevel: string;
    summary: string;
    factors: any;
  };
}
