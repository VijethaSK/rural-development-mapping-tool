import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createComplaint } from './controllers/citizenComplaintController.js';
import { listPanchayats } from './controllers/panchayatController.js';
import { Complaint } from './models/Complaint.js';
import { Infrastructure } from './models/Infrastructure.js';
import { Panchayat } from './models/Panchayat.js';
import { CitizenUser } from './models/User.js';

const panchayatA = '64b000000000000000000001';
const panchayatB = '64b000000000000000000002';
const assetA = '64b000000000000000000011';
const assetB = '64b000000000000000000012';
const assetMissingCount = '64b000000000000000000013';
const assetZeroCount = '64b000000000000000000014';
const assetFiveCount = '64b000000000000000000015';
const citizenId = '64b000000000000000000021';

function response() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; }
  };
}

function request(panchayatId: unknown, infrastructureId?: string, role = 'citizen') {
  return {
    user: { id: citizenId, role, panchayatId: panchayatA, name: 'Citizen' },
    body: {
      panchayatId, title: 'Pothole', description: 'A dangerous pothole needs repair.',
      category: 'Road', ward: 'Ward 2', village: 'Village B', infrastructureId,
      location: { type: 'Point', coordinates: [77.12, 12.34] }
    }
  } as any;
}

async function main() {
  const originals = {
    panchayatExists: Panchayat.exists,
    panchayatFind: Panchayat.find,
    infrastructureExists: Infrastructure.exists,
    infrastructureFindOne: Infrastructure.findOne,
    infrastructureUpdate: Infrastructure.updateOne,
    complaintSave: Complaint.prototype.save,
    complaintFindById: Complaint.findById,
    citizenUpdate: CitizenUser.findByIdAndUpdate,
    readyState: mongoose.connection.readyState
  };

  const knownPanchayats = new Set([panchayatA, panchayatB]);
  const linkedAssets = new Map([
    [assetA, panchayatA], [assetB, panchayatB],
    [assetMissingCount, panchayatA], [assetZeroCount, panchayatA], [assetFiveCount, panchayatA]
  ]);
  const infrastructureCounts = new Map<string, number | null>([
    [assetA, null], [assetB, 0], [assetZeroCount, 0], [assetFiveCount, 5]
  ]);
  let saved: any = null;
  const citizenUpdates: unknown[] = [];
  const infrastructureUpdates: unknown[] = [];

  try {
    (mongoose.connection as any).readyState = 1;
    (Panchayat as any).exists = async ({ _id }: any) => knownPanchayats.has(String(_id)) ? { _id } : null;
    (Panchayat as any).find = async (filter: any) => {
      assert.deepEqual(filter, {}, 'citizen Panchayat list is not narrowed to their account Panchayat');
      return [{ _id: panchayatA, name: 'Panchayat A' }, { _id: panchayatB, name: 'Panchayat B' }];
    };
    (Infrastructure as any).exists = async ({ _id, panchayatId }: any) =>
      linkedAssets.get(String(_id)) === String(panchayatId) ? { _id } : null;
    (Infrastructure as any).findOne = async () => null;
    (Infrastructure as any).updateOne = async (filter: any, update: any) => {
      infrastructureUpdates.push([filter, update]);
      assert.equal(String(filter.panchayatId), linkedAssets.get(String(filter._id)), 'counter update stays scoped to the selected Panchayat');
      assert.deepEqual(update, [{
        $set: { complaintsCount: { $add: [{ $ifNull: ['$complaintsCount', 0] }, 1] } }
      }], 'counter uses the null-safe atomic update pipeline');
      const current = infrastructureCounts.get(String(filter._id));
      infrastructureCounts.set(String(filter._id), (current ?? 0) + 1);
      return { matchedCount: 1, modifiedCount: 1 };
    };
    (CitizenUser as any).findByIdAndUpdate = async (...args: unknown[]) => { citizenUpdates.push(args); };
    (Complaint.prototype as any).save = async function () { saved = this; return this; };
    (Complaint as any).findById = () => ({
      populate() { return this; },
      async lean() { return saved?.toObject(); }
    });

    const listRes = response();
    await listPanchayats({ user: { role: 'citizen', panchayatId: panchayatA } } as any, listRes as any);
    assert.equal(listRes.statusCode, 200);
    assert.deepEqual(listRes.body.map((item: any) => item._id), [panchayatA, panchayatB]);

    for (const [target, linkedAsset] of [[panchayatA, assetA], [panchayatB, assetB]] as const) {
      saved = null;
      const res = response();
      const req = request(target, linkedAsset);
      await createComplaint(req, res as any);
      assert.equal(res.statusCode, 201, `citizen can submit to ${target}`);
      assert.equal(String(res.body.complaint.panchayatId), target, `complaint target is ${target}`);
      assert.equal(String(req.user.panchayatId), panchayatA, 'stored account Panchayat remains unchanged');
      assert.equal(String(saved.panchayatId), target);
      assert.equal(String(saved.infrastructureId), linkedAsset, 'matching selected-Panchayat asset is retained');
      assert.deepEqual(saved.location.coordinates, [77.12, 12.34], 'explicit user location is preserved');
    }
    assert.equal(infrastructureCounts.get(assetA), 1, 'null counter becomes 1 after Adyar complaint submission');
    assert.equal(infrastructureCounts.get(assetB), 1, 'zero counter becomes 1 after Panchayat B complaint submission');

    const counterCases: Array<[string, string, number]> = [
      ['missing counter', assetMissingCount, 1],
      ['zero counter', assetZeroCount, 1],
      ['existing numeric counter', assetFiveCount, 6]
    ];
    for (const [label, assetId, expectedCount] of counterCases) {
      const res = response();
      await createComplaint(request(panchayatA, assetId), res as any);
      assert.equal(res.statusCode, 201, `${label} still permits complaint submission`);
      assert.equal(infrastructureCounts.get(assetId), expectedCount, `${label} increments null-safely`);
      assert.equal(String(res.body.complaint.panchayatId), panchayatA, `${label} keeps Adyar as the complaint Panchayat`);
    }

    let res = response();
    await createComplaint(request(undefined), res as any);
    assert.equal(res.statusCode, 400, 'missing selected Panchayat is rejected');

    res = response();
    await createComplaint(request('bad-id'), res as any);
    assert.equal(res.statusCode, 400, 'malformed Panchayat ID is rejected before database casting');

    res = response();
    await createComplaint(request('64b000000000000000000099'), res as any);
    assert.equal(res.statusCode, 400, 'unknown but well-formed Panchayat ID is rejected');

    res = response();
    await createComplaint(request(panchayatA, assetB), res as any);
    assert.equal(res.statusCode, 400, 'asset from another Panchayat is rejected');

    res = response();
    await createComplaint(request(panchayatA, 'bad-asset-id'), res as any);
    assert.equal(res.statusCode, 400, 'malformed linked infrastructure ID is rejected');

    res = response();
    const invalidRole = request(panchayatB, undefined, 'pdo');
    await createComplaint(invalidRole, res as any);
    assert.equal(res.statusCode, 403, 'PDO submission remains forbidden');

    res = response();
    const invalidAdmin = request(panchayatB, undefined, 'admin');
    await createComplaint(invalidAdmin, res as any);
    assert.equal(res.statusCode, 403, 'admin submission behavior remains forbidden');

    res = response();
    const missingDescription = request(panchayatA);
    delete missingDescription.body.description;
    await createComplaint(missingDescription, res as any);
    assert.equal(res.statusCode, 400, 'existing complaint required-field validation remains active');

    res = response();
    const missingCategory = request(panchayatA);
    delete missingCategory.body.category;
    await createComplaint(missingCategory, res as any);
    assert.equal(res.statusCode, 400, 'category validation remains active');

    assert.equal(citizenUpdates.length, 5, 'only successful citizen complaints update citizen statistics');
    assert.equal(infrastructureUpdates.length, 5, 'only valid linked assets update their complaint tally');
    console.log('PASS: citizen grievance Panchayat selection, validation, asset scope, and role guards.');
  } finally {
    (Panchayat as any).exists = originals.panchayatExists;
    (Panchayat as any).find = originals.panchayatFind;
    (Infrastructure as any).exists = originals.infrastructureExists;
    (Infrastructure as any).findOne = originals.infrastructureFindOne;
    (Infrastructure as any).updateOne = originals.infrastructureUpdate;
    (Complaint.prototype as any).save = originals.complaintSave;
    (Complaint as any).findById = originals.complaintFindById;
    (CitizenUser as any).findByIdAndUpdate = originals.citizenUpdate;
    (mongoose.connection as any).readyState = originals.readyState;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
