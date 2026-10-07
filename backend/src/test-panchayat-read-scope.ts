import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import { listIssues, listPanchayats, listRoads, listSchools, reportIssue } from './controllers/panchayatController.js';
import { GapDetectionController } from './controllers/gapDetectionController.js';
import { getRanked } from './controllers/priorityController.js';
import { RouteOptimizationController } from './controllers/routeOptimizationController.js';
import { Infrastructure, Road, School } from './models/Infrastructure.js';
import { Panchayat } from './models/Panchayat.js';
import { GapDetectionService } from './services/spatial/gapDetectionService.js';
import { PriorityScoringService } from './services/priorityScoringService.js';
import { MultiStopOptimizer } from './services/routing/multiStopOptimizer.js';
import { assertPanchayatAccess, resolvePanchayatReadScope, resolvePanchayatScope } from './middleware/panchayatScope.js';

const panchayatA = '64b000000000000000000001';
const panchayatB = '64b000000000000000000002';
const panchayatRows = [
  { _id: panchayatA, name: 'Panchayat A' },
  { _id: panchayatB, name: 'Panchayat B' }
];
const citizen: NonNullable<Request['user']> = { id: 'citizen-1', role: 'citizen', panchayatId: panchayatA };
const pdo: NonNullable<Request['user']> = { id: 'pdo-1', role: 'pdo', panchayatId: panchayatA };
const systemAdmin: NonNullable<Request['user']> = { id: 'admin-1', role: 'admin' };

function request(overrides: Record<string, unknown> = {}): Request {
  return { headers: {}, query: {}, body: {}, ...overrides } as unknown as Request;
}

function responseCapture() {
  const capture: { statusCode: number; body?: any; response: Response } = {
    statusCode: 200,
    response: undefined as unknown as Response
  };
  capture.response = {
    status(code: number) { capture.statusCode = code; return this; },
    json(body: unknown) { capture.body = body; return this; }
  } as unknown as Response;
  return capture;
}

