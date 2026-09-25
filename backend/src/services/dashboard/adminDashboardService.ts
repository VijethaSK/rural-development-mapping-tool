import { Panchayat } from '../../models/Panchayat.js';
import { Infrastructure, Road, School, Healthcare, WaterFacility } from '../../models/Infrastructure.js';
import { Complaint } from '../../models/Complaint.js';
import { normalizeState } from '../complaints/complaintStateMachine.js';
import { Assignment } from '../../models/Assignment.js';
import { Route } from '../../models/Route.js';
import { PriorityScoringService } from '../priorityScoringService.js';
import { GapDetectionService } from '../spatial/gapDetectionService.js';
import { BudgetRecommendationService } from '../budget/budgetRecommendationService.js';
import {
  AdminDashboardData,
  OverviewMetrics,
  PriorityMetrics,
  MaintenanceMetrics,
  RoutesMetrics,
  GapMetrics,
  BudgetSummaryMetrics,
  AnalyticsMetrics,
  MapFeatureItem,
  ComplaintMapItem,
  PriorityDistributionItem
} from './types.js';

export class AdminDashboardService {
  /**
   * Consolidates all 8 decision-support modules into a single, high-performance payload.
   */
  public static async getDecisionSupportData(options?: {
    panchayatId?: string;
    budget?: number;
  }): Promise<AdminDashboardData> {
    const panchayatQuery = options?.panchayatId ? { _id: options.panchayatId } : {};
    const defaultPanchayat = await Panchayat.findOne(panchayatQuery).lean();
    const activePanchayatId = defaultPanchayat ? String(defaultPanchayat._id) : options?.panchayatId;

    const baseFilter = activePanchayatId ? { panchayatId: activePanchayatId } : {};

    // 1. OVERVIEW DATA
    const [
      totalInfrastructure,
      roadsCount,
      schoolsCount,
      healthcareCount,
      waterFacilityCount,
      openComplaints,
      activeMaintenanceTasks
    ] = await Promise.all([
      Infrastructure.countDocuments(baseFilter),
      Road.countDocuments(baseFilter),
      School.countDocuments(baseFilter),
      Healthcare.countDocuments(baseFilter),
      WaterFacility.countDocuments(baseFilter),
      Complaint.countDocuments({
        ...baseFilter,
        status: { $in: ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'New', 'Under Review', 'In Progress'] }
      }),
      Assignment.countDocuments({
        ...baseFilter,
        status: { $in: ['Assigned', 'In_Progress'] }
      })
    ]);

    const otherCount = Math.max(0, totalInfrastructure - (roadsCount + schoolsCount + healthcareCount + waterFacilityCount));

    const overview: OverviewMetrics = {
      totalInfrastructure,
      roadsCount,
      schoolsCount,
      healthcareCount,
      waterFacilityCount,
      otherCount,
      openComplaints,
      activeMaintenanceTasks,
      sourceInfrastructureCount: await Infrastructure.countDocuments({ ...baseFilter, dataOrigin: 'SOURCE_EXCEL' }),
      legacyInfrastructureCount: await Infrastructure.countDocuments({ ...baseFilter, $or: [{ dataOrigin: 'LEGACY_DEMO' }, { dataOrigin: { $exists: false } }] }),
      syntheticComplaintCount: await Complaint.countDocuments({ ...baseFilter, isSynthetic: true }),
      syntheticAssignmentCount: await Assignment.countDocuments({ ...baseFilter, isSynthetic: true }),
      syntheticRouteCount: await Route.countDocuments({ ...baseFilter, isSynthetic: true }),
      panchayatName: defaultPanchayat?.name || 'Gram Panchayat Administration',
      panchayatDistrict: defaultPanchayat?.district || 'Rural Karnataka'
    };

    // 2. PRIORITY INTELLIGENCE
    const rankedData = await PriorityScoringService.getRanked({
      panchayatId: activePanchayatId,
      limit: 10
    });

