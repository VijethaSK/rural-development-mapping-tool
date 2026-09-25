import mongoose from 'mongoose';
import { Complaint } from '../../models/Complaint.js';
import {
  ComplaintFilterOptions,
  ComplaintAnalyticsSummary,
  ComplaintHeatmapResult,
  ComplaintCluster,
  HeatmapPoint
} from './types.js';
import { SpatialUtils } from '../spatial/spatialUtils.js';
import { normalizeState } from './complaintStateMachine.js';

export class ComplaintAnalyticsService {
  /**
   * Translate UI filter options into a Mongoose query.
   */
  public static buildFilterQuery(options: ComplaintFilterOptions): any {
    const query: any = {};

    if (options.panchayatId) {
      query.panchayatId = new mongoose.Types.ObjectId(options.panchayatId);
    }

    if (options.category && options.category !== 'All') {
      query.category = options.category;
    }

    if (options.priority && options.priority !== 'All') {
      query.priority = options.priority;
    }

    if (options.status && options.status !== 'All') {
      query.status = options.status;
    }

    if (options.ward && options.ward !== 'All') {
      query.ward = options.ward;
    }

    if (options.infrastructureType && options.infrastructureType !== 'All') {
      // Direct category or type alignment
      query.category = options.infrastructureType;
    }

    // Date range filter
    if (options.startDate || options.endDate) {
      query.createdAt = {};
      if (options.startDate) {
        query.createdAt.$gte = new Date(options.startDate);
      }
      if (options.endDate) {
        // Include up to end of the day
        const end = new Date(options.endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    return query;
  }

  /**
   * High-efficiency MongoDB aggregation pipeline for dashboard metrics.
   */
  public static async getSummary(
    options: ComplaintFilterOptions = {}
  ): Promise<ComplaintAnalyticsSummary> {
    const filterQuery = this.buildFilterQuery(options);

    // 1. Core Counts
    const complaints = await Complaint.find(filterQuery)
      .select('category priority status ward village createdAt')
      .lean();

    const totalComplaints = complaints.length;
    let openComplaints = 0;
    let resolvedComplaints = 0;
    let criticalComplaints = 0;

    const categoryBreakdown: Record<string, number> = {};
    const priorityBreakdown: Record<string, number> = {};
    const statusBreakdown: Record<string, number> = {};
    const wardCounts: Record<string, { count: number; ward: string; village: string }> = {};
    const monthlyCounts: Record<string, number> = {};

    for (const c of complaints) {
      // Status
      const st = normalizeState(c.status || 'SUBMITTED');
      statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
      if (st === 'CLOSED') {
        resolvedComplaints++;
      } else if (st !== 'REJECTED') {
        openComplaints++;
      }

      // Priority
      const pr = c.priority || 'Medium';
      priorityBreakdown[pr] = (priorityBreakdown[pr] || 0) + 1;
      if (pr === 'Critical') {
        criticalComplaints++;
      }

      // Category
      const cat = c.category || 'Other';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;

      // Area concentration
      const areaKey = c.village ? `${c.ward} - ${c.village}` : c.ward || 'General';
      if (!wardCounts[areaKey]) {
        wardCounts[areaKey] = {
          count: 0,
          ward: c.ward || 'General',
          village: c.village || ''
        };
      }
      wardCounts[areaKey].count++;

      // Monthly timeline
      if (c.createdAt) {
        const d = new Date(c.createdAt);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
      }
    }

    // Most affected infrastructure type
    let mostAffectedInfrastructureType = 'None';
    let maxCategoryCount = -1;
    for (const [cat, count] of Object.entries(categoryBreakdown)) {
      if (count > maxCategoryCount) {
        maxCategoryCount = count;
        mostAffectedInfrastructureType = cat;
      }
    }

    // Highest concentration area
    let highestConcentrationArea = {
      name: 'None',
      ward: 'None',
      count: 0
    };
    let maxAreaCount = -1;
    for (const [areaName, data] of Object.entries(wardCounts)) {
      if (data.count > maxAreaCount) {
        maxAreaCount = data.count;
        highestConcentrationArea = {
          name: areaName,
          ward: data.ward,
          count: data.count
        };
      }
    }

    // Sort timeline trend
    const timelineTrend = Object.entries(monthlyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalComplaints,
      openComplaints,
      resolvedComplaints,
      criticalComplaints,
      mostAffectedInfrastructureType,
      highestConcentrationArea,
      categoryBreakdown,
      priorityBreakdown,
      statusBreakdown,
      timelineTrend
    };
  }

  /**
   * Extract heatmap points and spatial clusters from complaints in database.
   * Gracefully discards or flags records with missing/invalid coordinates.
   */
  public static async getHeatmapData(
    options: ComplaintFilterOptions = {}
  ): Promise<ComplaintHeatmapResult> {
    const filterQuery = this.buildFilterQuery(options);

    const complaints = await Complaint.find(filterQuery)
      .select('title category priority status location ward village upvotesCount createdAt')
      .lean();

    const points: HeatmapPoint[] = [];
    let missingCoordinatesCount = 0;

    // Temporary list of valid complaints with normalized coordinates for clustering
    interface ValidComplaint {
      id: string;
      title: string;
      category: string;
      priority: string;
      status: string;
      ward: string;
      lat: number;
      lng: number;
      intensity: number;
    }

    const validList: ValidComplaint[] = [];

    for (const c of complaints) {
      let lat: number | null = null;
      let lng: number | null = null;

      const loc: any = c.location;
      if (loc) {
        if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
          lng = Number(loc.coordinates[0]);
          lat = Number(loc.coordinates[1]);
        } else if (loc.lat != null && loc.lng != null) {
          lat = Number(loc.lat);
          lng = Number(loc.lng);
        }
      }

      // Safe validation: coordinates must be valid numbers within bounds
      if (
        lat == null ||
        lng == null ||
        isNaN(lat) ||
        isNaN(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        missingCoordinatesCount++;
        continue;
      }

      // Calculate intensity based on priority and upvotes
      let intensity = 0.5;
      if (c.priority === 'Critical') intensity = 1.0;
      else if (c.priority === 'High') intensity = 0.75;
      else if (c.priority === 'Medium') intensity = 0.5;
      else if (c.priority === 'Low') intensity = 0.25;

      // Upvotes boost (community validation)
      if (c.upvotesCount && c.upvotesCount > 0) {
        intensity = Math.min(1.0, intensity + Math.min(0.25, c.upvotesCount * 0.05));
      }

      // Resolved complaints display with lower heat intensity
      if (normalizeState(c.status || 'SUBMITTED') === 'CLOSED') {
        intensity *= 0.4;
      }

      intensity = Number(intensity.toFixed(2));

      points.push([lat, lng, intensity]);
      validList.push({
        id: String(c._id),
        title: c.title,
        category: c.category,
        priority: c.priority,
        status: c.status,
        ward: c.ward || 'General',
        lat,
        lng,
        intensity
      });
    }

    // Spatial Clustering: Group nearby complaints (within ~250m) into inspection clusters
    const clusters: ComplaintCluster[] = [];
    const visited = new Set<string>();
    const CLUSTER_RADIUS_KM = 0.25; // 250 meters

    let clusterIdx = 1;
    for (let i = 0; i < validList.length; i++) {
      const current = validList[i];
      if (visited.has(current.id)) continue;

      const clusterGroup: ValidComplaint[] = [current];
      visited.add(current.id);

      for (let j = i + 1; j < validList.length; j++) {
        const other = validList[j];
        if (visited.has(other.id)) continue;

        const dist = SpatialUtils.haversineDistanceKm(
          { lat: current.lat, lng: current.lng },
          { lat: other.lat, lng: other.lng }
        );

        if (dist <= CLUSTER_RADIUS_KM) {
          clusterGroup.push(other);
          visited.add(other.id);
        }
      }

      // Compute cluster center (centroid)
      const sumLat = clusterGroup.reduce((sum, item) => sum + item.lat, 0);
      const sumLng = clusterGroup.reduce((sum, item) => sum + item.lng, 0);
      const center = {
        lat: Number((sumLat / clusterGroup.length).toFixed(6)),
        lng: Number((sumLng / clusterGroup.length).toFixed(6))
      };

      const criticalCount = clusterGroup.filter((item) => item.priority === 'Critical').length;
      const highCount = clusterGroup.filter((item) => item.priority === 'High').length;

      // Find top category in cluster
      const catTally: Record<string, number> = {};
      for (const item of clusterGroup) {
        catTally[item.category] = (catTally[item.category] || 0) + 1;
      }
      let topCategory = current.category;
      let maxTally = -1;
      for (const [k, v] of Object.entries(catTally)) {
        if (v > maxTally) {
          maxTally = v;
          topCategory = k;
        }
      }

      const clusterName =
        clusterGroup.length > 1
          ? `${current.ward || 'Panchayat'} Cluster #${clusterIdx} (${clusterGroup.length} reports)`
          : current.title;

      clusters.push({
        clusterId: `cluster-${clusterIdx}`,
        name: clusterName,
        ward: current.ward,
        center,
        count: clusterGroup.length,
        criticalCount,
        highCount,
        topCategory,
        complaintIds: clusterGroup.map((item) => item.id)
      });

      clusterIdx++;
    }

    // Sort clusters with highest counts & critical reports first
    clusters.sort((a, b) => b.count * 2 + b.criticalCount - (a.count * 2 + a.criticalCount));

    return {
      points,
      clusters,
      validCount: points.length,
      missingCoordinatesCount,
      maxIntensity: 1.0
    };
  }

  /**
   * Retrieve full details of complaints for a specific cluster or array of IDs.
   */
  public static async getClusterDetails(complaintIds: string[], panchayatId?: string): Promise<any[]> {
    if (!complaintIds || complaintIds.length === 0) return [];

    const objIds = complaintIds.map((id) => new mongoose.Types.ObjectId(id));
    const items = await Complaint.find({ _id: { $in: objIds }, ...(panchayatId ? { panchayatId } : {}) })
      .populate('infrastructureId', 'name type condition')
      .select('-citizenId -reporterName -reporterPhone')
      .sort({ priority: 1, createdAt: -1 })
      .lean();

    return items;
  }
}