async function run(): Promise<void> {
  const connection = mongoose.connection as any;
  const oldReadyState = connection.readyState;
  const oldPanchayatFind = (Panchayat as any).find;
  const oldPanchayatFindById = (Panchayat as any).findById;
  const oldSchoolFind = (School as any).find;
  const oldRoadFind = (Road as any).find;
  const oldInfrastructureFind = (Infrastructure as any).find;
  const oldGetRanked = (PriorityScoringService as any).getRanked;
  const oldCalculateAccessibility = (GapDetectionService as any).calculateAccessibility;
  const oldOptimizeRoute = (MultiStopOptimizer as any).optimizeRoute;
  const panchayatFilters: Record<string, unknown>[] = [];
  const rankedScopes: Array<string | undefined> = [];
  const gapScopes: Array<string | undefined> = [];
  const optimizerScopes: Array<string | undefined> = [];

  try {
    // Make the read controller take its database-backed branch while replacing
    // all model reads with in-memory fixtures; this test never connects to MongoDB.
    connection.readyState = 1;
    (Panchayat as any).find = async (filter: Record<string, unknown>) => {
      panchayatFilters.push(filter);
      return panchayatRows.filter((row) => !filter._id || String(row._id) === String(filter._id));
    };
    (Panchayat as any).findById = (id: string) => ({
      select: () => ({ lean: async () => ({ name: `Selected ${id}`, centerCoord: { lat: 12.5, lng: 76.5 } }) })
    });
    (School as any).find = async (filter: Record<string, unknown>) => [{ panchayatId: filter.panchayatId, name: 'School' }];
    (Road as any).find = async (filter: Record<string, unknown>) => [{ panchayatId: filter.panchayatId, name: 'Road' }];
    (Infrastructure as any).find = async (filter: Record<string, unknown>) => [{
      id: 'asset-1', _id: 'asset-1', panchayatId: filter.panchayatId, name: 'School', type: 'School',
      location: { coordinates: [76.5, 12.5] }, priorityScore: 50, priorityLevel: 'Medium'
    }];
    (PriorityScoringService as any).getRanked = async (options: { panchayatId?: string }) => {
      rankedScopes.push(options.panchayatId);
      return {
        items: [{
          id: 'asset-1', _id: 'asset-1', panchayatId: options.panchayatId,
          name: 'School', type: 'School', location: { coordinates: [76.5, 12.5] },
          priorityScore: 50, priorityLevel: 'Medium'
        }],
        stats: { total: 1 }
      };
    };
    (GapDetectionService as any).calculateAccessibility = async (options: { panchayatId?: string }) => {
      gapScopes.push(options.panchayatId);
      return { panchayatId: options.panchayatId, metrics: {}, underservedAreas: [] };
    };
    (MultiStopOptimizer as any).optimizeRoute = async (_start: unknown, _stops: unknown, options: { panchayatId?: string }) => {
      optimizerScopes.push(options.panchayatId);
      return { panchayatId: options.panchayatId, orderedStops: [], stopsCount: 0 };
    };

    // Authenticated citizens receive the same full Panchayat list as anonymous viewers.
    const citizenList = responseCapture();
    await listPanchayats(request({ user: citizen }), citizenList.response);
    assert.deepEqual(panchayatFilters.at(-1), {});
    assert.deepEqual(citizenList.body.map((row: any) => row._id), [panchayatA, panchayatB]);
    const anonymousList = responseCapture();
    await listPanchayats(request(), anonymousList.response);
    assert.deepEqual(anonymousList.body.map((row: any) => row._id), [panchayatA, panchayatB]);

    // PDOs retain their assigned-only list; an unassigned system admin retains global access.
    const pdoList = responseCapture();
    await listPanchayats(request({ user: pdo }), pdoList.response);
    assert.deepEqual(panchayatFilters.at(-1), { _id: panchayatA });
    assert.deepEqual(pdoList.body.map((row: any) => row._id), [panchayatA]);
    const adminList = responseCapture();
    await listPanchayats(request({ user: systemAdmin }), adminList.response);
    assert.deepEqual(panchayatFilters.at(-1), {});
    assert.deepEqual(adminList.body.map((row: any) => row._id), [panchayatA, panchayatB]);
    const assignedAdmin: NonNullable<Request['user']> = { id: 'assigned-admin', role: 'admin', panchayatId: panchayatA };
    const assignedAdminList = responseCapture();
    await listPanchayats(request({ user: assignedAdmin }), assignedAdminList.response);
    assert.deepEqual(panchayatFilters.at(-1), { _id: panchayatA });
    assert.deepEqual(assignedAdminList.body.map((row: any) => row._id), [panchayatA]);

    // Public read endpoints for facility directories use the same read-scope policy.
    const schoolsResponse = responseCapture();
    await listSchools(request({ params: { id: panchayatB }, user: citizen }), schoolsResponse.response);
    assert.equal(schoolsResponse.statusCode, 200);
    assert.equal(String(schoolsResponse.body[0].panchayatId), panchayatB);
    const roadsResponse = responseCapture();
    await listRoads(request({ params: { id: panchayatB }, user: citizen }), roadsResponse.response);
    assert.equal(roadsResponse.statusCode, 200);
    assert.equal(String(roadsResponse.body[0].panchayatId), panchayatB);

    // Gap Analysis can be run against either selected Panchayat, with selected scope passed to the service.
    for (const selectedId of [panchayatA, panchayatB]) {
      const gapResponse = responseCapture();
      await GapDetectionController.analyze(
        request({ body: { panchayatId: selectedId }, user: citizen }),
        gapResponse.response
      );
      assert.equal(gapResponse.statusCode, 200);
      assert.equal(gapResponse.body.data.panchayatId, selectedId);
    }
    assert.deepEqual(gapScopes, [panchayatA, panchayatB]);

    const pdoGapDenied = responseCapture();
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      await GapDetectionController.analyze(request({ body: { panchayatId: panchayatB }, user: pdo }), pdoGapDenied.response);
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(pdoGapDenied.statusCode, 403);
    assert.deepEqual(gapScopes, [panchayatA, panchayatB], 'PDO denial happens before analysis data access');

    // Priorities returns rows only from the selected Panchayat for citizens, across selections.
    for (const selectedId of [panchayatA, panchayatB]) {
      const priorityResponse = responseCapture();
      await getRanked(request({ query: { panchayatId: selectedId }, user: citizen }), priorityResponse.response);
      assert.equal(priorityResponse.statusCode, 200);
      assert.equal(String(priorityResponse.body.items[0].panchayatId), selectedId);
    }
    assert.deepEqual(rankedScopes.slice(0, 2), [panchayatA, panchayatB]);
    const pdoPriorityDenied = responseCapture();
    await getRanked(request({ query: { panchayatId: panchayatB }, user: pdo }), pdoPriorityDenied.response);
    assert.equal(pdoPriorityDenied.statusCode, 403);
    assert.deepEqual(rankedScopes.slice(0, 2), [panchayatA, panchayatB]);

    // Route Optimizer candidates and calculation accept a citizen's explicit A/B selection.
    for (const selectedId of [panchayatA, panchayatB]) {
      const candidateResponse = responseCapture();
      await RouteOptimizationController.getCandidates(
        request({ query: { panchayatId: selectedId }, user: citizen }),
        candidateResponse.response
      );
      assert.equal(candidateResponse.statusCode, 200);
      assert.equal(candidateResponse.body.data[0].panchayatId, selectedId);
      assert.equal(candidateResponse.body.data[0].location.lat, 12.5);

      const optimizeResponse = responseCapture();
      await RouteOptimizationController.optimize(request({
        body: { panchayatId: selectedId, startLocation: { lat: 12.5, lng: 76.5 }, maintenanceLocations: [] },
        user: citizen
      }), optimizeResponse.response);
      assert.equal(optimizeResponse.statusCode, 200);
      assert.equal(optimizeResponse.body.data.panchayatId, selectedId);
    }
    assert.deepEqual(optimizerScopes, [panchayatA, panchayatB]);

    const pdoCandidatesDenied = responseCapture();
    await RouteOptimizationController.getCandidates(
      request({ query: { panchayatId: panchayatB }, user: pdo }),
      pdoCandidatesDenied.response
    );
    assert.equal(pdoCandidatesDenied.statusCode, 403);

    // System-wide admins retain the pre-existing ability to select either Panchayat.
    const adminPriority = responseCapture();
    await getRanked(request({ query: { panchayatId: panchayatB }, user: systemAdmin }), adminPriority.response);
    assert.equal(adminPriority.statusCode, 200);
    const adminGap = responseCapture();
    await GapDetectionController.analyze(request({ body: { panchayatId: panchayatB }, user: systemAdmin }), adminGap.response);
    assert.equal(adminGap.statusCode, 200);
    const adminCandidates = responseCapture();
    await RouteOptimizationController.getCandidates(request({ query: { panchayatId: panchayatB }, user: systemAdmin }), adminCandidates.response);
    assert.equal(adminCandidates.statusCode, 200);

    // Existing assigned-scope checks remain the policy for complaints and writes.
    assert.equal(resolvePanchayatReadScope(request({ user: citizen }), panchayatB), panchayatB);
    assert.equal(resolvePanchayatScope(request({ user: citizen }), panchayatA), panchayatA);
    assert.throws(() => resolvePanchayatScope(request({ user: citizen }), panchayatB), { statusCode: 403 });
    assert.throws(() => assertPanchayatAccess(request({ user: citizen }), panchayatB), { statusCode: 403 });
    const complaintWriteDenied = responseCapture();
    await reportIssue(request({ params: { id: panchayatB }, body: { title: 'Test' }, user: citizen }), complaintWriteDenied.response);
    assert.equal(complaintWriteDenied.statusCode, 403);
    const issueReadDenied = responseCapture();
    await listIssues(request({ params: { id: panchayatB }, user: citizen }), issueReadDenied.response);
    assert.equal(issueReadDenied.statusCode, 403);
    const routeSaveDenied = responseCapture();
    const originalSaveConsoleError = console.error;
    console.error = () => {};
    try {
      await RouteOptimizationController.saveRoute(request({
        body: { panchayatId: panchayatB, optimizationResult: {}, startLocation: {} }, user: citizen
      }), routeSaveDenied.response);
    } finally {
      console.error = originalSaveConsoleError;
    }
    assert.equal(routeSaveDenied.statusCode, 403, 'route saving retains the assigned-Panchayat restriction');

    console.log('PASS: citizens list all Panchayats and select A/B for Gap Analysis, Priorities, and Route Optimizer.');
    console.log('PASS: PDOs remain assigned-Panchayat only; system-wide admins remain unrestricted.');
    console.log('PASS: citizen complaint reads/writes and route saving remain assigned-Panchayat protected.');
  } finally {
    connection.readyState = oldReadyState;
    (Panchayat as any).find = oldPanchayatFind;
    (Panchayat as any).findById = oldPanchayatFindById;
    (School as any).find = oldSchoolFind;
    (Road as any).find = oldRoadFind;
    (Infrastructure as any).find = oldInfrastructureFind;
    (PriorityScoringService as any).getRanked = oldGetRanked;
    (GapDetectionService as any).calculateAccessibility = oldCalculateAccessibility;
    (MultiStopOptimizer as any).optimizeRoute = oldOptimizeRoute;
  }
}

await run();
