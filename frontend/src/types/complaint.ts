export type HeatmapPoint = [number, number, number]; // [lat, lng, intensity]

export interface ComplaintFilterOptions {
  panchayatId?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  infrastructureType?: string;
  status?: string;
  priority?: string;
  ward?: string;
}

export interface ComplaintCluster {
  clusterId: string;
  name: string;
  ward: string;
  center: { lat: number; lng: number };
  count: number;
  criticalCount: number;
  highCount: number;
  topCategory: string;
  complaintIds: string[];
}

export interface ComplaintAnalyticsSummary {
  totalComplaints: number;
  openComplaints: number;
  resolvedComplaints: number;
  criticalComplaints: number;
  mostAffectedInfrastructureType: string;
  highestConcentrationArea: {
    name: string;
    ward: string;
    count: number;
  };
  categoryBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
  timelineTrend: Array<{ date: string; count: number }>;
}

export interface ComplaintHeatmapResult {
  points: HeatmapPoint[];
  clusters: ComplaintCluster[];
  validCount: number;
  missingCoordinatesCount: number;
  maxIntensity: number;
}

export interface ComplaintDetail {
  _id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  ward: string;
  village?: string;
  upvotesCount: number;
  reporterName?: string;
  reporterPhone?: string;
  images?: Array<{ url: string; caption?: string }>;
  createdAt: string;
  infrastructureId?: {
    _id?: string;
    name?: string;
    type?: string;
    condition?: string;
  };
}
