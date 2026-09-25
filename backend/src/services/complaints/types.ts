export type HeatmapPoint = [number, number, number]; // [lat, lng, intensity]

export interface ComplaintFilterOptions {
  panchayatId?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  category?: string; // 'All' or specific category
  infrastructureType?: string; // 'All' or specific infra type
  status?: string; // 'All' or specific status
  priority?: string; // 'All' or specific priority
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
