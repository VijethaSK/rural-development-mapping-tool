import { Infrastructure, Road } from '../../models/Infrastructure.js';
import { PriorityScoringService, PriorityLevel } from '../priorityScoringService.js';
import {
  BudgetRecommendationOptions,
  BudgetRecommendationResult,
  RecommendedProject,
  UnselectedProject,
  CategoryExpenditure,
  KnapsackComparison
} from './types.js';

interface EvaluatedCandidate {
  infrastructureId: string;
  name: string;
  type: string;
  ward: string;
  village?: string;
  location?: any;
  lineGeometry?: any;
  condition: string;
  status: string;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  estimatedRepairCost: number;
  populationServed: number;
  complaintsCount: number;
  trafficLevel?: string;
  impactScore: number;
  valuePerRupee: number;
  valuePerLakh: number;
}

export class BudgetRecommendationService {
  /**
   * Resolves the realistic repair / maintenance cost for an infrastructure asset.
   * Ensures cost is strictly positive to prevent division by zero in benefit-cost calculations.
   */
  public static resolveEstimatedCost(asset: any): number {
    const rawCost =
      asset.estimatedRepairCost != null && asset.estimatedRepairCost > 0
        ? asset.estimatedRepairCost
        : asset.estimatedMaintenanceCost != null && asset.estimatedMaintenanceCost > 0
        ? asset.estimatedMaintenanceCost
        : 0;

    if (rawCost > 0) return rawCost;

    // Pragmatic baseline cost estimates based on infrastructure classification if unrecorded
    switch (asset.type) {
      case 'Road':
        return 200000; // ₹2.0 Lakhs default road patch/asphalt maintenance
      case 'School':
        return 150000; // ₹1.5 Lakhs default classroom/sanitation overhaul
      case 'Healthcare':
        return 120000; // ₹1.2 Lakhs default facility equipment maintenance
      case 'WaterFacility':
        return 75000;  // ₹75,000 default pump/pipeline repair
      default:
        return 50000;  // ₹50,000 default
    }
  }

  /**
   * Calculates the composite Social Impact Score.
   * Combines Technical Priority Score with demographic urgency factors (population, complaints, structural distress).
   */
  public static calculateImpactScore(
    priorityScore: number,
    populationServed: number,
    complaintsCount: number,
    condition: string
  ): number {
    const pop = Math.max(0, populationServed || 0);
    const complaints = Math.max(0, complaintsCount || 0);
    const cond = (condition || '').toLowerCase().trim();

    // 1. Population impact multiplier (Up to +35% bonus for high population reach, capped at 5000)
    const popMultiplier = 1 + 0.35 * (Math.min(pop, 5000) / 5000);

    // 2. Citizen complaint multiplier (Up to +25% bonus for high citizen dissatisfaction, capped at 10)
    const complaintMultiplier = 1 + 0.25 * (Math.min(complaints, 10) / 10);

    // 3. Physical distress condition multiplier
    let conditionMultiplier = 1.0;
    if (cond === 'bad' || cond === 'poor' || cond === 'needs_maintenance') {
      conditionMultiplier = 1.20;
    } else if (cond === 'average' || cond === 'fair' || cond === 'under_repair') {
      conditionMultiplier = 1.05;
    }

    const rawImpact = priorityScore * popMultiplier * complaintMultiplier * conditionMultiplier;
    return Number(rawImpact.toFixed(2));
  }