    const totalPriorityAssets = Math.max(1, rankedData.stats.total);
    const priorityDistribution: PriorityDistributionItem[] = [
      {
        level: 'Critical',
        count: rankedData.stats.critical,
        percentage: Number(((rankedData.stats.critical / totalPriorityAssets) * 100).toFixed(1)),
        color: '#dc2626'
      },
      {
        level: 'High',
        count: rankedData.stats.high,
        percentage: Number(((rankedData.stats.high / totalPriorityAssets) * 100).toFixed(1)),
        color: '#ea580c'
      },
      {
        level: 'Medium',
        count: rankedData.stats.medium,
        percentage: Number(((rankedData.stats.medium / totalPriorityAssets) * 100).toFixed(1)),
        color: '#2563eb'
      },
      {
        level: 'Low',
        count: rankedData.stats.low,
        percentage: Number(((rankedData.stats.low / totalPriorityAssets) * 100).toFixed(1)),
        color: '#64748b'
      }
    ];

    const priority: PriorityMetrics = {
      criticalCount: rankedData.stats.critical,
      highCount: rankedData.stats.high,
      mediumCount: rankedData.stats.medium,
      lowCount: rankedData.stats.low,
      averageScore: rankedData.stats.averageScore,
      distribution: priorityDistribution,
      top10Attention: rankedData.items.filter((item) => item.scoringStatus === 'SCORED').slice(0, 10)
    };

    // 3. MAINTENANCE MANAGEMENT
    const now = new Date();
    const rawAssignments = await Assignment.find(baseFilter)
      .populate('infrastructureId', 'name type ward')
      .populate('assignedMember', 'name phone designation')
      .sort({ updatedAt: -1 })
      .limit(15)
      .lean();

    const pendingAssignments = await Assignment.countDocuments({ ...baseFilter, status: 'Assigned' });
    const inProgressWork = await Assignment.countDocuments({ ...baseFilter, status: 'In_Progress' });
    const completedAwaitingVerification = await Assignment.countDocuments({ ...baseFilter, status: 'Completed' });
    const overdueWork = await Assignment.countDocuments({
      ...baseFilter,
      status: { $in: ['Assigned', 'In_Progress'] },
      $or: [
        { targetCompletionDate: { $lt: now } },
        { targetCompletionDate: { $exists: false }, scheduledDate: { $lt: new Date(Date.now() - 7 * 86400000) } }
      ]
    });

    const recentAssignments = rawAssignments.map((a: any) => {
      const isOverdue =
        (a.status === 'Assigned' || a.status === 'In_Progress') &&
        ((a.targetCompletionDate && new Date(a.targetCompletionDate) < now) ||
          (!a.targetCompletionDate && new Date(a.scheduledDate).getTime() < Date.now() - 7 * 86400000));

      return {
        id: String(a._id),
        assignmentNumber: a.assignmentNumber || `ASG-${String(a._id).slice(-4)}`,
        title: a.title,
        description: a.description,
        infrastructureId: a.infrastructureId ? String(a.infrastructureId._id) : undefined,
        infrastructureName: a.infrastructureId?.name || 'Unspecified Asset',
        assignedMemberName: a.assignedMember?.name || 'Unassigned Worker',
        priority: a.priority || 'Medium',
        status: a.status,
        scheduledDate: a.scheduledDate,
        targetCompletionDate: a.targetCompletionDate,
        isOverdue: Boolean(isOverdue),
        allocatedBudget: a.allocatedBudget || 0,
        actualCost: a.actualCost || 0,
        completionNotes: a.completionNotes,
        completedAt: a.completedAt,
        verifiedAt: a.verifiedAt
      };
    });

    const maintenance: MaintenanceMetrics = {
      pendingAssignments,
      inProgressWork,
      completedAwaitingVerification,
      overdueWork,
      totalAssignments: rawAssignments.length,
      recentAssignments
    };

    // 4. ROUTE OPTIMIZATION
    const rawRoutes = await Route.find(baseFilter)
      .populate('assignedMember', 'name')
      .sort({ generatedAt: -1 })
      .limit(6)
      .lean();

    const activeRoutesCount = await Route.countDocuments({
      ...baseFilter,
      status: { $in: ['Planned', 'In_Progress'] }
    });

    let totalRouteDistanceKm = 0;
    let totalRouteStops = 0;

