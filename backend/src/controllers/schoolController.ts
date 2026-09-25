import { Request, Response } from 'express';
import { School } from '../models/School.js';
import { denyIfPanchayatOutOfScope, panchayatFilter } from '../middleware/panchayatScope.js';

export async function create(req: Request, res: Response) {
  if (denyIfPanchayatOutOfScope(req, res, req.body.panchayatId)) return;
  const created = await School.create(req.body);
  res.status(201).json(created);
}

export async function update(req: Request, res: Response) {
  const { id } = req.params;
  const existing = await School.findById(id).select('panchayatId');
  if (!existing) { res.status(404).json({ error: 'School not found' }); return; }
  if (denyIfPanchayatOutOfScope(req, res, existing.panchayatId)) return;
  if (req.body.panchayatId && String(req.body.panchayatId) !== existing.panchayatId.toString()) {
    res.status(400).json({ error: 'School cannot be moved to a different Panchayat' }); return;
  }
  const updated = await School.findByIdAndUpdate(id, req.body, { new: true });
  res.json(updated);
}

export async function remove(req: Request, res: Response) {
  const { id } = req.params;
  const existing = await School.findById(id).select('panchayatId');
  if (!existing) { res.status(404).json({ error: 'School not found' }); return; }
  if (denyIfPanchayatOutOfScope(req, res, existing.panchayatId)) return;
  await School.findByIdAndDelete(id);
  res.status(204).end();
}

export async function list(req: Request, res: Response) {
  const filter = panchayatFilter(req, req.query.panchayatId);
  const items = await School.find(filter);
  res.json(items);
}

export async function get(req: Request, res: Response) {
  const { id } = req.params;
  const item = await School.findById(id);
  if (item && denyIfPanchayatOutOfScope(req, res, item.panchayatId)) return;
  res.json(item);
}
