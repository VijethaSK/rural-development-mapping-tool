import assert from 'node:assert/strict';
import { connectDb, disconnectDb } from './config/db.js';
import { Panchayat } from './models/Panchayat.js';
import { Complaint } from './models/Complaint.js';
import { Infrastructure } from './models/Infrastructure.js';
import { Assignment } from './models/Assignment.js';
import { AdminUser, PdoUser, CitizenUser } from './models/User.js';
import { AssignmentStateMachineService } from './services/assignments/assignmentStateMachine.js';
import { ComplaintStateMachineService, normalizeState } from './services/complaints/complaintStateMachine.js';
import { assertPanchayatAccess } from './middleware/panchayatScope.js';
import { normalizeLifecycleStatuses } from './services/lifecycleStatusMigration.js';
import { updateComplaintStatus } from './controllers/citizenComplaintController.js';
import { reportIssue } from './controllers/panchayatController.js';

async function main() {
  await connectDb(true);
  try {
    const p = await Panchayat.create({ name: 'Lifecycle Test Panchayat', district: 'Udupi', state: 'Karnataka', wards: ['Ward 1'], centerCoord: { lat: 13.34, lng: 74.74 } });
    const admin = await AdminUser.create({ name: 'Demo Admin', email: 'admin@lifecycle.test', passwordHash: 'test', role: 'admin', panchayatId: p._id });
    const pdo = await PdoUser.create({ name: 'Demo PDO', email: 'pdo@lifecycle.test', passwordHash: 'test', role: 'pdo', panchayatId: p._id, designation: 'PDO' });
    const citizen = await CitizenUser.create({ name: 'Demo Citizen', email: 'citizen@lifecycle.test', passwordHash: 'test', role: 'citizen', panchayatId: p._id });
    const infra = await Infrastructure.create({ panchayatId: p._id, name: 'Ward 1 Road', type: 'Road', ward: 'Ward 1', condition: 'Poor', status: 'Needs_Maintenance' });
    let publicCreated: any;
    await reportIssue({ params: { id: String(p._id) }, user: { id: String(citizen._id), role: 'citizen', panchayatId: String(p._id) }, body: { title: 'Forged lifecycle test', description: 'User supplied status should be ignored', category: 'Road', ward: 'Ward 1', status: 'VERIFIED', statusHistory: [{ status: 'VERIFIED' }] } } as any, { status: () => ({ json: (item: any) => { publicCreated = item; } }), json: (item: any) => { publicCreated = item; } } as any);
    assert.equal(publicCreated.status, 'SUBMITTED');
    assert.equal(publicCreated.statusHistory.length, 1);
    const complaint = await Complaint.create({ panchayatId: p._id, infrastructureId: infra._id, title: 'Test pothole', description: 'Lifecycle test', category: 'Road', ward: 'Ward 1', status: 'SUBMITTED' });
    const actor = (user: any) => ({ id: String(user._id), name: user.name, role: user.role });

    await ComplaintStateMachineService.executeTransition(String(complaint._id), 'UNDER_REVIEW', actor(pdo));
    await ComplaintStateMachineService.executeTransition(String(complaint._id), 'PRIORITY_SET', actor(admin));
    const assignment = await Assignment.create({ panchayatId: p._id, assignmentNumber: 'LIFECYCLE-1', title: 'Repair', infrastructureId: infra._id, complaintId: complaint._id, assignedMember: pdo._id, assignedBy: admin._id, scheduledDate: new Date(), status: 'Assigned' });
    await ComplaintStateMachineService.executeTransition(String(complaint._id), 'ASSIGNED', actor(admin));
    await AssignmentStateMachineService.transition(assignment, 'Accepted', actor(pdo));
    await AssignmentStateMachineService.transition(assignment, 'In_Progress', actor(pdo));
    await ComplaintStateMachineService.executeTransition(String(complaint._id), 'IN_PROGRESS', actor(pdo));
    await assert.rejects(() => AssignmentStateMachineService.transition(assignment, 'Verified', actor(admin)), /not allowed/);
    const other = await Panchayat.create({ name: 'Other Panchayat', district: 'Udupi', state: 'Karnataka', wards: ['Ward 1'], centerCoord: { lat: 13.35, lng: 74.75 } });
    assert.throws(() => assertPanchayatAccess({ user: { id: String(pdo._id), role: 'pdo', panchayatId: String(p._id) } } as any, other._id), /Forbidden/);
    let deniedStatus = 200;
    await updateComplaintStatus({
      params: { id: String(complaint._id) }, body: { status: 'CLOSED' },
      user: { id: String(pdo._id), role: 'pdo', name: pdo.name, panchayatId: String(other._id) }
    } as any, { status: (code: number) => { deniedStatus = code; return { json: () => undefined }; }, json: () => undefined } as any);
    assert.equal(deniedStatus, 403);
    const evidence = { notes: 'Repaired and inspected', completionImages: [{ url: '/test/proof.jpg' }], completionLocation: { type: 'Point' as const, coordinates: [74.74, 13.34] } };
    await AssignmentStateMachineService.transition(assignment, 'Completed', actor(pdo), evidence);
    await ComplaintStateMachineService.executeTransition(String(complaint._id), 'COMPLETED', actor(pdo));

    assert.equal(ComplaintStateMachineService.canTransition('COMPLETED', 'CLOSED', 'admin').allowed, false);
    assert.equal(ComplaintStateMachineService.canTransition('SUBMITTED', 'UNDER_REVIEW', 'citizen').allowed, false);
    await assert.rejects(() => AssignmentStateMachineService.transition(assignment, 'Verified', actor(pdo)), /not allowed/);
    assert.equal(normalizeState('Resolved'), 'COMPLETED');
    assert.equal(ComplaintStateMachineService.canTransition('Resolved', 'CLOSED', 'admin').allowed, false);
    assert.throws(() => normalizeState('mystery-status'), /Unknown complaint status/);

    await AssignmentStateMachineService.transition(assignment, 'Verified', actor(admin), { verificationNotes: 'Evidence checked' });
    await ComplaintStateMachineService.executeTransition(String(complaint._id), 'VERIFIED', actor(admin));
    await ComplaintStateMachineService.executeTransition(String(complaint._id), 'CLOSED', actor(admin));
    assert.equal(normalizeState((await Complaint.findById(complaint._id))!.status), 'CLOSED');
    await Complaint.collection.updateOne({ _id: complaint._id }, { $set: { status: 'Resolved' } });
    await Assignment.collection.updateOne({ _id: assignment._id }, { $set: { status: 'In Progress' } });
    const migration = await normalizeLifecycleStatuses(true);
    assert.equal(migration.unknown.length, 0);
    assert.equal(normalizeState((await Complaint.findById(complaint._id))!.status), 'COMPLETED');
    const legacyAssignment = (await Assignment.findById(assignment._id))!;
    assert.equal(legacyAssignment.status, 'In_Progress');
    assert.equal(AssignmentStateMachineService.normalizeStatus('In Progress'), 'In_Progress');
    await assert.rejects(() => AssignmentStateMachineService.transition(legacyAssignment, 'Verified', actor(admin)), /not allowed/);
    assert.equal(ComplaintStateMachineService.canTransition('Resolved', 'CLOSED', 'admin').allowed, false);
    await Complaint.collection.updateOne({ _id: complaint._id }, { $set: { status: 'mystery-status' } });
    const unknownPlan = await normalizeLifecycleStatuses(true);
    assert.ok(unknownPlan.unknown.some((value) => value.includes('mystery-status')));
    assert.equal((await Complaint.collection.findOne({ _id: complaint._id }))?.status, 'mystery-status');
    console.log('Canonical complaint and assignment lifecycle tests passed.');
  } finally { await disconnectDb(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