  /**
   * Evaluates and enriches all database infrastructure assets into scored candidates.
   */
  public static async evaluateCandidates(options: {
    panchayatId?: string;
    type?: string;
    ward?: string;
    minPriorityScore?: number;
    useRecordedCostsOnly?: boolean;
  }): Promise<EvaluatedCandidate[]> {
    const query: any = {};
    if (options.panchayatId) query.panchayatId = options.panchayatId;
    if (options.type && options.type !== 'All') query.type = options.type;
    if (options.ward && options.ward !== 'All') query.ward = options.ward;

    const assets = await Infrastructure.find(query).lean();
    const config = await PriorityScoringService.getActiveConfig();

    const candidates: EvaluatedCandidate[] = [];

    for (const asset of assets as any[]) {
      if (asset.dataOrigin === 'SOURCE_EXCEL' && asset.priorityScorable !== true) continue;
      if (options.useRecordedCostsOnly && !(asset.estimatedRepairCost > 0 || asset.estimatedMaintenanceCost > 0)) {
        continue;
      }
      const scoring = PriorityScoringService.calculate(asset, config);
      const priorityScore = scoring.priorityScore;
      const priorityLevel = scoring.priorityLevel;

      // Filter by min priority score if requested
      if (options.minPriorityScore != null && priorityScore < options.minPriorityScore) {
        continue;
      }

      const cost = this.resolveEstimatedCost(asset);
      const pop = asset.populationServed || 0;
      const complaints = asset.complaintsCount || 0;
      const impactScore = this.calculateImpactScore(priorityScore, pop, complaints, asset.condition);

      const valuePerRupee = impactScore / cost;
      const valuePerLakh = Number((valuePerRupee * 100000).toFixed(2));

      candidates.push({
        infrastructureId: String(asset._id),
        name: asset.name,
        type: asset.type,
        ward: asset.ward,
        village: asset.village,
        location: asset.location,
        lineGeometry: asset.lineGeometry,
        condition: asset.condition || 'Average',
        status: asset.status || 'Operational',
        priorityScore,
        priorityLevel,
        estimatedRepairCost: cost,
        populationServed: pop,
        complaintsCount: complaints,
        trafficLevel: asset.trafficLevel,
        impactScore,
        valuePerRupee,
        valuePerLakh
      });
    }

    return candidates;
  }

  /**
   * Generates a descriptive, auditable rationale for why an infrastructure project was selected.
   */
  public static generateSelectionReason(
    candidate: EvaluatedCandidate,
    allocatedCost: number,
    totalBudget: number
  ): string {
    const budgetPct = totalBudget > 0 ? ((candidate.estimatedRepairCost / totalBudget) * 100).toFixed(1) : '0';
    return (
      `Recommended for high cost-efficiency (${candidate.valuePerLakh} impact/₹1L) and ${candidate.priorityLevel} priority ` +
      `(${candidate.priorityScore}/100). Direct benefit to ${candidate.populationServed.toLocaleString()} residents ` +
      `with ${candidate.complaintsCount} active complaints, consuming ${budgetPct}% (₹${candidate.estimatedRepairCost.toLocaleString('en-IN')}) of total budget.`
    );
  }

  /**
   * Generates an explicit explanation for why an infrastructure project was not selected.
   */
  public static generateRejectionReason(
    candidate: EvaluatedCandidate,
    remainingBudget: number,
    totalBudget: number,
    wasAffordableAtStart: boolean
  ): { reason: string; costDeficit: number } {
    if (candidate.estimatedRepairCost > totalBudget) {
      const deficit = candidate.estimatedRepairCost - totalBudget;
      return {
        reason: `Exceeds total project budget cap (requires ₹${candidate.estimatedRepairCost.toLocaleString('en-IN')}, budget is ₹${totalBudget.toLocaleString('en-IN')}). Consider multi-phase or special grant funding.`,
        costDeficit: deficit
      };
    }

    if (candidate.estimatedRepairCost > remainingBudget) {
      const deficit = candidate.estimatedRepairCost - remainingBudget;
      return {
        reason: `Exceeds remaining available budget buffer (requires ₹${candidate.estimatedRepairCost.toLocaleString('en-IN')}, buffer remaining ₹${remainingBudget.toLocaleString('en-IN')}, deficit: ₹${deficit.toLocaleString('en-IN')}). Deferred to subsequent fiscal phase.`,
        costDeficit: deficit
      };
    }

    return {
      reason: `Lower benefit-cost efficiency (${candidate.valuePerLakh} impact/₹1L) compared to higher-ranked priority assets. Budget was allocated to higher-yield projects.`,
      costDeficit: 0
    };
  }

