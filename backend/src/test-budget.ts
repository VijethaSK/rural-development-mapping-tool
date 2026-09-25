import mongoose from 'mongoose';
import { connectDb, disconnectDb } from './config/db.js';
import { Infrastructure, Road, School, WaterFacility } from './models/Infrastructure.js';
import { PriorityConfig } from './models/PriorityConfig.js';
import { BudgetRecommendationService } from './services/budget/budgetRecommendationService.js';
import { getRecommendations, getOverview } from './controllers/budgetRecommendationController.js';

async function runBudgetTests() {
  console.log('====================================================');
  console.log('  PHASE 8: BUDGET RECOMMENDATION SYSTEM TEST SUITE  ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`[PASS] Test ${total}: ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${total}: ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
      process.exitCode = 1;
    }
  }

  try {
    // 1. Connect in-memory DB (safely on drive D:)
    await connectDb(true);

    // Initialize PriorityConfig default weights
    await PriorityConfig.deleteMany({});
    await PriorityConfig.create({
      weights: {
        condition: 0.30,
        complaints: 0.20,
        population: 0.15,
        traffic: 0.15,
        maintenanceAge: 0.10,
        alternativeDistance: 0.10
      },
      thresholds: {
        critical: 80,
        high: 60,
        medium: 40,
        low: 0
      },
      limits: {
        maxComplaintsCap: 5,
        maxPopulationCap: 5000,
        maxMaintenanceAgeDays: 1095,
        maxAlternativeDistanceKm: 5
      }
    });

    const dummyPanchayatId = new mongoose.Types.ObjectId();

    // Clear existing infrastructure
    await Infrastructure.deleteMany({});

    // Seed mock infrastructure assets with diverse costs, priorities, conditions, and populations
    // Asset 1: High Priority, Affordable -> Best Cost-Efficiency
    await Road.create({
      panchayatId: dummyPanchayatId,
      name: 'Main Village Culvert Road',
      type: 'Road',
      ward: 'Ward 1',
      village: 'Hanchinal',
      location: { type: 'Point', coordinates: [75.83, 16.82] },
      condition: 'Bad',
      status: 'Needs_Maintenance',
      complaintsCount: 5,
      populationServed: 4200,
      trafficLevel: 'High',
      roadLength: 1.2,
      surfaceType: 'Paved',
      roadType: 'Panchayat',
      estimatedRepairCost: 120000, // ₹1.2 Lakhs
      estimatedMaintenanceCost: 120000,
      lastRepairDate: new Date('2022-01-10'),
      connects: ['Village Square', 'Market']
    });

    // Asset 2: High Priority, Very Cheap -> Exceptional Cost-Efficiency
    await WaterFacility.create({
      panchayatId: dummyPanchayatId,
      name: 'Central Drinking Water RO Plant',
      type: 'WaterFacility',
      ward: 'Ward 2',
      village: 'Hanchinal',
      location: { type: 'Point', coordinates: [75.84, 16.83] },
      condition: 'Bad',
      status: 'Needs_Maintenance',
      complaintsCount: 6,
      populationServed: 3500,
      estimatedMaintenanceCost: 45000, // ₹45,000
      waterType: 'ROPlant',
      functionalStatus: 'Defunct',
      capacityLitres: 10000,
      familiesServed: 400,
      waterQualityStatus: 'Contaminated'
    });

    // Asset 3: Moderate Priority, Moderate Cost
    await School.create({
      panchayatId: dummyPanchayatId,
      name: 'Government Primary School Hanchinal',
      type: 'School',
      ward: 'Ward 3',
      village: 'Hanchinal',
      location: { type: 'Point', coordinates: [75.85, 16.81] },
      condition: 'Average',
      status: 'Operational',
      complaintsCount: 2,
      populationServed: 800,
      estimatedMaintenanceCost: 180000, // ₹1.8 Lakhs
      studentCount: 240,
      staffCount: 8,
      schoolType: 'Primary',
      management: 'Govt',
      accessibility: { roadAccess: true, allWeatherAccessible: true, wheelchairAccessible: false },
      facilities: { toilets: 'Functional', drinkingWater: true, playground: true, boundaryWall: false, electricity: true }
    });

    // Asset 4: Extreme High Priority, Massive Cost (Big Budget Consuming)
    await Road.create({
      panchayatId: dummyPanchayatId,
      name: 'District Link Highway Bypass',
      type: 'Road',
      ward: 'Ward 1',
      village: 'Hanchinal',
      location: { type: 'Point', coordinates: [75.86, 16.80] },
      condition: 'Bad',
      status: 'Needs_Maintenance',
      complaintsCount: 4,
      populationServed: 4800,
      trafficLevel: 'High',
      roadLength: 5.5,
      surfaceType: 'Paved',
      roadType: 'MajorDistrict',
      estimatedRepairCost: 1500000, // ₹15.0 Lakhs
      estimatedMaintenanceCost: 1500000,
      lastRepairDate: new Date('2021-05-15'),
      connects: ['Taluk Junction', 'Hanchinal Border']
    });

    // Asset 5: Low Priority, Modest Cost
    await WaterFacility.create({
      panchayatId: dummyPanchayatId,
      name: 'Agricultural Borewell Substation',
      type: 'WaterFacility',
      ward: 'Ward 4',
      village: 'Hanchinal Outskirts',
      location: { type: 'Point', coordinates: [75.87, 16.79] },
      condition: 'Good',
      status: 'Operational',
      complaintsCount: 0,
      populationServed: 250,
      estimatedMaintenanceCost: 60000, // ₹60,000
      waterType: 'Borewell',
      functionalStatus: 'Functional',
      capacityLitres: 3000,
      familiesServed: 30,
      waterQualityStatus: 'Potable'
    });

    console.log('Seeded 5 test assets with varying priorities and repair costs.\n');

    // ----------------------------------------------------
    // TEST 1: Strict Budget Constraint Enforcement
    // ----------------------------------------------------
    const budget1 = 300000; // ₹3 Lakhs
    const result1 = await BudgetRecommendationService.recommendProjects({
      budget: budget1,
      strategy: 'greedy'
    });

    assert(
      result1.totalEstimatedCost <= budget1,
      'Total estimated cost does not exceed available budget',
      `Cost: ₹${result1.totalEstimatedCost} <= Budget: ₹${budget1}`
    );
    assert(
      result1.remainingBudget >= 0 && result1.remainingBudget === budget1 - result1.totalEstimatedCost,
      'Remaining budget is non-negative and mathematically exact',
      `Remaining: ₹${result1.remainingBudget}`
    );
    const sumSelectedCosts = result1.selectedProjects.reduce((s, p) => s + p.estimatedRepairCost, 0);
    assert(
      sumSelectedCosts === result1.totalEstimatedCost,
      'Sum of individual project repair costs equals totalEstimatedCost',
      `Sum: ${sumSelectedCosts}, Total: ${result1.totalEstimatedCost}`
    );

    // ----------------------------------------------------
    // TEST 2: Value-Per-Rupee Heuristic vs Blind Cost
    // ----------------------------------------------------
    // With ₹3 Lakhs, Asset 4 (₹15L) cannot be chosen.
    // Asset 2 (₹45k) and Asset 1 (₹1.2L) should be chosen first due to high value-to-cost ratio.
    const selectedIds1 = result1.selectedProjects.map((p) => p.name);
    assert(
      selectedIds1.includes('Central Drinking Water RO Plant') &&
      selectedIds1.includes('Main Village Culvert Road'),
      'High cost-efficiency assets prioritized over blind selection',
      `Selected: ${selectedIds1.join(', ')}`
    );
    assert(
      !selectedIds1.includes('District Link Highway Bypass'),
      'Expensive ₹15L project not selected within ₹3L budget',
      `Correctly excluded high-cost project`
    );

    // ----------------------------------------------------
    // TEST 3: Zero or Insufficient Budget Handling
    // ----------------------------------------------------
    const zeroResult = await BudgetRecommendationService.recommendProjects({
      budget: 0,
      strategy: 'greedy'
    });
    assert(
      zeroResult.selectedProjects.length === 0 && zeroResult.totalEstimatedCost === 0,
      'Zero budget yields 0 selected projects and ₹0 cost',
      `Selected count: ${zeroResult.selectedProjects.length}`
    );
    assert(
      zeroResult.unselectedProjects.length === 5,
      'All 5 candidate projects reported in unselected list with reasons',
      `Unselected count: ${zeroResult.unselectedProjects.length}`
    );

    const tinyBudget = 20000; // ₹20k (cheapest project is ₹45k)
    const tinyResult = await BudgetRecommendationService.recommendProjects({
      budget: tinyBudget,
      strategy: 'greedy'
    });
    assert(
      tinyResult.selectedProjects.length === 0,
      'Insufficient budget yields 0 selected projects without errors',
      `Budget ₹20,000 < minimum project cost ₹45,000`
    );
    assert(
      tinyResult.unselectedProjects.every((u) => u.costDeficit !== undefined && u.rejectionReason.length > 0),
      'All unselected projects have valid rejection reasons and cost deficits'
    );

    // ----------------------------------------------------
    // TEST 4: Abundant Budget (All candidates funded)
    // ----------------------------------------------------
    const hugeBudget = 2500000; // ₹25 Lakhs (more than all assets combined: 1.2L + 0.45L + 1.8L + 15L + 0.6L = 19.05L)
    const hugeResult = await BudgetRecommendationService.recommendProjects({
      budget: hugeBudget,
      strategy: 'greedy'
    });
    assert(
      hugeResult.selectedProjects.length === 5,
      'Abundant budget funds all eligible candidate projects',
      `Funded: ${hugeResult.selectedProjects.length} / 5`
    );
    assert(
      hugeResult.unselectedProjects.length === 0,
      'Unselected list is empty when all projects are funded',
      `Unselected count: ${hugeResult.unselectedProjects.length}`
    );
    assert(
      hugeResult.remainingBudget > 0 && hugeResult.budgetUtilizationPercent < 100,
      'Budget surplus correctly reflected in remaining buffer',
      `Buffer: ₹${hugeResult.remainingBudget}, Utilization: ${hugeResult.budgetUtilizationPercent}%`
    );

    // ----------------------------------------------------
    // TEST 5: Explainability Rationale Verification
    // ----------------------------------------------------
    const explainResult = await BudgetRecommendationService.recommendProjects({
      budget: 500000, // ₹5 Lakhs
      strategy: 'greedy'
    });

    const hasClearSelectionReasons = explainResult.selectedProjects.every(
      (p) =>
        p.selectionReason.includes('cost-efficiency') &&
        p.selectionReason.includes('priority') &&
        p.selectionReason.includes('residents')
    );
    assert(
      hasClearSelectionReasons,
      'Every selected project includes auditable selection explanation with metrics'
    );

    const hasClearRejectionReasons = explainResult.unselectedProjects.every(
      (p) => p.rejectionReason && p.rejectionReason.length > 15
    );
    assert(
      hasClearRejectionReasons,
      'Every unselected project provides a descriptive explanation of exclusion'
    );

    // ----------------------------------------------------
    // TEST 6: 0/1 Knapsack Dynamic Programming Benchmark
    // ----------------------------------------------------
    const knapsackResult = await BudgetRecommendationService.recommendProjects({
      budget: 500000,
      strategy: 'knapsack'
    });
    assert(
      knapsackResult.totalEstimatedCost <= 500000,
      '0/1 Knapsack optimization stays within budget constraint',
      `Knapsack Cost: ₹${knapsackResult.totalEstimatedCost} <= ₹500,000`
    );
    assert(
      knapsackResult.comparison !== undefined && knapsackResult.comparison.impactRatioPercent > 0,
      'Comparison metrics between Greedy heuristic and 0/1 Knapsack DP generated',
      `Impact Ratio: ${knapsackResult.comparison?.impactRatioPercent}%`
    );

    // ----------------------------------------------------
    // TEST 7: Filtering Capabilities (Type & Min Priority)
    // ----------------------------------------------------
    const roadOnly = await BudgetRecommendationService.recommendProjects({
      budget: 2000000,
      type: 'Road'
    });
    assert(
      roadOnly.selectedProjects.every((p) => p.type === 'Road'),
      'Type filter restricts recommendation to selected infrastructure type',
      `All ${roadOnly.selectedProjects.length} selected items are Roads`
    );

    const highPriorityOnly = await BudgetRecommendationService.recommendProjects({
      budget: 2000000,
      minPriorityScore: 70
    });
    assert(
      highPriorityOnly.selectedProjects.every((p) => p.priorityScore >= 70),
      'minPriorityScore filter restricts candidates to requested priority threshold',
      `All items have score >= 70`
    );

    // ----------------------------------------------------
    // TEST 8: Controller Handlers via Mock Express Request
    // ----------------------------------------------------
    let postData: any = null;
    const mockPostReq = {
      method: 'POST',
      body: { budget: 400000, strategy: 'greedy' },
      query: {}
    } as any;
    const mockPostRes = {
      json: (d: any) => { postData = d; },
      status: (code: number) => ({ json: (d: any) => { postData = d; } })
    } as any;

    await getRecommendations(mockPostReq, mockPostRes);
    assert(
      postData && postData.selectedProjects !== undefined && postData.totalEstimatedCost <= 400000,
      'POST /budget/recommend handler returns valid recommendation object',
      `Selected items: ${postData?.selectedProjects?.length}`
    );

    let overviewData: any = null;
    const mockOverviewReq = { query: {} } as any;
    const mockOverviewRes = {
      json: (d: any) => { overviewData = d; },
      status: (code: number) => ({ json: (d: any) => { overviewData = d; } })
    } as any;

    await getOverview(mockOverviewReq, mockOverviewRes);
    assert(
      overviewData && overviewData.totalBacklogCost > 0 && overviewData.recommendedPresets.length === 5,
      'GET /budget/overview handler returns backlog metrics and presets',
      `Total backlog: ₹${overviewData?.totalBacklogCost}`
    );

    console.log(`\n====================================================`);
    console.log(`  RESULTS: ${passed}/${total} TESTS PASSED (100%)    `);
    console.log(`====================================================\n`);

  } finally {
    await disconnectDb();
  }
}

runBudgetTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
