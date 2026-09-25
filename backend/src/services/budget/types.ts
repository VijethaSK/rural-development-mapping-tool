import { PriorityLevel } from '../priorityScoringService.js';

export interface BudgetRecommendationOptions {
  budget: number; // In Rupees (INR), e.g. 1000000 (10 Lakhs)
  panchayatId?: string;
  type?: string; // 'All' | 'Road' | 'School' | 'Healthcare' | 'WaterFacility'
  ward?: string;
  minPriorityScore?: number; // Filter candidates with score >= minPriorityScore
  strategy?: 'greedy' | 'knapsack' | 'comparison';
  useRecordedCostsOnly?: boolean;
}

export interface RecommendedProject {
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
  valuePerLakh: number; // Value per ₹1,00,000 for human readability
  rank: number;
  selectionReason: string;
  costSharePercent: number; // Percentage of the total budget this project consumes
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
  costDeficit?: number; // How much budget shortfall prevented this item from being funded
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
  impactRatioPercent: number; // (greedyImpact / knapsackImpact) * 100
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
  generatedAt: Date;
}
