import { Request, Response } from 'express';
import { IssueReport } from '../models/IssueReport.js';
import mongoose from 'mongoose';
import { denyIfPanchayatOutOfScope } from '../middleware/panchayatScope.js';
import { ComplaintStateMachineService } from '../services/complaints/complaintStateMachine.js';

function connected(): boolean {
  return mongoose.connection.readyState === 1;
}

function memIssues() {
  const g: any = globalThis as any;
  if (!g._memIssues) g._memIssues = [] as any[];
  return g._memIssues as any[];
}

export async function updateStatus(req: Request, res: Response) {
  const { id } = req.params;
  const { status, notes } = req.body as { status: string; notes?: string };
  const existing = await IssueReport.findById(id).select('panchayatId');
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  if (denyIfPanchayatOutOfScope(req, res, existing.panchayatId)) return;
  try {
    const user = req.user;
    if (!user?.id || !status) { res.status(400).json({ error: 'Authenticated actor and target status are required' }); return; }
    const result = await ComplaintStateMachineService.executeTransition(id, status, {
      id: user.id, name: user.name || '', role: user.role
    }, notes);
    res.json(result.complaint);
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message, errorCode: error.errorCode });
  }
}

export async function remove(req: Request, res: Response) {
  const { id } = req.params;
  if (!connected()) {
    const list = memIssues();
    const before = list.length;
    const existing = list.find(i => String(i._id) === String(id));
    if (!existing) { res.status(404).end(); return; }
    if (denyIfPanchayatOutOfScope(req, res, existing.panchayatId)) return;
    const after = list.filter(i => String(i._id) !== String(id));
    (globalThis as any)._memIssues = after;
    res.status(before === after.length ? 404 : 204).end();
    return;
  }
  const existing = await IssueReport.findById(id).select('panchayatId');
  if (!existing) { res.status(404).end(); return; }
  if (denyIfPanchayatOutOfScope(req, res, existing.panchayatId)) return;
  await IssueReport.findByIdAndDelete(id);
  res.status(204).end();
}
