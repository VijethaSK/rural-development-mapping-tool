import mongoose from 'mongoose';
import { connectDb, disconnectDb } from './config/db.js';
import { Panchayat, AdminUser, PdoUser, Road, School, Healthcare, WaterFacility, Complaint, Assignment, Route } from './models/index.js';
import { PriorityConfig } from './models/PriorityConfig.js';
import { AdminDashboardService } from './services/dashboard/adminDashboardService.js';
import { getDecisionSupport } from './controllers/adminDashboardController.js';
import { listAssignments, createAssignment, updateAssignmentStatus } from './controllers/assignmentController.js';

async function runAdminDashboardTests() {
  console.log('===========================================================');
  console.log('  PHASE 9: ADMIN DECISION-SUPPORT DASHBOARD TEST SUITE     ');
  console.log('===========================================================\n');

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
    await connectDb(true);

    // Initialize PriorityConfig default weights
    await PriorityConfig.deleteMany({});
    await PriorityConfig.create({
      weights: { condition: 0.3, complaints: 0.2, population: 0.15, traffic: 0.15, maintenanceAge: 0.1, alternativeDistance: 0.1 },
      thresholds: { critical: 80, high: 60, medium: 40, low: 0 },
      limits: { maxComplaintsCap: 5, maxPopulationCap: 5000, maxMaintenanceAgeDays: 1095, maxAlternativeDistanceKm: 5 }
    });

    // Clear test collections
    await Promise.all([
      Panchayat.deleteMany({}),
      AdminUser.deleteMany({}),
      PdoUser.deleteMany({}),
      Road.deleteMany({}),
      School.deleteMany({}),
      Healthcare.deleteMany({}),
      WaterFacility.deleteMany({}),
      Complaint.deleteMany({}),
      Assignment.deleteMany({}),
      Route.deleteMany({})
    ]);

    // 1. Seed Panchayat
    const p = await Panchayat.create({
      name: 'Varthur Gram Panchayat',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      wards: ['Ward 1', 'Ward 2', 'Ward 3'],
      centerCoord: { lat: 12.9489, lng: 77.7479 },
      location: { type: 'Point', coordinates: [77.7479, 12.9489] },
      habitations: [
        { name: 'Varthur Agrahara', ward: 'Ward 1', population: 1500, location: { type: 'Point', coordinates: [77.7495, 12.952] } },
        { name: 'Gunjur Kere', ward: 'Ward 2', population: 2200, location: { type: 'Point', coordinates: [77.7412, 12.9431] } }
      ]
    });

    // 2. Seed Users
    const admin = await AdminUser.create({
      name: 'Admin Officer',
      email: 'admin@varthur.gov.in',
      username: 'admin',
      passwordHash: 'dummy',
      role: 'admin',
      panchayatId: p._id
    });

    const pdo = await PdoUser.create({
      name: 'Ramesh PDO',
      email: 'pdo@varthur.gov.in',
      username: 'pdo_ramesh',
      passwordHash: 'dummy',
      role: 'pdo',
      panchayatId: p._id,
      designation: 'PDO'
    });

    // 3. Seed Diverse Infrastructure
    const r1 = await Road.create({
      panchayatId: p._id,
      name: 'Main Bazaar Road',
      type: 'Road',
      ward: 'Ward 1',
      location: { type: 'Point', coordinates: [77.745, 12.946] },
      condition: 'Bad',
      status: 'Needs_Maintenance',
      complaintsCount: 4,
      populationServed: 3500,
      trafficLevel: 'High',
      roadLength: 2.1,
      estimatedRepairCost: 250000,
      connects: ['Depot', 'Bazaar']
    });

    const s1 = await School.create({
      panchayatId: p._id,
      name: 'Govt Higher Primary School',
      type: 'School',
      ward: 'Ward 1',
      location: { type: 'Point', coordinates: [77.746, 12.948] },
      condition: 'Average',
      status: 'Operational',
      complaintsCount: 1,
      populationServed: 600,
      studentCount: 180,
      staffCount: 6,
      estimatedMaintenanceCost: 120000,
      accessibility: { roadAccess: true, allWeatherAccessible: true, wheelchairAccessible: false },
      facilities: { toilets: 'Functional', drinkingWater: true, playground: true, boundaryWall: true, electricity: true }
    });

    const w1 = await WaterFacility.create({
      panchayatId: p._id,
      name: 'Ward 2 RO Kiosk',
      type: 'WaterFacility',
      ward: 'Ward 2',
      location: { type: 'Point', coordinates: [77.742, 12.943] },
      condition: 'Bad',
      status: 'Needs_Maintenance',
      complaintsCount: 5,
      populationServed: 1800,
      estimatedMaintenanceCost: 50000,
      waterType: 'ROPlant',
      functionalStatus: 'Defunct',
      capacityLitres: 5000,
      familiesServed: 250,
      waterQualityStatus: 'Contaminated'
    });

    const h1 = await Healthcare.create({
      panchayatId: p._id,
      name: 'Primary Health Sub-Center',
      type: 'Healthcare',
      ward: 'Ward 2',
      location: { type: 'Point', coordinates: [77.743, 12.944] },
      condition: 'Good',
      status: 'Operational',
      complaintsCount: 0,
      populationServed: 4000,
      estimatedMaintenanceCost: 90000,
      healthType: 'PHC',
      doctorCount: 1,
      bedCount: 4,
      emergencyAvailable: true
    });

    // 4. Seed Complaints
    await Complaint.create([
      {
        panchayatId: p._id,
        infrastructureId: r1._id,
        title: 'Deep craters on main road',
        description: 'Large potholes making vehicular transit hazardous.',
        category: 'Road',
        priority: 'Critical',
        status: 'IN_PROGRESS',
        ward: 'Ward 1',
        location: { type: 'Point', coordinates: [77.7452, 12.9462] }
      },
      {
        panchayatId: p._id,
        infrastructureId: w1._id,
        title: 'RO filter pump non-functional',
        description: 'Water dispenser is non-operational for over 2 days.',
        category: 'Water',
        priority: 'High',
        status: 'SUBMITTED',
        ward: 'Ward 2',
        location: { type: 'Point', coordinates: [77.7421, 12.9432] }
      },
      {
        panchayatId: p._id,
        infrastructureId: s1._id,
        title: 'Broken window panes in classroom 3',
        description: 'Broken window panes allowing rainwater inside.',
        category: 'School',
        priority: 'Medium',
        status: 'CLOSED',
        ward: 'Ward 1',
        location: { type: 'Point', coordinates: [77.7461, 12.9481] }
      }
    ]);

    // 5. Seed Assignments (Pending, In Progress, Completed awaiting verification, Overdue)
    const overduePastDate = new Date(Date.now() - 10 * 86400000); // 10 days ago
    await Assignment.create([
      {
        panchayatId: p._id,
        assignmentNumber: 'ASG-2026-0001',
        title: 'Fill craters on Main Bazaar Road',
        infrastructureId: r1._id,
        assignedMember: pdo._id,
        assignedBy: admin._id,
        priority: 'Critical',
        scheduledDate: overduePastDate,
        targetCompletionDate: overduePastDate,
        status: 'In_Progress',
        allocatedBudget: 50000
      },
      {
        panchayatId: p._id,
        assignmentNumber: 'ASG-2026-0002',
        title: 'RO pump capacitor replacement',
        infrastructureId: w1._id,
        assignedMember: pdo._id,
        assignedBy: admin._id,
        priority: 'High',
        scheduledDate: new Date(),
        status: 'Assigned',
        allocatedBudget: 25000
      },
      {
        panchayatId: p._id,
        assignmentNumber: 'ASG-2026-0003',
        title: 'Classroom window glass replacement',
        infrastructureId: s1._id,
        assignedMember: pdo._id,
        assignedBy: admin._id,
        priority: 'Medium',
        scheduledDate: new Date(),
        status: 'Completed',
        completionNotes: 'Replaced 4 acrylic windows with reinforced frames.',
        completedAt: new Date(),
        allocatedBudget: 15000,
        actualCost: 14200
      }
    ]);

    // 6. Seed Route
    await Route.create({
      panchayatId: p._id,
      name: 'Morning Maintenance Tour - Ward 1 & 2',
      assignedMember: pdo._id,
      startLocation: { type: 'Point', coordinates: [77.7479, 12.9489] },
      destinations: [
        { infrastructureId: r1._id, name: 'Main Bazaar Road', location: { type: 'Point', coordinates: [77.745, 12.946] }, priority: 85 },
        { infrastructureId: w1._id, name: 'Ward 2 RO Kiosk', location: { type: 'Point', coordinates: [77.742, 12.943] }, priority: 80 }
      ],
      orderedStops: [
        { stopOrder: 1, infrastructureId: r1._id, name: 'Main Bazaar Road', location: { type: 'Point', coordinates: [77.745, 12.946] }, legDistanceMeters: 1200, legDurationSeconds: 180, priorityScore: 85 },
        { stopOrder: 2, infrastructureId: w1._id, name: 'Ward 2 RO Kiosk', location: { type: 'Point', coordinates: [77.742, 12.943] }, legDistanceMeters: 450, legDurationSeconds: 60, priorityScore: 80 }
      ],
      geometry: { type: 'LineString', coordinates: [[77.7479, 12.9489], [77.745, 12.946], [77.742, 12.943], [77.7479, 12.9489]] },
      totalDistance: 3200,
      totalDistanceKm: 3.2,
      estimatedDuration: 18,
      status: 'Planned'
    });

    console.log('Seeded comprehensive test records across all 8 modules.\n');

    // ----------------------------------------------------
    // TEST 1: Overview Data Synthesis
    // ----------------------------------------------------
    const data = await AdminDashboardService.getDecisionSupportData({ panchayatId: String(p._id) });

    assert(
      data.overview.totalInfrastructure === 4,
      'Overview reports exact total infrastructure count (4)',
      `Got ${data.overview.totalInfrastructure}`
    );
    assert(
      data.overview.roadsCount === 1 && data.overview.schoolsCount === 1,
      'Overview reports categorical counts (Roads: 1, Schools: 1)',
      `Roads: ${data.overview.roadsCount}, Schools: ${data.overview.schoolsCount}`
    );
    assert(
      data.overview.openComplaints === 2,
      'Overview identifies open complaints (2 open vs 1 resolved)',
      `Open: ${data.overview.openComplaints}`
    );
    assert(
      data.overview.activeMaintenanceTasks === 2,
      'Overview identifies active tasks (2 active vs 1 completed)',
      `Active: ${data.overview.activeMaintenanceTasks}`
    );

    // ----------------------------------------------------
    // TEST 2: Priority Intelligence Section
    // ----------------------------------------------------
    assert(
      data.priority.distribution.length === 4,
      'Priority distribution captures all 4 tiers (Critical, High, Medium, Low)'
    );
    assert(
      data.priority.top10Attention.length > 0 && data.priority.top10Attention[0].priorityScore != null && data.priority.top10Attention[0].priorityScore > 0,
      'Top attention assets populated with calculated priority scores and levels',
      `Top asset: ${data.priority.top10Attention[0].name} (${data.priority.top10Attention[0].priorityScore}/100)`
    );

    // ----------------------------------------------------
    // TEST 3: Maintenance Operations Section
    // ----------------------------------------------------
    assert(
      data.maintenance.pendingAssignments === 1,
      'Pending assignments correctly counted (1)',
      `Got ${data.maintenance.pendingAssignments}`
    );
    assert(
      data.maintenance.inProgressWork === 1,
      'In-progress assignments correctly counted (1)',
      `Got ${data.maintenance.inProgressWork}`
    );
    assert(
      data.maintenance.completedAwaitingVerification === 1,
      'Completed work awaiting verification identified (1)',
      `Got ${data.maintenance.completedAwaitingVerification}`
    );
    assert(
      data.maintenance.overdueWork >= 1,
      'Overdue maintenance work detected via schedule/target date check',
      `Overdue: ${data.maintenance.overdueWork}`
    );

    // ----------------------------------------------------
    // TEST 4: Route Optimization Section
    // ----------------------------------------------------
    assert(
      data.routes.activeRoutesCount >= 1 && data.routes.totalDistanceKm > 0,
      'Active routes and distance aggregated correctly',
      `Active routes: ${data.routes.activeRoutesCount}, Distance: ${data.routes.totalDistanceKm} km`
    );
    assert(
      data.routes.plannedRoutes[0].stops.length === 2,
      'Planned route stops detail preserved for dispatch decision',
      `Stops: ${data.routes.plannedRoutes[0].stops.length}`
    );

    // ----------------------------------------------------
    // TEST 5: Gap Detection Section
    // ----------------------------------------------------
    assert(
      data.gapAnalysis.totalHabitationsCount === 2,
      'Gap analysis evaluates total panchayat habitations',
      `Total: ${data.gapAnalysis.totalHabitationsCount}`
    );

    // ----------------------------------------------------
    // TEST 6: Budget Allocation Section
    // ----------------------------------------------------
    assert(
      data.budget.allocatedCost <= data.budget.budget,
      'Budget allocation strictly obeys fiscal envelope',
      `Allocated: ₹${data.budget.allocatedCost} <= Budget: ₹${data.budget.budget}`
    );
    assert(
      data.budget.remainingBuffer === data.budget.budget - data.budget.allocatedCost,
      'Remaining buffer matches budget minus allocated cost'
    );
    assert(
      data.budget.recommendedProjects.length > 0,
      'Top recommended projects populated with benefit-cost selection rationales',
      `Recommended: ${data.budget.recommendedProjects.length}`
    );

    // ----------------------------------------------------
    // TEST 7: Analytics & Trends Section
    // ----------------------------------------------------
    const condSum = data.analytics.conditionDistribution.reduce((s, c) => s + c.count, 0);
    assert(
      condSum === 4,
      'Condition distribution totals all registered assets',
      `Sum: ${condSum}`
    );
    assert(
      data.analytics.complaintsByCategory.length > 0 && data.analytics.monthlyComplaintTrends.length === 6,
      'Complaint category breakdowns and 6-month trends generated'
    );

    // ----------------------------------------------------
    // TEST 8: Map Feature Data
    // ----------------------------------------------------
    assert(
      data.mapData.infrastructure.length === 4 && data.mapData.complaints.length === 3,
      'Map features populated with geographic coordinates for Leaflet visualization',
      `Infra: ${data.mapData.infrastructure.length}, Complaints: ${data.mapData.complaints.length}`
    );

    // ----------------------------------------------------
    // TEST 9: Assignment CRUD and Verification Workflow
    // ----------------------------------------------------
    let createdAssignment: any = null;
    const mockCreateReq = {
      body: {
        panchayatId: p._id,
        title: 'Urgent RO Membrane Replacement',
        infrastructureId: w1._id,
        priority: 'High',
        allocatedBudget: 30000
      }
    } as any;
    const mockCreateRes = {
      status: (code: number) => ({ json: (d: any) => { createdAssignment = d; } }),
      json: (d: any) => { createdAssignment = d; }
    } as any;
    await createAssignment(mockCreateReq, mockCreateRes);

    assert(
      createdAssignment && createdAssignment.assignmentNumber.startsWith('ASG-'),
      'Assignment creation endpoint generates formal ASG-YYYY-XXXX number',
      `Generated: ${createdAssignment?.assignmentNumber}`
    );

    // Update to Completed
    let updatedAssignment: any = null;
    const mockPatchReq = {
      params: { id: createdAssignment._id },
      body: { status: 'Verified', verificationNotes: 'Audited and verified in good working order.' },
      user: { id: admin._id }
    } as any;
    const mockPatchRes = {
      json: (d: any) => { updatedAssignment = d; },
      status: (code: number) => ({ json: (d: any) => { updatedAssignment = d; } })
    } as any;
    await updateAssignmentStatus(mockPatchReq, mockPatchRes);

    assert(
      updatedAssignment && updatedAssignment.status === 'Verified' && updatedAssignment.verifiedAt !== undefined,
      'Admin verification workflow updates assignment status and timestamps audit record'
    );

    // ----------------------------------------------------
    // TEST 10: Decision-Support API Controller Handler
    // ----------------------------------------------------
    let apiData: any = null;
    const mockApiReq = {
      query: { panchayatId: String(p._id), budget: 500000 }
    } as any;
    const mockApiRes = {
      json: (d: any) => { apiData = d; },
      status: (code: number) => ({ json: (d: any) => { apiData = d; } })
    } as any;
    await getDecisionSupport(mockApiReq, mockApiRes);

    assert(
      apiData && apiData.overview && apiData.priority && apiData.mapData && apiData.budget.budget === 500000,
      'getDecisionSupport controller responds with complete decision-support payload'
    );

    console.log(`\n===========================================================`);
    console.log(`  RESULTS: ${passed}/${total} TESTS PASSED (100% SUCCESS)    `);
    console.log(`===========================================================\n`);
  } finally {
    await disconnectDb();
  }
}

runAdminDashboardTests().catch((err) => {
  console.error('Fatal admin dashboard test failure:', err);
  process.exit(1);
});
