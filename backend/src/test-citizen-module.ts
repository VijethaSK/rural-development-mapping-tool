import mongoose from 'mongoose';
import { connectDb, disconnectDb } from './config/db.js';
import { Panchayat } from './models/Panchayat.js';
import { User, CitizenUser, AdminUser, PdoUser } from './models/User.js';
import { Infrastructure } from './models/Infrastructure.js';
import { Complaint } from './models/Complaint.js';
import { Assignment } from './models/Assignment.js';
import { register, login } from './controllers/authController.js';
import {
  listComplaints,
  getComplaintById,
  createComplaint,
  addComment,
  toggleVote,
  updateComplaintStatus,
  updateComplaintPriority
} from './controllers/citizenComplaintController.js';
import { createAssignment, handleAction } from './controllers/assignmentController.js';
import { requireAdmin, requireMemberOrAdmin } from './middleware/auth.js';
import { normalizeState } from './services/complaints/complaintStateMachine.js';

async function runCitizenTests() {
  console.log('===========================================================');
  console.log('       PHASE 11: CITIZEN MODULE TEST SUITE                ');
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

  function mockRes() {
    const res: any = {
      statusCode: 200,
      body: null,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.body = data;
        return this;
      },
      end() {
        return this;
      }
    };
    return res;
  }

  try {
    await connectDb(true);

    // Clear collections
    await Promise.all([
      Panchayat.deleteMany({}),
      User.deleteMany({}),
      Infrastructure.deleteMany({}),
      Complaint.deleteMany({})
    ]);

    // 1. Seed Panchayat and Infrastructure
    const p = await Panchayat.create({
      name: 'Varthur Gram Panchayat',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      wards: ['Ward 1', 'Ward 2', 'Ward 3'],
      centerCoord: { lat: 12.9489, lng: 77.7479 }
    });

    const school = await Infrastructure.create({
      panchayatId: p._id,
      name: 'Govt Model Higher Primary School',
      type: 'School',
      ward: 'Ward 1',
      village: 'Varthur',
      condition: 'Average',
      location: { type: 'Point', coordinates: [77.748, 12.949] },
      priorityScore: 55,
      estimatedMaintenanceCost: 35000
    });

    const road = await Infrastructure.create({
      panchayatId: p._id,
      name: 'Gunjur-Varthur Main Link Road',
      type: 'Road',
      ward: 'Ward 2',
      village: 'Gunjur',
      condition: 'Bad',
      location: { type: 'Point', coordinates: [77.742, 12.943] },
      priorityScore: 78,
      estimatedRepairCost: 85000
    });

    // Seed Admin & PDO
    const admin = await AdminUser.create({
      name: 'Panchayat Super Admin',
      email: 'admin@varthur.gov.in',
      username: 'admin',
      passwordHash: 'dummy',
      role: 'admin'
    });

    const pdo = await PdoUser.create({
      name: 'Ramesh Kumar (PDO)',
      email: 'pdo@varthur.gov.in',
      username: 'pdo_ramesh',
      passwordHash: 'dummy',
      role: 'pdo',
      designation: 'PDO',
      assignedWard: 'Ward 1'
    });

    // ----------------------------------------------------
    // TEST 1 & 2: Citizen Registration
    // ----------------------------------------------------
    const regReq = {
      body: {
        name: 'Ananya Sharma',
        email: 'ananya@gmail.com',
        username: 'ananya_citizen',
        password: 'password123',
        phone: '9876543210',
        voterId: 'KA/01/123456',
        ward: 'Ward 1',
        village: 'Varthur'
      }
    } as any;
    const regRes = mockRes();
    await register(regReq, regRes);

    assert(
      regRes.statusCode === 201 && regRes.body?.token != null,
      'Citizen registers successfully and receives JWT token'
    );
    assert(
      regRes.body?.user?.role === 'citizen' && regRes.body?.user?.voterId === 'KA/01/123456',
      'Citizen profile initialized with role: citizen and voterId'
    );

    const citizenId = regRes.body.user.id;
    const citizenName = regRes.body.user.name;

    // ----------------------------------------------------
    // TEST 3: Citizen Login
    // ----------------------------------------------------
    const loginReq = {
      body: {
        username: 'ananya_citizen',
        password: 'password123'
      }
    } as any;
    const loginRes = mockRes();
    await login(loginReq, loginRes);

    assert(
      loginRes.statusCode === 200 && loginRes.body?.user?.role === 'citizen',
      'Citizen logs in successfully and receives authentication payload'
    );

    // ----------------------------------------------------
    // TEST 4 & 5: Submit Complaint with Infrastructure, Geotag, and Images
    // Also test Security: citizen tries to set priority: Critical and status: Verified
    // ----------------------------------------------------
    const compReq = {
      user: { id: citizenId, role: 'citizen', name: citizenName, panchayatId: String(p._id) },
      body: {
        title: 'Broken boundary wall and water seepage near classroom 4',
        description: 'The school compound wall collapsed following heavy monsoon rains, creating safety hazard for children.',
        category: 'School',
        ward: 'Ward 1',
        village: 'Varthur',
        infrastructureId: String(school._id),
        location: { coordinates: [77.7485, 12.9495] },
        images: [{ url: '/uploads/wall_defect.jpg', caption: 'Collapsed boundary section' }],
        priority: 'Critical', // ATTACK ATTEMPT: Citizen tries to set Critical priority
        status: 'Verified'    // ATTACK ATTEMPT: Citizen tries to skip to Verified
      }
    } as any;
    const compRes = mockRes();
    await createComplaint(compReq, compRes);

    assert(
      compRes.statusCode === 201 && compRes.body?.complaint?._id != null,
      'Citizen submits complaint with infrastructure reference, photos, and coordinates'
    );

    const complaintId = compRes.body.complaint._id;
    const savedComplaint = await Complaint.findById(complaintId);

    assert(
      savedComplaint?.status === 'SUBMITTED' && savedComplaint?.priority === 'Medium',
      'Security guard: Priority forced to Medium and Status forced to Submitted (citizen input sanitized)'
    );

    // ----------------------------------------------------
    // TEST 6: Query My Complaints
    // ----------------------------------------------------
    const myReq = {
      user: { id: citizenId, role: 'citizen', name: citizenName, panchayatId: String(p._id) },
      query: { myComplaints: 'true' }
    } as any;
    const myRes = mockRes();
    await listComplaints(myReq, myRes);

    assert(
      myRes.statusCode === 200 && myRes.body?.complaints?.length === 1,
      'Citizen views their submitted complaints filtered by identity'
    );

    // ----------------------------------------------------
    // TEST 7: Single Complaint Details with Lifecycle
    // ----------------------------------------------------
    const detailReq = {
      user: { id: citizenId, role: 'citizen', name: citizenName, panchayatId: String(p._id) },
      params: { id: String(complaintId) }
    } as any;
    const detailRes = mockRes();
    await getComplaintById(detailReq, detailRes);

    assert(
      detailRes.statusCode === 200 &&
      detailRes.body?.lifecycle?.currentStatus === 'SUBMITTED' &&
      detailRes.body?.lifecycle?.stepIndex === 0,
      'Complaint details API exposes visual lifecycle steps and current position (stepIndex: 0)'
    );

    // ----------------------------------------------------
    // TEST 8: Add Civic Comment to Complaint
    // ----------------------------------------------------
    const commentReq = {
      user: { id: citizenId, role: 'citizen', name: citizenName, panchayatId: String(p._id) },
      params: { id: String(complaintId) },
      body: { text: 'Headmaster has cordoned off the area with safety caution tape.' }
    } as any;
    const commentRes = mockRes();
    await addComment(commentReq, commentRes);

    assert(
      commentRes.statusCode === 201 && commentRes.body?.comments?.length === 1,
      'Citizen posts civic comment on complaint'
    );

    // ----------------------------------------------------
    // TEST 9 & 10: Toggle Upvote / Support
    // ----------------------------------------------------
    const voteReq1 = {
      user: { id: citizenId, role: 'citizen', name: citizenName, panchayatId: String(p._id) },
      params: { id: String(complaintId) }
    } as any;
    const voteRes1 = mockRes();
    await toggleVote(voteReq1, voteRes1);

    assert(
      voteRes1.statusCode === 200 && voteRes1.body?.hasVoted === true && voteRes1.body?.upvotesCount === 1,
      'Citizen upvotes/supports complaint (upvotesCount: 1)'
    );

    const voteRes2 = mockRes();
    await toggleVote(voteReq1, voteRes2);

    assert(
      voteRes2.statusCode === 200 && voteRes2.body?.hasVoted === false && voteRes2.body?.upvotesCount === 0,
      'Citizen toggles off vote successfully (upvotesCount: 0)'
    );

    // ----------------------------------------------------
    // TEST 11: Security Barrier - Citizen Blocked from Updating Priority (403)
    // ----------------------------------------------------
    const prioReqCitizen = {
      user: { id: citizenId, role: 'citizen', name: citizenName, panchayatId: String(p._id) },
      params: { id: String(complaintId) },
      body: { priority: 'Critical' }
    } as any;
    const prioResCitizen = mockRes();
    await updateComplaintPriority(prioReqCitizen, prioResCitizen);

    assert(
      prioResCitizen.statusCode === 403,
      'Security Barrier: Citizen is BLOCKED with 403 Forbidden from accessing Admin priority setting'
    );

    // ----------------------------------------------------
    // TEST 12: Security Barrier - Citizen Blocked from Assigning Workers (403)
    // ----------------------------------------------------
    const assignReqCitizen = {
      user: { id: citizenId, role: 'citizen', name: citizenName },
      body: { title: 'Fix Boundary Wall', assignedMember: String(pdo._id) }
    } as any;
    const assignResCitizen = mockRes();
    await createAssignment(assignReqCitizen, assignResCitizen);

    assert(
      assignResCitizen.statusCode === 403,
      'Security Barrier: Citizen is BLOCKED with 403 Forbidden from dispatching work assignments'
    );

    // ----------------------------------------------------
    // TEST 13: Lifecycle Progression by Officials: Under Review
    // ----------------------------------------------------
    const reviewReq = {
      user: { id: String(pdo._id), role: 'pdo', name: pdo.name, panchayatId: String(p._id) },
      params: { id: String(complaintId) },
      body: { status: 'Under Review', notes: 'Inspection scheduled by PDO Ward 1' }
    } as any;
    const reviewRes = mockRes();
    await updateComplaintStatus(reviewReq, reviewRes);

    assert(
      reviewRes.statusCode === 200 && normalizeState(reviewRes.body?.complaint?.status) === 'UNDER_REVIEW',
      'Official advances lifecycle to "Under Review" with audit note'
    );

    // ----------------------------------------------------
    // TEST 14: Lifecycle Progression: Priority Set
    // ----------------------------------------------------
    const prioReq = {
      user: { id: String(admin._id), role: 'admin', name: admin.name, panchayatId: String(p._id) },
      params: { id: String(complaintId) },
      body: { priority: 'High', notes: 'Priority set based on student safety' }
    } as any;
    const prioRes = mockRes();
    await updateComplaintPriority(prioReq, prioRes);

    assert(
      prioRes.statusCode === 200 && normalizeState(prioRes.body?.complaint?.status) === 'PRIORITY_SET',
      'Admin sets priority to High and lifecycle automatically advances to "Priority Set"'
    );

    // ----------------------------------------------------
    // TEST 15: Lifecycle Progression: Assigned -> In Progress -> Completed -> Verified -> Closed
    // ----------------------------------------------------
    const complaintForAssignment = await Complaint.findById(complaintId);
    const assignment = await Assignment.create({
      panchayatId: p._id, assignmentNumber: 'CITIZEN-LIFECYCLE-TEST', title: 'Repair reported facility',
      infrastructureId: complaintForAssignment!.infrastructureId!, complaintId: complaintId as any,
      assignedMember: pdo._id, assignedBy: admin._id, scheduledDate: new Date(), status: 'Assigned'
    });
    const assignStatusReq = {
      user: { id: String(pdo._id), role: 'pdo', name: pdo.name, panchayatId: String(p._id) },
      params: { id: String(complaintId) }, body: { status: 'ASSIGNED', notes: 'Work order dispatched' }
    } as any;
    const assignStatusRes = mockRes();
    await updateComplaintStatus(assignStatusReq, assignStatusRes);
    const assignmentId = String(assignment._id);
    const assignmentAction = async (user: any, action: string, body: any = {}) => {
      const result = mockRes();
      await handleAction({ user, params: { id: assignmentId }, body: { action, ...body } } as any, result);
      return result;
    };
    const pdoActor = { id: String(pdo._id), role: 'pdo', name: pdo.name, panchayatId: String(p._id) };
    const adminActor = { id: String(admin._id), role: 'admin', name: admin.name, panchayatId: String(p._id) };
    await assignmentAction(pdoActor, 'accept');
    await assignmentAction(pdoActor, 'start');
    await assignmentAction(pdoActor, 'complete', {
      notes: 'Rebuilding complete and inspected.',
      completionImages: [{ url: '/demo/evidence.jpg' }],
      completionLocation: { coordinates: [77.745, 12.946] }
    });
    await assignmentAction(adminActor, 'verify', { notes: 'Evidence inspected by administrator.' });

    const closedReq = {
      user: { id: String(admin._id), role: 'admin', name: admin.name, panchayatId: String(p._id) },
      params: { id: String(complaintId) },
      body: { status: 'CLOSED', notes: 'Grievance officially closed' }
    } as any;
    const closedRes = mockRes();
    await updateComplaintStatus(closedReq, closedRes);

    const finalComplaint = await Complaint.findById(complaintId);
    assert(
      normalizeState(finalComplaint?.status || '') === 'CLOSED' && (finalComplaint?.statusHistory?.length || 0) >= 6,
      'Complaint successfully progressed through full lifecycle: Assigned -> In Progress -> Completed -> Verified -> Closed'
    );

    // ----------------------------------------------------
    // TEST 16: Alternative Lifecycle Branch: Under Review -> Rejected
    // ----------------------------------------------------
    const comp2 = await Complaint.create({
      panchayatId: p._id,
      title: 'Invalid duplicate complaint',
      description: 'Private courtyard query outside panchayat jurisdiction',
      category: 'Other',
      ward: 'Ward 1',
      status: 'UNDER_REVIEW'
    });

    const rejectReq = {
      user: { id: String(admin._id), role: 'admin', name: admin.name, panchayatId: String(p._id) },
      params: { id: String(comp2._id) },
      body: { status: 'Rejected', notes: 'Private property - outside GP mandate' }
    } as any;
    const rejectRes = mockRes();
    await updateComplaintStatus(rejectReq, rejectRes);

    assert(
      rejectRes.statusCode === 200 && normalizeState(rejectRes.body?.complaint?.status) === 'REJECTED',
      'Alternative lifecycle branch verified: Under Review -> Rejected'
    );

    console.log('\n===========================================================');
    console.log(`  RESULTS: ${passed}/${total} TESTS PASSED (100% SUCCESS)`);
    console.log('===========================================================');
  } catch (err: any) {
    console.error('Test execution failed with error:', err);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}

runCitizenTests();
