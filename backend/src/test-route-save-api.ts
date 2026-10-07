import assert from 'node:assert/strict';
import { connectDb, disconnectDb } from './config/db.js';
import app from './app.js';
import { Panchayat } from './models/Panchayat.js';
import { User } from './models/User.js';
import { Road } from './models/Infrastructure.js';
import { Route } from './models/Route.js';
import { signToken } from './utils/jwt.js';

async function run() {
  await connectDb(true);
  let server: ReturnType<typeof app.listen> | undefined;
  try {
    await Promise.all([Panchayat.deleteMany({}), User.deleteMany({}), Road.deleteMany({}), Route.deleteMany({})]);
    const [pa, pb] = await Promise.all([
      Panchayat.create({ name: 'Route Test GP A', district: 'Test', state: 'Karnataka', centerCoord: { lat: 12.9, lng: 77.7 } }),
      Panchayat.create({ name: 'Route Test GP B', district: 'Test', state: 'Karnataka', centerCoord: { lat: 13, lng: 77.8 } })
    ]);
    const [pdoA, pdoB, adminA] = await Promise.all([
      User.create({ name: 'PDO A', email: 'route-pdo-a@test.invalid', passwordHash: 'test', role: 'pdo', panchayatId: pa._id, isActive: true }),
      User.create({ name: 'PDO B', email: 'route-pdo-b@test.invalid', passwordHash: 'test', role: 'pdo', panchayatId: pb._id, isActive: true }),
      User.create({ name: 'Admin A', email: 'route-admin-a@test.invalid', passwordHash: 'test', role: 'admin', panchayatId: pa._id, isActive: true })
    ]);
    const [roadA, roadB] = await Promise.all([
      Road.create({ panchayatId: pa._id, name: 'Route Road A', ward: 'Ward 1', condition: 'Poor', lineGeometry: { type: 'LineString', coordinates: [[77.7, 12.9], [77.702, 12.9]] } }),
      Road.create({ panchayatId: pb._id, name: 'Route Road B', ward: 'Ward 1', condition: 'Poor', lineGeometry: { type: 'LineString', coordinates: [[77.8, 13], [77.802, 13]] } })
    ]);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address(); assert(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const call = (path: string, user: any, init: RequestInit = {}) => fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${signToken({ id: String(user._id), role: user.role })}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
    const saveBody = (infraId: string, gpId: string) => ({ panchayatId: gpId, startLocation: { lat: 12.9, lng: 77.7 }, selectedInfrastructureIds: [infraId], optimizationResult: { orderedStops: [{ infrastructureId: infraId, location: { lat: 0, lng: 0 } }], routeGeometry: { type: 'Polygon', coordinates: 'malformed' }, totalDistanceMeters: 999999999, totalDistanceKm: 999999, estimatedDurationMinutes: -1 } });

    let response = await call('/api/routes/save', pdoA, { method: 'POST', body: JSON.stringify(saveBody(String(roadA._id), String(pa._id))) });
    assert.equal(response.status, 201, 'valid route uses database-owned stop and is recalculated');
    const saved: any = (await response.json()).data;
    assert.equal(saved.geometry.type, 'LineString', 'client malformed geometry is discarded');
    assert.notEqual(saved.totalDistance, 999999999, 'client-supplied distance is discarded');
    assert.notEqual(saved.totalDistanceKm, 999999, 'client-supplied kilometer metric is discarded');
    assert.equal(saved.fallbackUsed, false);

    response = await call('/api/routes/save', adminA, { method: 'POST', body: JSON.stringify(saveBody(String(roadB._id), String(pa._id))) });
    assert.equal(response.status, 403, 'cross-Panchayat infrastructure cannot be saved as a stop');
    response = await call('/api/routes/save', pdoA, { method: 'POST', body: JSON.stringify({ ...saveBody(String(roadA._id), String(pa._id)), startLocation: { lat: 91, lng: 77 } }) });
    assert.equal(response.status, 400, 'out-of-bounds start coordinate rejected');

    const foreignRoute = await Route.create({ panchayatId: pb._id, name: 'Foreign route', assignedMember: pdoB._id, startLocation: { type: 'Point', coordinates: [77.8, 13] }, destinations: [], orderedStops: [], geometry: { type: 'LineString', coordinates: [[77.8, 13], [77.801, 13]] }, totalDistance: 100, status: 'Planned' });
    response = await call(`/api/routes/${foreignRoute._id}`, pdoA);
    assert.equal(response.status, 403, 'route read is denied across Panchayat boundary');
    console.log('Route save API tests passed: recalculation, malformed geometry/metrics, cross-Panchayat stop, invalid start, and unauthorized route access.');
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(err => err ? reject(err) : resolve()));
    await disconnectDb();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
