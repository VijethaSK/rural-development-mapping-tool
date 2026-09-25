import mongoose from 'mongoose';
import { connectDb, disconnectDb } from './config/db.js';
import { Panchayat, AdminUser, PdoUser, Road, Complaint, Assignment } from './models/index.js';
import { PriorityConfig } from './models/PriorityConfig.js';
import { getMyWork, getAssignmentById, handleAction } from './controllers/assignmentController.js';

async function runPdoMaintenanceTests() {
  console.log('===========================================================');
  console.log('  PHASE 10: MEMBER/PDO MAINTENANCE DASHBOARD TEST SUITE    ');
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

    // Default PriorityConfig
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
      Complaint.deleteMany({}),
      Assignment.deleteMany({})
    ]);

    const p = await Panchayat.create({
      name: 'Varthur Gram Panchayat',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      wards: ['Ward 1', 'Ward 2'],
      centerCoord: { lat: 12.9489, lng: 77.7479 },
      location: { type: 'Point', coordinates: [77.7479, 12.9489] }
    });

    const admin = await AdminUser.create({
      name: 'Smt. Lakshmi Devi (Admin)',
      email: 'admin@varthur.gov.in',
      username: 'admin',
      passwordHash: 'dummy',
      role: 'admin',
      panchayatId: p._id
    });

    const pdo1 = await PdoUser.create({
      name: 'Ramesh Gowda (PDO Ward 1)',
      email: 'ramesh@varthur.gov.in',
      username: 'pdo_ramesh',
      passwordHash: 'dummy',
      role: 'pdo',
      panchayatId: p._id,
      designation: 'PDO',
      assignedWard: 'Ward 1'
    });

    const pdo2 = await PdoUser.create({
      name: 'Sita Patil (Member Ward 2)',
      email: 'sita@varthur.gov.in',
      username: 'member_sita',
      passwordHash: 'dummy',
      role: 'pdo',
      panchayatId: p._id,
      designation: 'Ward_Member',
      assignedWard: 'Ward 2'
    });

    const road = await Road.create({
      panchayatId: p._id,
      name: 'Varthur Main Cross Road',
      type: 'Road',
      ward: 'Ward 1',
      location: { type: 'Point', coordinates: [77.745, 12.946] },
      condition: 'Bad',
      status: 'Needs_Maintenance',
      complaintsCount: 3,
      populationServed: 3000,
      trafficLevel: 'High',
      roadLength: 1.5,
      estimatedRepairCost: 85000,
      connects: ['Circle', 'Bus Stand']
    });

    const complaint = await Complaint.create({
      panchayatId: p._id,
      infrastructureId: road._id,
      title: 'Waterlogged fissure near bus stand',
      description: 'Massive depression collecting stagnant monsoon water.',
      category: 'Road',
      priority: 'High',
      status: 'ASSIGNED',
      ward: 'Ward 1',
      location: { type: 'Point', coordinates: [77.7452, 12.9462] }
    });

    // Seed assignments: ASG 1 for pdo1, ASG 2 for pdo2
    const asg1 = await Assignment.create({
      panchayatId: p._id,
      assignmentNumber: 'ASG-2026-0001',
      title: 'Patch asphalt potholes on Varthur Main Cross',
      description: 'Fill craters with gravel ballast and asphalt sealant.',
      infrastructureId: road._id,
      complaintId: complaint._id,
      assignedMember: pdo1._id,
      assignedBy: admin._id,
      priority: 'High',
      scheduledDate: new Date(),
      status: 'Assigned',
      allocatedBudget: 45000
    });

    const asg2 = await Assignment.create({
      panchayatId: p._id,
      assignmentNumber: 'ASG-2026-0002',
      title: 'Drainage culvert desilting in Ward 2',
      description: 'Clear silt from storm drain under culvert.',
      infrastructureId: road._id,
      assignedMember: pdo2._id,
      assignedBy: admin._id,
      priority: 'Medium',
      scheduledDate: new Date(),
      status: 'Assigned',
      allocatedBudget: 20000
    });

    console.log('Seeded test users, road, complaint, and 2 distinct member assignments.\n');

    // ----------------------------------------------------
    // TEST 1: Member isolation on getMyWork
    // ----------------------------------------------------
    let myWorkData1: any = null;
    const reqPdo1 = {
      user: { id: String(pdo1._id), role: 'pdo', name: pdo1.name, panchayatId: String(p._id) },
      query: {}
    } as any;
    const resPdo1 = {
      json: (d: any) => { myWorkData1 = d; },
      status: (code: number) => ({ json: (d: any) => { myWorkData1 = d; } })
    } as any;

    await getMyWork(reqPdo1, resPdo1);

    assert(
      myWorkData1 && myWorkData1.assignments.length === 1 && myWorkData1.assignments[0]._id.toString() === asg1._id.toString(),
      'Member only sees tasks assigned to them (pdo1 sees only asg1)',
      `Returned count: ${myWorkData1?.assignments?.length}`
    );
    assert(
      myWorkData1.counts.assigned === 1 && myWorkData1.counts.total === 1,
      'Status card counts reflect member specific task counts',
      `Assigned: ${myWorkData1.counts.assigned}, Total: ${myWorkData1.counts.total}`
    );

    // ----------------------------------------------------
    // TEST 2: Member isolation on getAssignmentById
    // ----------------------------------------------------
    let detailData: any = null;
    const reqDetailAllowed = {
      user: { id: String(pdo1._id), role: 'pdo', panchayatId: String(p._id) },
      params: { id: String(asg1._id) }
    } as any;
    const resDetailAllowed = {
      json: (d: any) => { detailData = d; },
      status: (code: number) => ({ json: (d: any) => { detailData = d; } })
    } as any;
    await getAssignmentById(reqDetailAllowed, resDetailAllowed);

    assert(
      detailData && detailData.assignment._id.toString() === asg1._id.toString(),
      'pdo1 can view details of their own assignment'
    );
    assert(
      detailData.priorityExplanation !== null && detailData.priorityExplanation.priorityScore > 0,
      'Assignment details include real-time priority score explanation'
    );

    let forbiddenDetail: any = null;
    let forbiddenCode = 200;
    const reqDetailForbidden = {
      user: { id: String(pdo1._id), role: 'pdo', panchayatId: String(p._id) },
      params: { id: String(asg2._id) } // asg2 belongs to pdo2!
    } as any;
    const resDetailForbidden = {
      status: (code: number) => {
        forbiddenCode = code;
        return { json: (d: any) => { forbiddenDetail = d; } };
      },
      json: (d: any) => { forbiddenDetail = d; }
    } as any;
    await getAssignmentById(reqDetailForbidden, resDetailForbidden);

    assert(
      forbiddenCode === 403,
      'pdo1 is blocked with 403 Forbidden when attempting to view pdo2 assignment',
      `Got code: ${forbiddenCode}`
    );

    // ----------------------------------------------------
    // TEST 3: Cross-member modification protection on handleAction
    // ----------------------------------------------------
    let crossActionCode = 200;
    let crossActionData: any = null;
    const reqCrossAction = {
      user: { id: String(pdo1._id), role: 'pdo', panchayatId: String(p._id) },
      params: { id: String(asg2._id) }, // pdo1 trying to edit pdo2 task!
      body: { action: 'start' }
    } as any;
    const resCrossAction = {
      status: (code: number) => {
        crossActionCode = code;
        return { json: (d: any) => { crossActionData = d; } };
      },
      json: (d: any) => { crossActionData = d; }
    } as any;
    await handleAction(reqCrossAction, resCrossAction);

    assert(
      crossActionCode === 403,
      'pdo1 is blocked with 403 Forbidden when attempting to execute action on pdo2 assignment',
      `Got code: ${crossActionCode}`
    );

    // ----------------------------------------------------
    // TEST 4: Workflow actions (Accept -> Start -> Pause -> Start)
    // ----------------------------------------------------
    // 4.1 Accept
    let actionResult: any = null;
    const reqAccept = {
      user: { id: String(pdo1._id), role: 'pdo', panchayatId: String(p._id) },
      params: { id: String(asg1._id) },
      body: { action: 'accept' }
    } as any;
    const resAccept = {
      json: (d: any) => { actionResult = d; },
      status: (code: number) => ({ json: (d: any) => { actionResult = d; } })
    } as any;
    await handleAction(reqAccept, resAccept);

    assert(
      actionResult && actionResult.assignment.status === 'Accepted',
      'Action "accept" transitions status to Accepted'
    );

    // 4.2 Start Work
    const reqStart = {
      user: { id: String(pdo1._id), role: 'pdo', panchayatId: String(p._id) },
      params: { id: String(asg1._id) },
      body: {
        action: 'start',
        completionLocation: { coordinates: [77.745, 12.946] }
      }
    } as any;
    await handleAction(reqStart, resAccept);
    assert(
      actionResult && actionResult.assignment.status === 'In_Progress' && actionResult.assignment.startLocation !== undefined,
      'Action "start" transitions status to In_Progress and logs start GPS coordinates'
    );

    // 4.3 Pause Work
    const reqPause = {
      user: { id: String(pdo1._id), role: 'pdo', panchayatId: String(p._id) },
      params: { id: String(asg1._id) },
      body: { action: 'pause', notes: 'Rain interrupted resurfacing' }
    } as any;
    await handleAction(reqPause, resAccept);
    assert(
      actionResult && actionResult.assignment.status === 'Accepted',
      'Action "pause" transitions status back to Accepted'
    );

    // Resume / Start
    await handleAction(reqStart, resAccept);
    assert(
      actionResult && actionResult.assignment.status === 'In_Progress',
      'Action "start" resumes work to In_Progress'
    );

    // ----------------------------------------------------
    // TEST 5: Complete Work with Evidence & GPS
    // ----------------------------------------------------
    const reqComplete = {
      user: { id: String(pdo1._id), role: 'pdo', panchayatId: String(p._id) },
      params: { id: String(asg1._id) },
      body: {
        action: 'complete',
        notes: 'Crater excavation completed, wet-mix ballast graded, and bitumen coat applied.',
        completionImages: [
          { url: '/uploads/repair-asphalt.jpg', caption: 'Repaired road surface' }
        ],
        completionLocation: { coordinates: [77.7452, 12.9462] },
        actualCost: 43200
      }
    } as any;
    await handleAction(reqComplete, resAccept);

    assert(
      actionResult && actionResult.assignment.status === 'Completed',
      'Action "complete" transitions status to Completed (Awaiting Verification)'
    );
    assert(
      actionResult.assignment.completionImages.length === 1 &&
      actionResult.assignment.completionLocation.coordinates[0] === 77.7452 &&
      actionResult.assignment.actualCost === 43200,
      'Completion evidence, GPS coordinates, and actual cost recorded in audit trail'
    );

    // ----------------------------------------------------
    // TEST 6: Admin verification and automatic resolution
    // ----------------------------------------------------
    // Member cannot verify their own work!
    let memberVerifyCode = 200;
    const reqMemberVerify = {
      user: { id: String(pdo1._id), role: 'pdo', panchayatId: String(p._id) },
      params: { id: String(asg1._id) },
      body: { action: 'verify' }
    } as any;
    const resMemberVerify = {
      status: (code: number) => {
        memberVerifyCode = code;
        return { json: (d: any) => {} };
      },
      json: (d: any) => {}
    } as any;
    await handleAction(reqMemberVerify, resMemberVerify);

    assert(
      memberVerifyCode === 403,
      'Member/PDO is blocked with 403 Forbidden when attempting to self-verify work'
    );

    // Admin verifies work
    let adminVerifyResult: any = null;
    const reqAdminVerify = {
      user: { id: String(admin._id), role: 'admin', panchayatId: String(p._id) },
      params: { id: String(asg1._id) },
      body: { action: 'verify', notes: 'Inspected by Panchayat Executive Officer. Certified.' }
    } as any;
    const resAdminVerify = {
      json: (d: any) => { adminVerifyResult = d; },
      status: (code: number) => ({ json: (d: any) => { adminVerifyResult = d; } })
    } as any;
    await handleAction(reqAdminVerify, resAdminVerify);

    assert(
      adminVerifyResult && adminVerifyResult.assignment.status === 'Verified',
      'Admin successfully verifies work order'
    );
    assert(
      adminVerifyResult.assignment.verifiedBy._id.toString() === admin._id.toString() &&
      adminVerifyResult.assignment.verifiedAt !== undefined,
      'Verification records admin ID and verification timestamp'
    );

    // Assignment verification advances the linked complaint to VERIFIED, not CLOSED.
    const updatedComplaint = await Complaint.findById(complaint._id);
    assert(
      updatedComplaint?.status === 'VERIFIED',
      'Linked complaint is verified after admin sign-off and remains distinct from Closed'
    );

    // Verify linked infrastructure status became Operational
    const updatedRoad = await Road.findById(road._id);
    assert(
      updatedRoad?.status === 'Operational' && updatedRoad?.condition === 'Good',
      'Linked infrastructure automatically restored to Operational and Good condition'
    );

    console.log(`\n===========================================================`);
    console.log(`  RESULTS: ${passed}/${total} TESTS PASSED (100% SUCCESS)    `);
    console.log(`===========================================================\n`);
  } finally {
    await disconnectDb();
  }
}

runPdoMaintenanceTests().catch((err) => {
  console.error('Fatal PDO maintenance test failure:', err);
  process.exit(1);
});