    const plannedRoutes = rawRoutes.map((r: any) => {
      const dist = r.totalDistanceKm || (r.totalDistance ? Number((r.totalDistance / 1000).toFixed(2)) : 0);
      const stopsCount = r.orderedStops?.length || r.destinations?.length || 0;
      totalRouteDistanceKm += dist;
      totalRouteStops += stopsCount;

      return {
        id: String(r._id),
        name: r.name,
        assignedMemberName: r.assignedMember?.name || 'Maintenance Crew',
        stopsCount,
        totalDistanceKm: dist,
        estimatedDurationMinutes: r.estimatedDuration || Math.round(dist * 6),
        status: r.status,
        generatedAt: r.generatedAt || r.createdAt,
        stops: (r.orderedStops || []).map((s: any) => ({
          stopOrder: s.stopOrder,
          name: s.name,
          priorityScore: s.priorityScore || 0
        }))
      };
    });

    const routes: RoutesMetrics = {
      activeRoutesCount,
      totalDistanceKm: Number(totalRouteDistanceKm.toFixed(1)),
      totalStops: totalRouteStops,
      plannedRoutes
    };

    // 5. GAP DETECTION & SPATIAL ANALYSIS
    let gapAnalysis: GapMetrics;
    try {
      const gapResult = await GapDetectionService.calculateAccessibility({
        panchayatId: activePanchayatId,
        schoolThresholdKm: 3.0,
        roadThresholdKm: 1.0,
        gridResolutionKm: 1.0
      });

      const topGaps = (gapResult.underservedAreas || [])
        .filter((h: any) => h.overallSeverity !== 'Served')
        .slice(0, 8)
        .map((h: any) => ({
          name: h.name,
          ward: h.ward,
          distanceToNearestSchoolKm: h.nearestSchool?.geographicDistanceKm
            ? Number(h.nearestSchool.geographicDistanceKm.toFixed(2))
            : 0,
          distanceToNearestRoadKm: h.nearestRoad?.geographicDistanceKm
            ? Number(h.nearestRoad.geographicDistanceKm.toFixed(2))
            : 0,
          severity: h.overallSeverity,
          affectedPopulation: h.populationAffected || 0,
          issues: [h.notes || h.primaryIssue]
        }));

      const criticalGapsCount = (gapResult.underservedAreas || []).filter(
        (h: any) => h.overallSeverity === 'Critical'
      ).length;
      const highGapsCount = (gapResult.underservedAreas || []).filter(
        (h: any) => h.overallSeverity === 'High'
      ).length;

      gapAnalysis = {
        underservedHabitationsCount: gapResult.metrics.underservedAreasCount,
        totalHabitationsCount: gapResult.metrics.totalHabitations,
        affectedPopulation: gapResult.metrics.populationAffected,
        totalPopulation: gapResult.metrics.totalPopulation,
        schoolCoveragePercent: Math.max(0, 100 - gapResult.metrics.percentagePopulationAffected),
        criticalGapsCount,
        highGapsCount,
        topGaps
      };
    } catch (err) {
      gapAnalysis = {
        underservedHabitationsCount: 0,
        totalHabitationsCount: 0,
        affectedPopulation: 0,
        totalPopulation: 0,
        schoolCoveragePercent: 100,
        criticalGapsCount: 0,
        highGapsCount: 0,
        topGaps: []
      };
    }

    // 6. BUDGET-BASED RECOMMENDATIONS
    const targetBudget = options?.budget || 1000000; // Default ₹10,00,000 (10 Lakhs)
    const budgetOverview = await BudgetRecommendationService.getBudgetOverview(activePanchayatId);
    const budgetRec = await BudgetRecommendationService.recommendProjects({
      budget: targetBudget,
      panchayatId: activePanchayatId,
      strategy: 'greedy'
    });

    const budget: BudgetSummaryMetrics = {
      budget: targetBudget,
      totalBacklogCost: budgetOverview.totalBacklogCost,
      criticalBacklogCost: budgetOverview.criticalBacklogCost,
      allocatedCost: budgetRec.totalEstimatedCost,
      remainingBuffer: budgetRec.remainingBudget,
      budgetUtilizationPercent: budgetRec.budgetUtilizationPercent,
      selectedProjectsCount: budgetRec.selectedCount,
      populationBenefited: budgetRec.totalPopulationBenefited,
      complaintsResolved: budgetRec.totalComplaintsResolved,
      recommendedProjects: budgetRec.selectedProjects.slice(0, 8)
    };

