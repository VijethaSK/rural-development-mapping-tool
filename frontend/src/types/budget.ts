export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export interface RecommendedProject {
  infrastructureId: string;
  name: string;
  type: string;
  ward: string;
  village?: string;
  location?: {
    type?: string;
    coordinates?: [number, number];
    lat?: number;
    lng?: number;
  };
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
  rank: number;
  selectionReason: string;
  costSharePercent: number;
}

export interface UnselectedProject {
  infrastructureId: string;
  name: string;
  type: string;
  ward: string;
  village?: string;
  condition: string;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  estimatedRepairCost: number;
  populationServed: number;
  complaintsCount: number;
  impactScore: number;
  valuePerRupee: number;
  valuePerLakh: number;
  rejectionReason: string;
  costDeficit?: number;
}

export interface CategoryExpenditure {
  type: string;
  count: number;
  totalCost: number;
  percentageOfAllocated: number;
}

export interface KnapsackComparison {
  knapsackTotalCost: number;
  knapsackRemainingBudget: number;
  knapsackTotalImpact: number;
  knapsackProjectCount: number;
  greedyTotalCost: number;
  greedyRemainingBudget: number;
  greedyTotalImpact: number;
  greedyProjectCount: number;
  impactRatioPercent: number;
  identicalSelectionsCount: number;
  explanation: string;
}

export interface BudgetRecommendationResult {
  budget: number;
  selectedProjects: RecommendedProject[];
  unselectedProjects: UnselectedProject[];
  totalEstimatedCost: number;
  remainingBudget: number;
  budgetUtilizationPercent: number;
  totalPriorityScore: number;
  totalImpactScore: number;
  totalPopulationBenefited: number;
  totalComplaintsResolved: number;
  candidateCount: number;
  selectedCount: number;
  strategy: 'greedy' | 'knapsack' | 'comparison';
  categoryBreakdown: CategoryExpenditure[];
  comparison?: KnapsackComparison;
  methodology: {
    description: string;
    formulaImpact: string;
    formulaValuePerRupee: string;
    optimizationStrategy: string;
    disclaimer: string;
  };
  generatedAt: string;
}

export interface BudgetOverview {
  totalInfrastructureCount: number;
  totalBacklogCost: number;
  criticalBacklogCost: number;
  highBacklogCost: number;
  recommendedPresets: number[];
}
