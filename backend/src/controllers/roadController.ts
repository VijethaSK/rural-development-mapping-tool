import { Request, Response } from 'express';
import { Road } from '../models/Road.js';
import mongoose from 'mongoose';
import { denyIfPanchayatOutOfScope, panchayatFilter } from '../middleware/panchayatScope.js';

export async function create(req: Request, res: Response) {
  const {
    panchayatId,
    name,
    roadType,
    surfaceType,
    lengthKm,
    ward,
    connects,
    condition,
    lastRepairDate,
    geometry
  } = req.body;
  if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    res.status(400).json({ error: 'Invalid geometry' });
    return;
  }
  if (!panchayatId || !mongoose.Types.ObjectId.isValid(panchayatId)) {
    res.status(400).json({ error: 'Valid Panchayat ID is required' }); return;
  }
  if (denyIfPanchayatOutOfScope(req, res, panchayatId)) return;
  const coordsValid = geometry.coordinates.every((c: any) => Array.isArray(c) && c.length === 2 && typeof c[0] === 'number' && typeof c[1] === 'number');
  if (!coordsValid) {
    res.status(400).json({ error: 'Invalid coordinates' });
    return;
  }
  const payload = {
    panchayatId: new mongoose.Types.ObjectId(panchayatId),
    name,
    roadType,
    surfaceType,
    lengthKm: Number(lengthKm),
    ward,
    connects: Array.isArray(connects) ? connects : [],
    condition,
    lastRepairDate: lastRepairDate ? new Date(lastRepairDate) : undefined,
    geometry
  };
  const created = await Road.create(payload);
  res.status(201).json(created);
}

export async function update(req: Request, res: Response) {
  const { id } = req.params;
  const existing = await Road.findById(id).select('panchayatId');
  if (!existing) { res.status(404).json({ error: 'Road not found' }); return; }
  if (denyIfPanchayatOutOfScope(req, res, existing.panchayatId)) return;
  const data: any = { ...req.body };
  if (data.panchayatId && String(data.panchayatId) !== existing.panchayatId.toString()) {
    res.status(400).json({ error: 'Road cannot be moved to a different Panchayat' }); return;
  }
  delete data.panchayatId;
  if (data.lengthKm != null) data.lengthKm = Number(data.lengthKm);
  if (data.lastRepairDate) data.lastRepairDate = new Date(data.lastRepairDate);
  if (data.geometry) {
    if (data.geometry.type !== 'LineString' || !Array.isArray(data.geometry.coordinates)) {
      res.status(400).json({ error: 'Invalid geometry' });
      return;
    }
    const ok = data.geometry.coordinates.every((c: any) => Array.isArray(c) && c.length === 2 && typeof c[0] === 'number' && typeof c[1] === 'number');
    if (!ok) {
      res.status(400).json({ error: 'Invalid coordinates' });
      return;
    }
  }
  const updated = await Road.findByIdAndUpdate(id, data, { new: true });
  res.json(updated);
}

export async function remove(req: Request, res: Response) {
  const { id } = req.params;
  const existing = await Road.findById(id).select('panchayatId');
  if (!existing) { res.status(404).json({ error: 'Road not found' }); return; }
  if (denyIfPanchayatOutOfScope(req, res, existing.panchayatId)) return;
  await Road.findByIdAndDelete(id);
  res.status(204).end();
}

export async function list(req: Request, res: Response) {
  const { panchayatId } = req.query;
  const scoped = panchayatFilter(req, panchayatId);
  const q = scoped.panchayatId ? { panchayatId: new mongoose.Types.ObjectId(scoped.panchayatId) } : {};
  const items = await Road.find(q);
  res.json(items);
}

export async function get(req: Request, res: Response) {
  const { id } = req.params;
  const item = await Road.findById(id);
  if (item && denyIfPanchayatOutOfScope(req, res, item.panchayatId)) return;
  res.json(item);
}