  /**
   * Solves the 0/1 Knapsack Dynamic Programming Problem for benchmarking.
   * Maximizes total impact score within given budget capacity.
   */
  public static solveKnapsack(
    candidates: EvaluatedCandidate[],
    budget: number
  ): { selectedIds: Set<string>; totalCost: number; totalImpact: number } {
    if (budget <= 0 || candidates.length === 0) {
      return { selectedIds: new Set<string>(), totalCost: 0, totalImpact: 0 };
    }

    // Step size discretization for DP table efficiency (e.g. ₹5,000 steps, max 1000 columns)
    const stepSize = Math.max(1000, Math.floor(budget / 1000));
    const capacityUnits = Math.floor(budget / stepSize);

    const n = candidates.length;
    // DP array dp[w] = max impact for capacity w
    // We keep track of which items were included using a bitset or 2D table
    // Since n is typically 10-100 in a Panchayat, a 2D table of size (n+1) x (capacityUnits+1) is fast (<1MB)
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(capacityUnits + 1).fill(0));

    for (let i = 1; i <= n; i++) {
      const item = candidates[i - 1];
      const itemCostUnits = Math.ceil(item.estimatedRepairCost / stepSize);
      const itemValue = item.impactScore;

      for (let w = 0; w <= capacityUnits; w++) {
        if (itemCostUnits <= w) {
          const withItem = dp[i - 1][w - itemCostUnits] + itemValue;
          const withoutItem = dp[i - 1][w];
          dp[i][w] = withItem > withoutItem ? withItem : withoutItem;
        } else {
          dp[i][w] = dp[i - 1][w];
        }
      }
    }

    // Backtrack to identify selected items
    const selectedIds = new Set<string>();
    let currentW = capacityUnits;
    let totalCost = 0;
    let totalImpact = 0;

    for (let i = n; i > 0; i--) {
      if (dp[i][currentW] !== dp[i - 1][currentW]) {
        const item = candidates[i - 1];
        selectedIds.add(item.infrastructureId);
        totalCost += item.estimatedRepairCost;
        totalImpact += item.impactScore;
        const itemCostUnits = Math.ceil(item.estimatedRepairCost / stepSize);
        currentW -= itemCostUnits;
      }
    }

