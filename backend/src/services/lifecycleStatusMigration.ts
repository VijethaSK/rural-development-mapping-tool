import { Complaint } from '../models/Complaint.js';
import { Assignment } from '../models/Assignment.js';
import { normalizeState } from './complaints/complaintStateMachine.js';
import { normalizeAssignmentStatus } from './assignments/assignmentStateMachine.js';

/** Dry-run unless apply=true. Unknown values abort before any write; history is retained and extended. */
export async function normalizeLifecycleStatuses(apply = false): Promise<{ complaints: number; assignments: number; unknown: string[] }> {
  const complaints = await Complaint.find({}).lean();
  const assignments = await Assignment.find({}).lean();
  const complaintPlans: Array<{ row: any; status: string }> = [];
  const assignmentPlans: Array<{ row: any; status: string }> = [];
  const unknown: string[] = [];
  for (const row of complaints) {
    try { const status = normalizeState(String(row.status)); if (status !== row.status) complaintPlans.push({ row, status }); }
    catch { unknown.push(`complaint:${row._id}:${row.status}`); }
  }
  for (const row of assignments) {
    try { const status = normalizeAssignmentStatus(String(row.status)); if (status !== row.status) assignmentPlans.push({ row, status }); }
    catch { unknown.push(`assignment:${row._id}:${row.status}`); }
  }
  if (unknown.length) return { complaints: 0, assignments: 0, unknown };
  if (apply) {
    for (const { row, status } of complaintPlans) {
      const history = [...(row.statusHistory || []), {
        oldStatus: row.status, fromStatus: row.status, newStatus: status, toStatus: status, status,
        changedByName: 'Lifecycle status normalization', changedByRole: 'system',
        comment: `Legacy status normalized from '${row.status}' to '${status}'.`,
        notes: `Legacy status normalized from '${row.status}' to '${status}'.`, timestamp: new Date()
      }];
      await Complaint.collection.updateOne({ _id: row._id }, { $set: { status, statusHistory: history } });
    }
    for (const { row, status } of assignmentPlans) {
      const history = [...(row.statusHistory || []), {
        fromStatus: row.status, toStatus: status, changedByName: 'Lifecycle status normalization',
        changedByRole: 'system', notes: `Legacy status normalized from '${row.status}' to '${status}'.`, timestamp: new Date()
      }];
      await Assignment.collection.updateOne({ _id: row._id }, { $set: { status, statusHistory: history } });
    }
  }
  return { complaints: complaintPlans.length, assignments: assignmentPlans.length, unknown };
}
