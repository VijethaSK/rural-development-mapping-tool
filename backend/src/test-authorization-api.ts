import assert from 'node:assert/strict';
import { connectDb, disconnectDb } from './config/db.js';
import app from './app.js';
import { Panchayat } from './models/Panchayat.js';
import { User } from './models/User.js';
import { Road } from './models/Infrastructure.js';
import { Assignment } from './models/Assignment.js';
import { signToken } from './utils/jwt.js';

async function run() {
  await connectDb(true);
  let server: ReturnType<typeof app.listen> | undefined;
  try {
    await Promise.all([Panchayat.deleteMany({}), User.deleteMany({}), Road.deleteMany({}), Assignment.deleteMany({})]);
    const [gpA, gpB] = await Promise.all([
      Panchayat.create({ name: 'Test GP A', district: 'Test', state: 'Karnataka', wards: ['Ward 1'], centerCoord: { lat: 12.9, lng: 77.7 } }),
      Panchayat.create({ name: 'Test GP B', district: 'Test', state: 'Karnataka', wards: ['Ward 1'], centerCoord: { lat: 13, lng: 77.8 } })
    ]);
    const [pdoA, pdoB, adminA, adminB] = await Promise.all([
      User.create({ name: 'PDO A', email: 'pdo-a@test.invalid', passwordHash: 'test', role: 'pdo', panchayatId: gpA._id }),
      User.create({ name: 'PDO B', email: 'pdo-b@test.invalid', passwordHash: 'test', role: 'pdo', panchayatId: gpB._id }),
      User.create({ name: 'Admin A', email: 'admin-a@test.invalid', passwordHash: 'test', role: 'admin', panchayatId: gpA._id }),
      User.create({ name: 'Admin B', email: 'admin-b@test.invalid', passwordHash: 'test', role: 'admin', panchayatId: gpB._id })
    ]);
    const [roadA, roadB] = await Promise.all([
      Road.create({ panchayatId: gpA._id, name: 'Ward A Road', ward: 'Ward 1', condition: 'Poor', geometry: { type: 'LineString', coordinates: [[77.7, 12.9], [77.701, 12.901]] } }),
      Road.create({ panchayatId: gpB._id, name: 'Ward B Road', ward: 'Ward 1', condition: 'Poor', geometry: { type: 'LineString', coordinates: [[77.8, 13], [77.801, 13.001]] } })
    ]);
    const foreignAssignment = await Assignment.create({
      panchayatId: gpB._id,
      assignmentNumber: 'AUTH-TEST-B',
      title: 'GP B work',
      infrastructureId: roadB._id,
      assignedMember: pdoB._id,
      assignedBy: adminB._id
    });

    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const address = server.address();
    assert(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const tokenFor = (user: any, claimedRole = user.role) => signToken({ id: String(user._id), role: claimedRole });
    const call = (path: string, user: any, claimedRole?: string, init: RequestInit = {}) => fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${tokenFor(user, claimedRole)}`, ...(init.headers || {}) }
    });

    let response = await call(`/panchayats/${gpA._id}/roads`, pdoA);
    assert.equal(response.status, 200, 'PDO can read roads in own Panchayat');
    const ownRoads: any[] = await response.json();
    assert(ownRoads.some((road) => String(road._id) === String(roadA._id)));

    response = await call(`/panchayats/${gpB._id}/roads`, pdoA);
    assert.equal(response.status, 403, 'PDO cannot read another Panchayat roads');
    response = await call(`/api/priorities?panchayatId=${gpB._id}`, pdoA);
    assert.equal(response.status, 403, 'PDO cannot query priorities for another Panchayat');
    response = await call('/admin/roads', pdoA, 'admin');
    assert.equal(response.status, 403, 'role claimed in JWT cannot elevate a PDO account');
    response = await call(`/api/assignments/${foreignAssignment._id}`, pdoA);
    assert.equal(response.status, 403, 'PDO cannot read another Panchayat assignment');
    response = await call(`/api/assignments/${foreignAssignment._id}/action`, pdoA, undefined, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete' })
    });
    assert.equal(response.status, 403, 'PDO cannot complete another Panchayat assignment');
    response = await call(`/api/assignments/${foreignAssignment._id}/status`, adminA, undefined, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Verified' })
    });
    assert.equal(response.status, 403, 'Panchayat admin cannot verify another Panchayat assignment');
    response = await call(`/api/assignments`, pdoA, undefined, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Unauthorized cross-GP assignment', infrastructureId: String(roadB._id) })
    });
    assert.equal(response.status, 403, 'PDO cannot create an assignment for another Panchayat infrastructure');
    response = await call(`/api/assignments`, pdoA, undefined, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Allowed own-GP assignment', infrastructureId: String(roadA._id) })
    });
    assert.equal(response.status, 201, 'PDO can create an assignment for own Panchayat infrastructure');
    const ownAssignment: any = await response.json();
    for (const action of ['accept', 'start']) {
      response = await call(`/api/assignments/${ownAssignment._id}/action`, pdoA, undefined, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action })
      });
      assert.equal(response.status, 200, `Assigned PDO can perform own assignment action: ${action}`);
    }
    response = await call(`/api/assignments/${ownAssignment._id}/action`, pdoA, undefined, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        action: 'complete', notes: 'Test completion evidence',
        completionImages: [{ url: '/test/completion.jpg' }],
        completionLocation: { coordinates: [77.701, 12.901] }
      })
    });
    assert.equal(response.status, 200, 'PDO can complete own assignment with evidence');
    response = await call(`/api/assignments/${ownAssignment._id}/action`, adminA, undefined, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify', notes: 'Test admin verification' })
    });
    assert.equal(response.status, 200, 'Panchayat admin can verify an assignment in own Panchayat');
    response = await call(`/admin/roads`, adminA);
    assert.equal(response.status, 200, 'Panchayat admin can use admin API in own Panchayat');
    response = await call(`/panchayats/${gpB._id}/roads`, adminA);
    assert.equal(response.status, 403, 'Panchayat admin cannot read another Panchayat roads');

    console.log('PASS: API role enforcement, DB-authoritative role, allowed own-GP reads/writes, and cross-GP denies verified.');
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
