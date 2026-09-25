export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export interface OverviewMetrics {
  totalInfrastructure: number;
  roadsCount: number;
  schoolsCount: number;
  healthcareCount: number;
  waterFacilityCount: number;
  otherCount: number;
  openComplaints: number;
  activeMaintenanceTasks: number;
  sourceInfrastructureCount: number;
  legacyInfrastructureCount: number;
  syntheticComplaintCount: number;
  syntheticAssignmentCount: number;
  syntheticRouteCount: number;
  panchayatName?: string;
  panchayatDistrict?: string;
}

export interface PriorityDistributionItem {
  level: PriorityLevel;
  count: number;
  percentage: number;
  color: string;
}

export interface TopAttentionItem {
  id: string;
  name: string;
  type: string;
  ward: string;
  village?: string;
  condition: string;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  complaintsCount: number;
  populationServed: number;
  estimatedMaintenanceCost: number;
  explanation?: {
    summary: string;
  };
}

export interface PriorityMetrics {
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  averageScore: number;
  distribution: PriorityDistributionItem[];
  top10Attention: TopAttentionItem[];
}

export interface MaintenanceAssignmentItem {
  id: string;
  assignmentNumber: string;
  title: string;
  description?: string;
  infrastructureId?: string;
  infrastructureName?: string;
  assignedMemberName?: string;
  priority: string;
  status: 'Assigned' | 'In_Progress' | 'Completed' | 'Verified' | 'Rejected';
  scheduledDate: string;
  targetCompletionDate?: string;
  isOverdue: boolean;
  allocatedBudget: number;
  actualCost: number;
  completionNotes?: string;
  completedAt?: string;
  verifiedAt?: string;
}

export interface MaintenanceMetrics {
  pendingAssignments: number;
  inProgressWork: number;
  completedAwaitingVerification: number;
  overdueWork: number;
  totalAssignments: number;
  recentAssignments: MaintenanceAssignmentItem[];
}

export interface RouteSummaryItem {
  id: string;
  name: string;
  assignedMemberName?: string;
  stopsCount: number;
  totalDistanceKm: number;
  estimatedDurationMinutes: number;
  status: 'Planned' | 'In_Progress' | 'Completed' | 'Cancelled';
  generatedAt: string;
  stops: {
    stopOrder: number;
    name: string;
    priorityScore: number;
  }[];
}

export interface RoutesMetrics {
  activeRoutesCount: number;
  totalDistanceKm: number;
  totalStops: number;
  plannedRoutes: RouteSummaryItem[];
}

export interface GapSummaryItem {
  name: string;
  ward?: string;
  distanceToNearestSchoolKm: number;
  distanceToNearestRoadKm: number;
  severity: 'Critical' | 'High' | 'Moderate' | 'Served';
  affectedPopulation: number;
  issues: string[];
}

export interface GapMetrics {
  underservedHabitationsCount: number;
  totalHabitationsCount: number;
  affectedPopulation: number;
  totalPopulation: number;
  schoolCoveragePercent: number;
  criticalGapsCount: number;
  highGapsCount: number;
  topGaps: GapSummaryItem[];
}

export interface BudgetProjectItem {
  infrastructureId: string;
  name: string;
  type: string;
  ward: string;
  condition: string;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  estimatedRepairCost: number;
  populationServed: number;
  complaintsCount: number;
  impactScore: number;
  valuePerLakh: number;
  selectionReason: string;
  costSharePercent: number;
}

export interface BudgetSummaryMetrics {
  budget: number;
  totalBacklogCost: number;
  criticalBacklogCost: number;
  allocatedCost: number;
  remainingBuffer: number;
  budgetUtilizationPercent: number;
  selectedProjectsCount: number;
  populationBenefited: number;
  complaintsResolved: number;
  recommendedProjects: BudgetProjectItem[];
}

export interface ConditionDistributionItem {
  condition: string;
  count: number;
  percentage: number;
}

export interface CategoryComplaintItem {
  category: string;
  count: number;
}

export interface StatusCountItem {
  status: string;
  count: number;
}

export interface AnalyticsMetrics {
  conditionDistribution: ConditionDistributionItem[];
  complaintsByCategory: CategoryComplaintItem[];
  complaintsByStatus: StatusCountItem[];
  monthlyComplaintTrends: { month: string; count: number }[];
  completionRatePercent: number;
}

export interface MapFeatureItem {
  id: string;
  name: string;
  type: string;
  ward: string;
  location?: {
    coordinates: [number, number]; // [lng, lat]
  };
  lineGeometry?: {
    coordinates: [number, number][];
  };
  condition: string | null;
  priorityScore: number | null;
  priorityLevel: PriorityLevel | 'Unavailable';
  complaintsCount: number | null;
  estimatedCost: number | null;
  dataOrigin?: string;
  isSynthetic?: boolean;
  sourceCategory?: string;
  sourceStatus?: string;
}

export interface ComplaintMapItem {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  location?: {
    coordinates: [number, number]; // [lng, lat]
  };
  upvotesCount: number;
}

export interface AdminDashboardData {
  overview: OverviewMetrics;
  priority: PriorityMetrics;
  maintenance: MaintenanceMetrics;
  routes: RoutesMetrics;
  gapAnalysis: GapMetrics;
  budget: BudgetSummaryMetrics;
  analytics: AnalyticsMetrics;
  mapData: {
    infrastructure: MapFeatureItem[];
    complaints: ComplaintMapItem[];
  };
  generatedAt: string;
}
