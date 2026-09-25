import mongoose from 'mongoose';
import { Panchayat } from '../../models/Panchayat.js';
import { Infrastructure } from '../../models/Infrastructure.js';
import { Complaint } from '../../models/Complaint.js';
import { normalizeState } from '../complaints/complaintStateMachine.js';
import { Assignment } from '../../models/Assignment.js';
import { Route } from '../../models/Route.js';
import { PriorityScoringService } from '../priorityScoringService.js';
import { BudgetRecommendationService } from '../budget/budgetRecommendationService.js';
import { GapDetectionService } from '../spatial/gapDetectionService.js';
import { SpatialUtils } from '../spatial/spatialUtils.js';

const INFRA_TYPES = ['Road', 'School', 'Healthcare', 'WaterFacility', 'Other'];
const HOTSPOT_RADIUS_KM = 0.25;

function dateRange(startDate?: string, endDate?: string) {
  const createdAt: Record<string, Date> = {};
  if (startDate) createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
  if (endDate) createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
  return Object.keys(createdAt).length ? { createdAt } : {};
}

function validDate(value?: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function readPoint(location: any): { lat: number; lng: number } | null {
  const coordinates = location?.coordinates;
  const lng = Array.isArray(coordinates) ? Number(coordinates[0]) : Number(location?.lng);
  const lat = Array.isArray(coordinates) ? Number(coordinates[1]) : Number(location?.lat);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export class AnalyticalReportService {
  static async generate(filters: { panchayatId?: string; infrastructureType?: string; startDate?: string; endDate?: string; budget?: number }) {
    const { panchayatId, infrastructureType, startDate, endDate } = filters;
    if (panchayatId && !mongoose.isValidObjectId(panchayatId)) throw new Error('Invalid Panchayat selection.');
    if (infrastructureType && !INFRA_TYPES.includes(infrastructureType)) throw new Error('Invalid infrastructure type.');
    if (!validDate(startDate) || !validDate(endDate)) throw new Error('Dates must use YYYY-MM-DD format.');
    if (startDate && endDate && startDate > endDate) throw new Error('Start date must be on or before end date.');
    if (filters.budget != null && (!Number.isFinite(filters.budget) || filters.budget < 0)) throw new Error('Budget must be a non-negative number.');

    const panchayat = panchayatId ? await Panchayat.findById(panchayatId).select('name district').lean() : null;
    if (panchayatId && !panchayat) throw new Error('Panchayat not found.');

    const infraQuery: any = {};
    if (panchayatId) infraQuery.panchayatId = panchayatId;
    if (infrastructureType) infraQuery.type = infrastructureType;
    const infrastructure: any[] = await Infrastructure.find(infraQuery).lean();
    const infraIds = infrastructure.map((item) => item._id);
    const typeToCategory: Record<string, string> = {
      Road: 'Road', School: 'School', Healthcare: 'Healthcare', WaterFacility: 'Water', Other: 'Other'
    };
    const complaintQuery: any = { ...dateRange(startDate, endDate) };
    if (panchayatId) complaintQuery.panchayatId = panchayatId;
    if (infrastructureType) {
      const category = typeToCategory[infrastructureType];
      complaintQuery.$or = [
        { infrastructureId: { $in: infraIds } },
        { roadId: { $in: infraIds } },
        { schoolId: { $in: infraIds } },
        ...(category ? [{ category }] : [])
      ];
    }

    const assignmentQuery: any = { ...dateRange(startDate, endDate) };
    const routeDate: Record<string, Date> = {};
    if (startDate) routeDate.$gte = new Date(`${startDate}T00:00:00.000Z`);
    if (endDate) routeDate.$lte = new Date(`${endDate}T23:59:59.999Z`);
    const routeQuery: any = Object.keys(routeDate).length ? { generatedAt: routeDate } : {};
    if (panchayatId) {
      assignmentQuery.panchayatId = panchayatId;
      routeQuery.panchayatId = panchayatId;
    }
    if (infrastructureType) {
      assignmentQuery.infrastructureId = { $in: infraIds };
      routeQuery.$or = [
        { 'orderedStops.infrastructureId': { $in: infraIds } },
        { 'destinations.infrastructureId': { $in: infraIds } }
      ];
    }

    const [complaints, assignments, routes, ranking] = await Promise.all([
      Complaint.find(complaintQuery).select('title category priority status ward village location createdAt infrastructureId').lean(),
      Assignment.find(assignmentQuery).select('status priority allocatedBudget actualCost scheduledDate createdAt infrastructureId').lean(),
      Route.find(routeQuery).select('name status totalDistanceKm totalDistance estimatedDuration generatedAt orderedStops destinations').sort({ generatedAt: -1 }).lean(),
      PriorityScoringService.getRanked({ panchayatId, type: infrastructureType })
    ]);

    const typeCounts: Record<string, number> = Object.fromEntries(INFRA_TYPES.map((type) => [type, 0]));
    const conditionCounts: Record<string, number> = {};
    let maintenanceNeeded = 0;
    for (const asset of infrastructure) {
      typeCounts[asset.type] = (typeCounts[asset.type] || 0) + 1;
      const condition = asset.condition || 'Unspecified';
      conditionCounts[condition] = (conditionCounts[condition] || 0) + 1;
      if (['Needs_Maintenance', 'Needs_Repair', 'Under_Maintenance', 'Under_Repair'].includes(asset.status)) maintenanceNeeded++;
    }

    const categoryCounts: Record<string, number> = {};
    const complaintPriorityCounts: Record<string, number> = {};
    const complaintStatusCounts: Record<string, number> = {};
    let openComplaints = 0;
    let closedComplaints = 0;
    const locatedComplaints = complaints.map((complaint: any) => ({ complaint, point: readPoint(complaint.location) })).filter((item) => item.point);
    for (const complaint of complaints as any[]) {
      categoryCounts[complaint.category || 'Other'] = (categoryCounts[complaint.category || 'Other'] || 0) + 1;
      complaintPriorityCounts[complaint.priority || 'Unspecified'] = (complaintPriorityCounts[complaint.priority || 'Unspecified'] || 0) + 1;
      const status = normalizeState(complaint.status || 'SUBMITTED');
      complaintStatusCounts[status] = (complaintStatusCounts[status] || 0) + 1;
      if (status === 'CLOSED') closedComplaints++;
      else if (status !== 'REJECTED') openComplaints++;
    }

    const visited = new Set<number>();
    const hotspots: any[] = [];
    for (let i = 0; i < locatedComplaints.length; i++) {
      if (visited.has(i)) continue;
      const group = [i];
      visited.add(i);
      for (let j = i + 1; j < locatedComplaints.length; j++) {
        if (visited.has(j)) continue;
        const distance = SpatialUtils.haversineDistanceKm(locatedComplaints[i].point!, locatedComplaints[j].point!);
        if (distance <= HOTSPOT_RADIUS_KM) {
          group.push(j);
          visited.add(j);
        }
      }
      const entries = group.map((index) => locatedComplaints[index]);
      const center = {
        lat: Number((entries.reduce((sum, entry) => sum + entry.point!.lat, 0) / entries.length).toFixed(6)),
        lng: Number((entries.reduce((sum, entry) => sum + entry.point!.lng, 0) / entries.length).toFixed(6))
      };
      const ward = entries[0].complaint.ward || 'Unspecified';
      const village = entries[0].complaint.village || '';
      const categories: Record<string, number> = {};
      for (const entry of entries) {
        const category = entry.complaint.category || 'Other';
        categories[category] = (categories[category] || 0) + 1;
      }
      hotspots.push({
        name: village ? `${ward} · ${village}` : ward,
        ward,
        village,
        complaintCount: entries.length,
        criticalCount: entries.filter(({ complaint }) => complaint.priority === 'Critical').length,
        center,
        topCategory: Object.entries(categories).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other'
      });
    }
    hotspots.sort((a, b) => b.complaintCount - a.complaintCount || b.criticalCount - a.criticalCount);

    const statusCounts: Record<string, number> = {};
    for (const assignment of assignments as any[]) statusCounts[assignment.status || 'Unspecified'] = (statusCounts[assignment.status || 'Unspecified'] || 0) + 1;
    const maintenance = {
      total: assignments.length,
      statusCounts,
      allocatedBudget: assignments.reduce((sum: number, item: any) => sum + (item.allocatedBudget || 0), 0),
      actualCost: assignments.reduce((sum: number, item: any) => sum + (item.actualCost || 0), 0)
    };

    const routeSummary = {
      count: routes.length,
      activeCount: routes.filter((route: any) => ['Planned', 'In_Progress'].includes(route.status)).length,
      totalDistanceKm: Number(routes.reduce((sum: number, route: any) => sum + (route.totalDistanceKm || (route.totalDistance || 0) / 1000), 0).toFixed(2)),
      totalStops: routes.reduce((sum: number, route: any) => sum + (route.orderedStops?.length || route.destinations?.length || 0), 0),
      routes: routes.slice(0, 10).map((route: any) => ({
        name: route.name,
        status: route.status,
        generatedAt: route.generatedAt,
        distanceKm: route.totalDistanceKm || Number(((route.totalDistance || 0) / 1000).toFixed(2)),
        durationMinutes: route.estimatedDuration || 0,
        stopCount: route.orderedStops?.length || route.destinations?.length || 0
      }))
    };

    // Gap detection requires the full road and school network, regardless of the selected reporting type.
    const gaps = await GapDetectionService.calculateAccessibility({
      panchayatId,
      schoolThresholdKm: 3,
      roadThresholdKm: 1,
      gridResolutionKm: 1,
      computeNetworkDistance: false
    });
    const gapSummary = {
      analyzedAreas: gaps.metrics.totalHabitations,
      underservedAreas: gaps.metrics.underservedAreasCount,
      affectedPopulation: gaps.metrics.populationAffected,
      totalPopulation: gaps.metrics.totalPopulation,
      criticalCount: gaps.underservedAreas.filter((area: any) => area.overallSeverity === 'Critical').length,
      highCount: gaps.underservedAreas.filter((area: any) => area.overallSeverity === 'High').length,
      topGaps: gaps.underservedAreas.filter((area: any) => area.overallSeverity !== 'Served').slice(0, 10).map((area: any) => ({
        name: area.name,
        ward: area.ward,
        severity: area.overallSeverity,
        affectedPopulation: area.populationAffected || 0,
        distanceToNearestSchoolKm: area.nearestSchool?.geographicDistanceKm,
        distanceToNearestRoadKm: area.nearestRoad?.geographicDistanceKm
      }))
    };

    const budget = await BudgetRecommendationService.recommendProjects({
      panchayatId,
      type: infrastructureType,
      budget: filters.budget ?? 1000000,
      strategy: 'greedy',
      useRecordedCostsOnly: true
    });
    const rankedItems = ranking.items;
    const topCritical = rankedItems.filter((item) => item.priorityLevel === 'Critical').slice(0, 10);

    return {
      generatedAt: new Date(),
      filters: {
        panchayatId: panchayatId || '',
        panchayatName: panchayat?.name || 'All Panchayats',
        infrastructureType: infrastructureType || 'All',
        startDate: startDate || '',
        endDate: endDate || '',
        budget: filters.budget ?? 1000000,
        dateScope: 'Date range filters complaints, maintenance assignments, and saved routes. Infrastructure inventory, current priority scores, budget candidates, and spatial gaps describe the current dataset.'
      },
      analyzedCounts: {
        infrastructure: infrastructure.length,
        complaints: complaints.length,
        complaintsWithCoordinates: locatedComplaints.length,
        maintenanceAssignments: assignments.length,
        routes: routes.length
      },
      infrastructure: {
        total: infrastructure.length,
        byType: typeCounts,
        maintenanceNeeded,
        conditionDistribution: Object.entries(conditionCounts).map(([condition, count]) => ({ condition, count }))
      },
      priority: {
        averageScore: ranking.stats.averageScore,
        distribution: { Critical: ranking.stats.critical, High: ranking.stats.high, Medium: ranking.stats.medium, Low: ranking.stats.low },
        ranking: rankedItems.map((item) => ({ id: item.id, name: item.name, type: item.type, ward: item.ward, score: item.priorityScore, level: item.priorityLevel, condition: item.condition })),
        topCritical: topCritical.map((item) => ({ id: item.id, name: item.name, type: item.type, ward: item.ward, score: item.priorityScore, condition: item.condition, explanation: item.explanation?.summary || 'Score explanation unavailable.' }))
      },
      complaints: {
        total: complaints.length,
        open: openComplaints,
        closed: closedComplaints,
        withCoordinates: locatedComplaints.length,
        byCategory: Object.entries(categoryCounts).map(([category, count]) => ({ category, count })),
        byPriority: Object.entries(complaintPriorityCounts).map(([priority, count]) => ({ priority, count })),
        byStatus: Object.entries(complaintStatusCounts).map(([status, count]) => ({ status, count })),
        hotspots: hotspots.slice(0, 10)
      },
      maintenance,
      routes: routeSummary,
      gaps: gapSummary,
      budget: {
        ceiling: budget.budget,
        recommendedCost: budget.totalEstimatedCost,
        remainingBudget: budget.remainingBudget,
        utilizationPercent: budget.budgetUtilizationPercent,
        selectedCount: budget.selectedCount,
        candidatesAnalyzed: budget.candidateCount,
        excludedMissingCost: infrastructure.filter((asset) => !(asset.estimatedRepairCost > 0 || asset.estimatedMaintenanceCost > 0)).length,
        projects: budget.selectedProjects.slice(0, 10).map((project) => ({ name: project.name, type: project.type, ward: project.ward, score: project.priorityScore, priority: project.priorityLevel, estimatedCost: project.estimatedRepairCost, reason: project.selectionReason }))
      }
    };
  }
}