    return {
      selectedIds,
      totalCost,
      totalImpact: Number(totalImpact.toFixed(2))
    };
  }

  /**
   * Main recommendation pipeline:
   * Generates budget-constrained recommendations with transparent rationale and comparison benchmarks.
   */
  public static async recommendProjects(
    options: BudgetRecommendationOptions
  ): Promise<BudgetRecommendationResult> {
    const budget = Math.max(0, options.budget || 0);
    const strategy = options.strategy || 'greedy';

    // 1. Gather and score all eligible infrastructure candidates
    const candidates = await this.evaluateCandidates({
      panchayatId: options.panchayatId,
      type: options.type,
      ward: options.ward,
      minPriorityScore: options.minPriorityScore,
      useRecordedCostsOnly: options.useRecordedCostsOnly
    });

    // 2. Run Budget-Constrained Greedy Selection
    // Sort descending by valuePerRupee (benefit-cost ratio); secondary tie-breaker by raw priorityScore
    const greedySorted = [...candidates].sort((a, b) => {
      if (b.valuePerRupee !== a.valuePerRupee) {
        return b.valuePerRupee - a.valuePerRupee;
      }
      return b.priorityScore - a.priorityScore;
    });

    let greedyRemainingBudget = budget;
    const greedySelected: RecommendedProject[] = [];
    const greedyUnselected: UnselectedProject[] = [];

    let rank = 1;
    for (const candidate of greedySorted) {
      if (candidate.estimatedRepairCost <= greedyRemainingBudget) {
        greedyRemainingBudget -= candidate.estimatedRepairCost;
        const costSharePercent = budget > 0 ? Number(((candidate.estimatedRepairCost / budget) * 100).toFixed(2)) : 0;

        greedySelected.push({
          ...candidate,
          rank: rank++,
          selectionReason: this.generateSelectionReason(candidate, candidate.estimatedRepairCost, budget),
          costSharePercent
        });
      } else {
        const wasAffordableAtStart = candidate.estimatedRepairCost <= budget;
        const { reason, costDeficit } = this.generateRejectionReason(
          candidate,
          greedyRemainingBudget,
          budget,
          wasAffordableAtStart
        );

        greedyUnselected.push({
          ...candidate,
          rejectionReason: reason,
          costDeficit
        });
      }
    }

    // 3. Run Knapsack Dynamic Programming Benchmark
    const knapsackResult = this.solveKnapsack(candidates, budget);

    // Compute Knapsack comparison metrics
    const greedyTotalCost = greedySelected.reduce((sum, item) => sum + item.estimatedRepairCost, 0);
    const greedyTotalImpact = Number(
      greedySelected.reduce((sum, item) => sum + item.impactScore, 0).toFixed(2)
    );

    const identicalSelectionsCount = greedySelected.filter((item) =>
      knapsackResult.selectedIds.has(item.infrastructureId)
    ).length;

    const impactRatioPercent =
      knapsackResult.totalImpact > 0
        ? Number(((greedyTotalImpact / knapsackResult.totalImpact) * 100).toFixed(1))
        : 100;

    const comparison: KnapsackComparison = {
      knapsackTotalCost: knapsackResult.totalCost,
      knapsackRemainingBudget: Math.max(0, budget - knapsackResult.totalCost),
      knapsackTotalImpact: knapsackResult.totalImpact,
      knapsackProjectCount: knapsackResult.selectedIds.size,
      greedyTotalCost,
      greedyRemainingBudget,
      greedyTotalImpact,
      greedyProjectCount: greedySelected.length,
      impactRatioPercent,
      identicalSelectionsCount,
      explanation:
        `The Cost-Efficiency Greedy heuristic captures ${impactRatioPercent}% of theoretical 0/1 Knapsack optimal ` +
        `impact while providing sequential, auditable decision justification and prioritizing urgent community complaints.`
    };

    // 4. Finalize Selected / Unselected lists based on chosen strategy
    let finalSelected: RecommendedProject[] = greedySelected;
    let finalUnselected: UnselectedProject[] = greedyUnselected;
    let finalTotalCost = greedyTotalCost;
    let finalRemainingBudget = greedyRemainingBudget;

    if (strategy === 'knapsack') {
      // Re-map candidates based on Knapsack DP selections
      const knapsackSelectedItems: RecommendedProject[] = [];
      const knapsackUnselectedItems: UnselectedProject[] = [];
      let knapsackRank = 1;

      for (const candidate of candidates) {
        if (knapsackResult.selectedIds.has(candidate.infrastructureId)) {
          const costSharePercent = budget > 0 ? Number(((candidate.estimatedRepairCost / budget) * 100).toFixed(2)) : 0;
          knapsackSelectedItems.push({
            ...candidate,
            rank: knapsackRank++,
            selectionReason:
              `Selected via 0/1 Knapsack Dynamic Programming optimization maximizing total systemic impact ` +
              `(${candidate.impactScore} impact, ₹${candidate.estimatedRepairCost.toLocaleString('en-IN')}).`,
            costSharePercent
          });
        } else {
          knapsackUnselectedItems.push({
            ...candidate,
            rejectionReason:
              `Not included in the optimal 0/1 Knapsack subset for the specified ₹${budget.toLocaleString('en-IN')} ceiling.`,
            costDeficit: Math.max(0, candidate.estimatedRepairCost - (budget - knapsackResult.totalCost))
          });
        }
      }

      // Sort selected by impact descending
      knapsackSelectedItems.sort((a, b) => b.impactScore - a.impactScore);
      finalSelected = knapsackSelectedItems;
      finalUnselected = knapsackUnselectedItems;
      finalTotalCost = knapsackResult.totalCost;
      finalRemainingBudget = Math.max(0, budget - knapsackResult.totalCost);
    }

    // 5. Aggregate category expenditures
    const categoryMap = new Map<string, { count: number; totalCost: number }>();
    for (const item of finalSelected) {
      const entry = categoryMap.get(item.type) || { count: 0, totalCost: 0 };
      entry.count += 1;
      entry.totalCost += item.estimatedRepairCost;
      categoryMap.set(item.type, entry);
    }

    const categoryBreakdown: CategoryExpenditure[] = Array.from(categoryMap.entries()).map(([type, data]) => ({
      type,
      count: data.count,
      totalCost: data.totalCost,
      percentageOfAllocated: finalTotalCost > 0 ? Number(((data.totalCost / finalTotalCost) * 100).toFixed(1)) : 0
    }));

    // 6. Aggregate summary KPIs
    const totalPriorityScore = Number(
      finalSelected.reduce((sum, item) => sum + item.priorityScore, 0).toFixed(2)
    );
    const totalImpactScore = Number(
      finalSelected.reduce((sum, item) => sum + item.impactScore, 0).toFixed(2)
    );
    const totalPopulationBenefited = finalSelected.reduce((sum, item) => sum + item.populationServed, 0);
    const totalComplaintsResolved = finalSelected.reduce((sum, item) => sum + item.complaintsCount, 0);
    const budgetUtilizationPercent =
      budget > 0 ? Number(((finalTotalCost / budget) * 100).toFixed(2)) : 0;

    return {
      budget,
      selectedProjects: finalSelected,
      unselectedProjects: finalUnselected,
      totalEstimatedCost: finalTotalCost,
      remainingBudget: finalRemainingBudget,
      budgetUtilizationPercent,
      totalPriorityScore,
      totalImpactScore,
      totalPopulationBenefited,
      totalComplaintsResolved,
      candidateCount: candidates.length,
      selectedCount: finalSelected.length,
      strategy,
      categoryBreakdown,
      comparison,
      methodology: {
        description:
          'Transparent, multi-criteria decision support model balancing structural priority score, population served, citizen complaints, and cost-efficiency.',
        formulaImpact:
          'ImpactScore = PriorityScore × (1 + 0.35 × min(Pop, 5000)/5000) × (1 + 0.25 × min(Complaints, 10)/10) × ConditionMultiplier',
        formulaValuePerRupee:
          'ValuePerRupee = ImpactScore / EstimatedRepairCost (Expressed as Impact units per ₹1,00,000 invested)',
        optimizationStrategy:
          'Budget-Constrained Greedy Heuristic (O(N log N)) with 0/1 Knapsack Dynamic Programming comparative benchmark.',
        disclaimer:
          'This system operates as a decision-support recommendation framework for Panchayat administration. Executive discretion, statutory allocations, and emergency contingencies should accompany final budget approvals.'
      },
      generatedAt: new Date()
    };
  }

  /**
   * Quick summary overview of total infrastructure repair backlog vs available budget presets.
   */
  public static async getBudgetOverview(panchayatId?: string): Promise<{
    totalInfrastructureCount: number;
    totalBacklogCost: number;
    criticalBacklogCost: number;
    highBacklogCost: number;
    recommendedPresets: number[];
  }> {
    const candidates = await this.evaluateCandidates({ panchayatId });
    const totalBacklogCost = candidates.reduce((sum, c) => sum + c.estimatedRepairCost, 0);
    const criticalBacklogCost = candidates
      .filter((c) => c.priorityLevel === 'Critical')
      .reduce((sum, c) => sum + c.estimatedRepairCost, 0);
    const highBacklogCost = candidates
      .filter((c) => c.priorityLevel === 'High')
      .reduce((sum, c) => sum + c.estimatedRepairCost, 0);

    return {
      totalInfrastructureCount: candidates.length,
      totalBacklogCost,
      criticalBacklogCost,
      highBacklogCost,
      recommendedPresets: [500000, 1000000, 2500000, 5000000, 10000000] // 5L, 10L, 25L, 50L, 1 Cr
    };
  }
}