    // 7. ANALYTICS & TRENDS
    const [allInfrastructure, allComplaints] = await Promise.all([
      Infrastructure.find(baseFilter).select('condition status type name ward location lineGeometry priorityScore estimatedRepairCost estimatedMaintenanceCost complaintsCount').lean(),
      Complaint.find(baseFilter).select('category status priority title location upvotesCount createdAt').lean()
    ]);

    // Condition Distribution
    const conditionMap: Record<string, number> = { Good: 0, Average: 0, Bad: 0 };
    for (const item of allInfrastructure) {
      const cond = (item.condition || 'Average') as 'Good' | 'Average' | 'Bad';
      if (conditionMap[cond] !== undefined) {
        conditionMap[cond]++;
      } else {
        conditionMap['Average']++;
      }
    }

    const totalCond = Math.max(1, allInfrastructure.length);
    const conditionDistribution = Object.entries(conditionMap).map(([condition, count]) => ({
      condition,
      count,
      percentage: Number(((count / totalCond) * 100).toFixed(1))
    }));

    // Complaints by Category
    const categoryMap: Record<string, number> = {};
    const statusMap: Record<string, number> = {};

    for (const c of allComplaints) {
      const cat = c.category || 'Other';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;

      let st = 'SUBMITTED';
      try { st = normalizeState(String(c.status || 'SUBMITTED')); } catch { st = 'UNKNOWN'; }
      statusMap[st] = (statusMap[st] || 0) + 1;
    }

    const complaintsByCategory = Object.entries(categoryMap).map(([category, count]) => ({ category, count }));
    const complaintsByStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

    // Monthly complaint trend (grouping past 6 months)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyCounts: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${monthNames[d.getMonth()]}`;
      monthlyCounts[key] = 0;
    }

    for (const c of allComplaints) {
      if (c.createdAt) {
        const d = new Date(c.createdAt);
        const key = monthNames[d.getMonth()];
        if (monthlyCounts[key] !== undefined) {
          monthlyCounts[key]++;
        }
      }
    }

    const monthlyComplaintTrends = Object.entries(monthlyCounts).map(([month, count]) => ({ month, count }));

    // Completion rate
    const totalComplaintsCount = Math.max(1, allComplaints.length);
    const resolvedCount = (statusMap['VERIFIED'] || 0) + (statusMap['CLOSED'] || 0);
    const completionRatePercent = Number(((resolvedCount / totalComplaintsCount) * 100).toFixed(1));

    const analytics: AnalyticsMetrics = {
      conditionDistribution,
      complaintsByCategory,
      complaintsByStatus,
      monthlyComplaintTrends,
      completionRatePercent
    };

    // 8. MAP FEATURE DATA
    const mapInfrastructure: MapFeatureItem[] = allInfrastructure
      .filter((item: any) => item.priorityScorable !== false && (item.location?.coordinates || item.lineGeometry?.coordinates))
      .map((item: any) => {
        let pScore = item.priorityScore || 50;
        let pLevel = (
          pScore >= 80 ? 'Critical' : pScore >= 60 ? 'High' : pScore >= 40 ? 'Medium' : 'Low'
        ) as any;

        return {
          id: String(item._id),
          name: item.name,
          type: item.type,
          ward: item.ward || 'Panchayat Zone',
          location: item.location,
          lineGeometry: item.lineGeometry,
          condition: item.condition || 'Average',
          priorityScore: pScore,
          priorityLevel: pLevel,
          complaintsCount: item.complaintsCount || 0,
          estimatedCost: item.estimatedRepairCost || item.estimatedMaintenanceCost || 50000
        };
      });

    const mapComplaints: ComplaintMapItem[] = allComplaints
      .filter((c: any) => c.location?.coordinates && !isNaN(c.location.coordinates[0]) && !isNaN(c.location.coordinates[1]))
      .map((c: any) => ({
        id: String(c._id),
        title: c.title,
        category: c.category || 'General',
        priority: c.priority || 'Medium',
        status: c.status || 'SUBMITTED',
        location: c.location,
        upvotesCount: c.upvotesCount || 0
      }));

    return {
      overview,
      priority,
      maintenance,
      routes,
      gapAnalysis,
      budget,
      analytics,
      mapData: {
        infrastructure: mapInfrastructure,
        complaints: mapComplaints
      },
      generatedAt: new Date()
    };
  }
}
