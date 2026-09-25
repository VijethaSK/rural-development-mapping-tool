import { Request, Response } from 'express';
import { Panchayat } from '../models/Panchayat.js';
import { School } from '../models/School.js';
import { Road } from '../models/Road.js';
import { IssueReport } from '../models/IssueReport.js';
import mongoose from 'mongoose';
import { denyIfPanchayatOutOfScope, panchayatFilter } from '../middleware/panchayatScope.js';

function connected(): boolean {
  return mongoose.connection.readyState === 1;
}

function memIssues() {
  const g: any = globalThis as any;
  if (!g._memIssues) g._memIssues = [] as any[];
  return g._memIssues as any[];
}

export async function listPanchayats(req: Request, res: Response) {
  if (!connected()) {
    const fallback = [{
      _id: 'p1',
      name: 'Varthur Gram Panchayat',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      wards: ['Ward 1','Ward 2','Ward 3'],
      centerCoord: { lat: 12.9489, lng: 77.7479 }
    }];
    try {
      const scope = panchayatFilter(req);
      res.json(scope.panchayatId ? fallback.filter((item) => item._id === scope.panchayatId) : fallback);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to list Panchayats' });
    }
    return;
  }
  try {
    const scope = panchayatFilter(req);
    // Panchayat documents are scoped by their own _id. `panchayatId` is the
    // foreign-key field used on child collections, not on Panchayat records.
    const items = await Panchayat.find(scope.panchayatId ? { _id: scope.panchayatId } : {});
    res.json(items);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to list Panchayats' });
  }
}

export async function createPanchayat(req: Request, res: Response) {
  if (req.user?.panchayatId) { res.status(403).json({ error: 'Only a system-wide administrator may create a Panchayat' }); return; }
  const p = await Panchayat.create(req.body);
  res.status(201).json(p);
}

export async function listSchools(req: Request, res: Response) {
  const { id } = req.params;
  if (denyIfPanchayatOutOfScope(req, res, id)) return;
  if (!connected()) {
    res.json([
      { _id: 's1', panchayatId: id, name: 'Govt Primary School', type: 'Primary', management: 'Govt', medium: 'Kannada', classesFrom: 1, classesTo: 5, studentCount: 200, staffCount: 8, ward: 'Ward 1', village: 'Varthur', location: { lat: 12.95, lng: 77.75 }, facilities: { toilets: 'Available', drinkingWater: true, playground: true, boundaryWall: false } }
    ]);
    return;
  }
  const items = await School.find({ panchayatId: new mongoose.Types.ObjectId(id) });
  res.json(items);
}

export async function listRoads(req: Request, res: Response) {
  const { id } = req.params;
  if (denyIfPanchayatOutOfScope(req, res, id)) return;
  if (!connected()) {
    res.json([
      { _id: 'r1', panchayatId: id, name: 'Main Road', roadType: 'Panchayat', surfaceType: 'Paved', lengthKm: 2.5, ward: 'Ward 1', connects: ['Market','School'], condition: 'Good', geometry: { type: 'LineString', coordinates: [[77.747,12.948],[77.748,12.949]] } }
    ]);
    return;
  }
  const items = await Road.find({ panchayatId: new mongoose.Types.ObjectId(id) });
  res.json(items);
}

export async function listIssues(req: Request, res: Response) {
  const { id } = req.params;
  if (denyIfPanchayatOutOfScope(req, res, id)) return;
  if (!connected()) {
    const items = memIssues().filter(i => String(i.panchayatId) === String(id));
    res.json(items);
    return;
  }
  const items = await IssueReport.find({ panchayatId: new mongoose.Types.ObjectId(id) });
  res.json(items);
}

export async function reportIssue(req: Request, res: Response) {
  const { id } = req.params;
  if (denyIfPanchayatOutOfScope(req, res, id)) return;
  const { status: _ignoredStatus, statusHistory: _ignoredHistory, ...input } = req.body || {};
  const payload = { ...input, panchayatId: id, status: 'SUBMITTED' } as any;
  if (!connected()) {
    const created = { ...payload, _id: String(Date.now()), createdAt: new Date(), updatedAt: new Date() };
    memIssues().push(created);
    res.status(201).json(created);
    return;
  }
  const created = await IssueReport.create(payload);
  res.status(201).json(created);
}
