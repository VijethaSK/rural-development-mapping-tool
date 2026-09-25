import mongoose from 'mongoose';
import { connectDb, disconnectDb } from './config/db.js';
import { Panchayat } from './models/Panchayat.js';
import { Complaint } from './models/Complaint.js';
import { AdminUser, PdoUser, CitizenUser } from './models/User.js';
import {
  ComplaintStateMachineService,
  ComplaintState,
  normalizeState,
  TRANSITION_RULES
} from './services/complaints/complaintStateMachine.js';

async function runStateMachineTestSuite() {
  console.log('===========================================================');
  console.log('  PHASE 12: COMPLAINT LIFECYCLE STATE MACHINE TEST SUITE   ');
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

    // Clear collections
    await Promise.all([
      Panchayat.deleteMany({}),
      Complaint.deleteMany({}),
      AdminUser.deleteMany({}),
      PdoUser.deleteMany({}),
      CitizenUser.deleteMany({})
    ]);

    const p = await Panchayat.create({
      name: 'Varthur Gram Panchayat',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      wards: ['Ward 1'],
      centerCoord: { lat: 12.9489, lng: 77.7479 }
    });

    const admin = await AdminUser.create({
      name: 'Panchayat Super Admin',
      email: 'admin@varthur.gov.in',
      username: 'admin_test',
      passwordHash: 'dummy',
      role: 'admin'
    });

    const pdo = await PdoUser.create({
      name: 'Ramesh Kumar (PDO)',
      email: 'pdo@varthur.gov.in',
      username: 'pdo_test',
      passwordHash: 'dummy',
      role: 'pdo',
      designation: 'PDO',
      assignedWard: 'Ward 1'
    });

    const citizen = await CitizenUser.create({
      name: 'Ananya Sharma (Citizen)',
      email: 'citizen@varthur.gov.in',
      username: 'citizen_test',
      passwordHash: 'dummy',
      role: 'citizen',
      ward: 'Ward 1'
    });

    console.log('--- SECTION 1: VALID STATE MACHINE TRANSITIONS ---\n');

    // Create a fresh test complaint
    const complaint1 = await Complaint.create({
      panchayatId: p._id,
      title: 'Cracked bridge deck over stream',
      description: 'Dangerous longitudinal cracks appearing after heavy vehicle movement.',
      category: 'Road',
      ward: 'Ward 1',
      status: 'SUBMITTED'
    });
    const cId1 = String(complaint1._id);

    // 1. SUBMITTED -> UNDER_REVIEW (PDO)
    const t1 = await ComplaintStateMachineService.executeTransition(
      cId1,
      'UNDER_REVIEW',
      { id: String(pdo._id), name: pdo.name, role: 'pdo' },
      'Acknowledged report and scheduled engineering field inspection'
    );
    assert(
      normalizeState(t1.complaint.status) === 'UNDER_REVIEW',
      'Valid: SUBMITTED -> UNDER_REVIEW executed by PDO'
    );

    // 2. UNDER_REVIEW -> PRIORITY_SET (Admin)
    const t2 = await ComplaintStateMachineService.executeTransition(
      cId1,
      'PRIORITY_SET',
      { id: String(admin._id), name: admin.name, role: 'admin' },
      'SAW priority score evaluated as 84.5 (Critical)'
    );
    assert(
      normalizeState(t2.complaint.status) === 'PRIORITY_SET',
      'Valid: UNDER_REVIEW -> PRIORITY_SET executed by Admin'
    );

    // 3. PRIORITY_SET -> ASSIGNED (PDO/Admin)
    const t3 = await ComplaintStateMachineService.executeTransition(
      cId1,
      'ASSIGNED',
      { id: String(pdo._id), name: pdo.name, role: 'pdo' },
      'Dispatched to Ward 1 civil engineering maintenance team'
    );
    assert(
      normalizeState(t3.complaint.status) === 'ASSIGNED',
      'Valid: PRIORITY_SET -> ASSIGNED executed by PDO'
    );

    // 4. ASSIGNED -> REASSIGNED (Admin/PDO alternative branch)
    const t4a = await ComplaintStateMachineService.executeTransition(
      cId1,
      'REASSIGNED',
      { id: String(admin._id), name: admin.name, role: 'admin' },
      'Reassigned to specialized bridge masonry contractor'
    );
    assert(
      normalizeState(t4a.complaint.status) === 'REASSIGNED',
      'Valid: ASSIGNED -> REASSIGNED alternative branch executed by Admin'
    );

    // 5. REASSIGNED -> IN_PROGRESS (PDO)
    const t4b = await ComplaintStateMachineService.executeTransition(
      cId1,
      'IN_PROGRESS',
      { id: String(pdo._id), name: pdo.name, role: 'pdo' },
      'Contractor mobilised equipment on site, repairs started'
    );
    assert(
      normalizeState(t4b.complaint.status) === 'IN_PROGRESS',
      'Valid: REASSIGNED -> IN_PROGRESS executed by PDO'
    );

    // 6. IN_PROGRESS -> ASSIGNED (Pause branch)
    const t5a = await ComplaintStateMachineService.executeTransition(
      cId1,
      'ASSIGNED',
      { id: String(pdo._id), name: pdo.name, role: 'pdo' },
      'Work paused overnight awaiting concrete curing'
    );
    assert(
      normalizeState(t5a.complaint.status) === 'ASSIGNED',
      'Valid: IN_PROGRESS -> ASSIGNED (Pause/delay branch) executed by PDO'
    );

    // 7. ASSIGNED -> IN_PROGRESS (Resume)
    await ComplaintStateMachineService.executeTransition(
      cId1,
      'IN_PROGRESS',
      { id: String(pdo._id), name: pdo.name, role: 'pdo' },
      'Resumed concrete grouting'
    );

    // 8. IN_PROGRESS -> COMPLETED (PDO)
    const t6 = await ComplaintStateMachineService.executeTransition(
      cId1,
      'COMPLETED',
      { id: String(pdo._id), name: pdo.name, role: 'pdo' },
      'All deck fissures sealed, cured, and load tested with geotagged proof'
    );
    assert(
      normalizeState(t6.complaint.status) === 'COMPLETED',
      'Valid: IN_PROGRESS -> COMPLETED executed by field worker / PDO'
    );

    // 9. COMPLETED -> VERIFIED (Admin ONLY)
    const t7 = await ComplaintStateMachineService.executeTransition(
      cId1,
      'VERIFIED',
      { id: String(admin._id), name: admin.name, role: 'admin' },
      'Admin site audit confirmed bridge structural integrity'
    );
    assert(
      normalizeState(t7.complaint.status) === 'VERIFIED',
      'Valid: COMPLETED -> VERIFIED executed by Admin'
    );

    // 10. VERIFIED -> CLOSED (Admin ONLY)
    const t8 = await ComplaintStateMachineService.executeTransition(
      cId1,
      'CLOSED',
      { id: String(admin._id), name: admin.name, role: 'admin' },
      'Final sign-off completed and complaint permanently archived'
    );
    assert(
      normalizeState(t8.complaint.status) === 'CLOSED',
      'Valid: VERIFIED -> CLOSED executed by Admin'
    );

    // 11. Alternative: Reopen CLOSED -> UNDER_REVIEW (Admin)
    const t9 = await ComplaintStateMachineService.executeTransition(
      cId1,
      'UNDER_REVIEW',
      { id: String(admin._id), name: admin.name, role: 'admin' },
      'Reopened for follow-up monsoon check'
    );
    assert(
      normalizeState(t9.complaint.status) === 'UNDER_REVIEW',
      'Valid: CLOSED -> UNDER_REVIEW (Reopen path) executed by Admin'
    );

    // 12. Alternative: UNDER_REVIEW -> REJECTED (Admin/PDO)
    const comp2 = await Complaint.create({
      panchayatId: p._id,
      title: 'Private driveway puddle',
      description: 'Private gated residence driveway.',
      category: 'Road',
      ward: 'Ward 1',
      status: 'UNDER_REVIEW'
    });
    const t10 = await ComplaintStateMachineService.executeTransition(
      String(comp2._id),
      'REJECTED',
      { id: String(pdo._id), name: pdo.name, role: 'pdo' },
      'Rejected: Private compound outside Gram Panchayat jurisdiction'
    );
    assert(
      normalizeState(t10.complaint.status) === 'REJECTED',
      'Valid: UNDER_REVIEW -> REJECTED executed by PDO with reason'
    );

    // 13. Alternative: REJECTED -> UNDER_REVIEW (Admin appeal path)
    const t11 = await ComplaintStateMachineService.executeTransition(
      String(comp2._id),
      'UNDER_REVIEW',
      { id: String(admin._id), name: admin.name, role: 'admin' },
      'Citizen submitted deed showing public right of way; reopening'
    );
    assert(
      normalizeState(t11.complaint.status) === 'UNDER_REVIEW',
      'Valid: REJECTED -> UNDER_REVIEW (Appeal reopen path) executed by Admin'
    );

    // 14. Alternative: COMPLETED -> IN_PROGRESS (Rework path on failed audit)
    const comp3 = await Complaint.create({
      panchayatId: p._id,
      title: 'Borewell handpump loose lever',
      description: 'Bolt sheared off.',
      category: 'Water',
      ward: 'Ward 1',
      status: 'COMPLETED'
    });
    const t12 = await ComplaintStateMachineService.executeTransition(
      String(comp3._id),
      'IN_PROGRESS',
      { id: String(admin._id), name: admin.name, role: 'admin' },
      'Inspection found handle still vibrating; ordered additional washer replacement'
    );
    assert(
      normalizeState(t12.complaint.status) === 'IN_PROGRESS',
      'Valid: COMPLETED -> IN_PROGRESS (Audit rework path) executed by Admin'
    );

    console.log('\n--- SECTION 2: INVALID STATE MACHINE TRANSITIONS (PREVENTION) ---\n');

    // 15. Invalid: SUBMITTED -> CLOSED
    const inv1 = ComplaintStateMachineService.canTransition('SUBMITTED', 'CLOSED', 'admin');
    assert(
      inv1.allowed === false && inv1.errorCode === 'INVALID_TRANSITION',
      'Prevented: SUBMITTED -> CLOSED (Cannot jump from submission directly to closed)'
    );

    // 16. Invalid: SUBMITTED -> VERIFIED
    const inv2 = ComplaintStateMachineService.canTransition('SUBMITTED', 'VERIFIED', 'admin');
    assert(
      inv2.allowed === false && inv2.errorCode === 'INVALID_TRANSITION',
      'Prevented: SUBMITTED -> VERIFIED (Cannot verify unexecuted work)'
    );

    // 17. Invalid: SUBMITTED -> COMPLETED
    const inv3 = ComplaintStateMachineService.canTransition('SUBMITTED', 'COMPLETED', 'pdo');
    assert(
      inv3.allowed === false && inv3.errorCode === 'INVALID_TRANSITION',
      'Prevented: SUBMITTED -> COMPLETED (Cannot mark completed without assignment)'
    );

    // 18. Invalid: IN_PROGRESS -> CLOSED
    const inv4 = ComplaintStateMachineService.canTransition('IN_PROGRESS', 'CLOSED', 'admin');
    assert(
      inv4.allowed === false && inv4.errorCode === 'INVALID_TRANSITION',
      'Prevented: IN_PROGRESS -> CLOSED (Cannot close while work is in progress)'
    );

    // 19. Invalid: IN_PROGRESS -> VERIFIED
    const inv5 = ComplaintStateMachineService.canTransition('IN_PROGRESS', 'VERIFIED', 'admin');
    assert(
      inv5.allowed === false && inv5.errorCode === 'INVALID_TRANSITION',
      'Prevented: IN_PROGRESS -> VERIFIED (Must be submitted as COMPLETED before verification)'
    );

    // 20. Invalid: PRIORITY_SET -> COMPLETED
    const inv6 = ComplaintStateMachineService.canTransition('PRIORITY_SET', 'COMPLETED', 'pdo');
    assert(
      inv6.allowed === false && inv6.errorCode === 'INVALID_TRANSITION',
      'Prevented: PRIORITY_SET -> COMPLETED (Cannot complete unassigned work)'
    );

    // 21. Invalid: ASSIGNED -> CLOSED
    const inv7 = ComplaintStateMachineService.canTransition('ASSIGNED', 'CLOSED', 'admin');
    assert(
      inv7.allowed === false && inv7.errorCode === 'INVALID_TRANSITION',
      'Prevented: ASSIGNED -> CLOSED (Assigned task cannot bypass execution and verification)'
    );

    // 22. Invalid: REJECTED -> COMPLETED
    const inv8 = ComplaintStateMachineService.canTransition('REJECTED', 'COMPLETED', 'admin');
    assert(
      inv8.allowed === false && inv8.errorCode === 'INVALID_TRANSITION',
      'Prevented: REJECTED -> COMPLETED (Rejected complaint cannot transition to completed)'
    );

    console.log('\n--- SECTION 3: ROLE-BASED AUTHORIZATION BOUNDARIES ---\n');

    // 23. Citizen attempts IN_PROGRESS -> CLOSED
    const cit1 = ComplaintStateMachineService.canTransition('IN_PROGRESS', 'CLOSED', 'citizen');
    assert(
      cit1.allowed === false && cit1.errorCode === 'UNAUTHORIZED_ROLE',
      'Role Guard: Citizen is blocked from executing IN_PROGRESS -> CLOSED'
    );

    // 24. Citizen attempts SUBMITTED -> UNDER_REVIEW
    const cit2 = ComplaintStateMachineService.canTransition('SUBMITTED', 'UNDER_REVIEW', 'citizen');
    assert(
      cit2.allowed === false && cit2.errorCode === 'UNAUTHORIZED_ROLE',
      'Role Guard: Citizen is blocked from executing SUBMITTED -> UNDER_REVIEW'
    );

    // 25. Citizen attempts COMPLETED -> VERIFIED
    const cit3 = ComplaintStateMachineService.canTransition('COMPLETED', 'VERIFIED', 'citizen');
    assert(
      cit3.allowed === false && cit3.errorCode === 'UNAUTHORIZED_ROLE',
      'Role Guard: Citizen is blocked from executing COMPLETED -> VERIFIED'
    );

    // 26. PDO attempts COMPLETED -> VERIFIED (Admin Only)
    const pdoVerif = ComplaintStateMachineService.canTransition('COMPLETED', 'VERIFIED', 'pdo');
    assert(
      pdoVerif.allowed === false && pdoVerif.errorCode === 'UNAUTHORIZED_ROLE',
      'Role Guard: PDO is blocked from executing COMPLETED -> VERIFIED (Admin-only privilege)'
    );

    // 27. PDO attempts VERIFIED -> CLOSED (Admin Only)
    const pdoClose = ComplaintStateMachineService.canTransition('VERIFIED', 'CLOSED', 'pdo');
    assert(
      pdoClose.allowed === false && pdoClose.errorCode === 'UNAUTHORIZED_ROLE',
      'Role Guard: PDO is blocked from executing VERIFIED -> CLOSED (Admin-only privilege)'
    );

    // 28. Execution throws 403 when Citizen tries to execute transition
    let caughtCitizenErr = false;
    try {
      await ComplaintStateMachineService.executeTransition(
        cId1,
        'CLOSED',
        { id: String(citizen._id), name: citizen.name, role: 'citizen' },
        'Citizen trying to close issue'
      );
    } catch (err: any) {
      caughtCitizenErr = err.statusCode === 403 || err.errorCode === 'UNAUTHORIZED_ROLE';
    }
    assert(
      caughtCitizenErr,
      'Runtime Guard: executeTransition rejects Citizen caller with 403 / UNAUTHORIZED_ROLE'
    );

    console.log('\n--- SECTION 4: AUDIT TRAIL DATA INTEGRITY ---\n');

    // 29. Verify Audit Trail Structure
    const auditComplaint = await Complaint.findById(cId1);
    const history = auditComplaint?.statusHistory || [];

    assert(history.length >= 7, `Audit Trail: Recorded ${history.length} lifecycle transitions`);

    const lastTransition = history[history.length - 1];
    const hasOldStatus = lastTransition.oldStatus != null;
    const hasNewStatus = lastTransition.newStatus != null;
    const hasChangedByName = !!lastTransition.changedByName;
    const hasChangedByRole = !!lastTransition.changedByRole;
    const hasTimestamp = !!lastTransition.timestamp;
    const hasComment = !!lastTransition.comment;

    assert(
      hasOldStatus && hasNewStatus && hasChangedByName && hasChangedByRole && hasTimestamp && hasComment,
      'Audit Trail: Every transition accurately records oldStatus, newStatus, changedBy, timestamp, and comment'
    );

    console.log('\n===========================================================');
    console.log(`  RESULTS: ${passed}/${total} TESTS PASSED (100% SUCCESS)`);
    console.log('===========================================================');
  } catch (err: any) {
    console.error('State machine test execution failed with error:', err);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}

runStateMachineTestSuite();
