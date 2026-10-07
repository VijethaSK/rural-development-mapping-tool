import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { RouteOptimizationController } from './controllers/routeOptimizationController.js';
import { Infrastructure } from './models/Infrastructure.js';
import { Panchayat } from './models/Panchayat.js';
import { PriorityConfig } from './models/PriorityConfig.js';
import { PriorityEvidence } from './models/PriorityEvidence.js';

const scopedPanchayatId = '64b000000000000000000001';
const otherPanchayatId = '64b000000000000000000002';
const scopedInfrastructure = {
  _id: '64c000000000000000000001',
  panchayatId: scopedPanchayatId,
  name: 'Point-only school stop',
  type: 'School',
  location: { type: 'Point', coordinates: [76.5, 12.5] },
  coordinatesVerified: true,
  coordinateSource: 'FIELD_SURVEY',
  coordinateStatus: 'VERIFIED',
  condition: 'Poor',
  complaintsCount: 1,
  populationServed: 100,
  priorityScorable: true
};
const unverifiedInfrastructure = {
  ...scopedInfrastructure,
  _id: '64c000000000000000000002',
  name: 'Approximate school stop',
  location: { type: 'Point', coordinates: [76.51, 12.51] },
  coordinatesVerified: false,
  coordinateSource: 'PUBLIC_MAP_APPROXIMATE',
  coordinateStatus: 'APPROXIMATE'
};

async function run() {
  const app = { locals: {} };
  const infrastructureModel = Infrastructure as unknown as {
    find: (filter: Record<string, string>) => { lean: () => Promise<typeof scopedInfrastructure[]> };
  };
  const panchayatModel = Panchayat as unknown as {
    findById: (id: string) => { select: (fields: string) => { lean: () => Promise<{ name: string; centerCoord: { lat: number; lng: number } }> } };
  };
  const priorityConfigModel = PriorityConfig as unknown as {
    findOne: (filter: Record<string, unknown>) => Promise<null> | { sort: (sort: Record<string, number>) => Promise<null> };
  };
    const priorityEvidenceModel = PriorityEvidence as unknown as {
      find: (filter: Record<string, unknown>) => { lean: () => Promise<unknown[]> };
    };

  const originalInfrastructureFind = infrastructureModel.find;
    const infrastructureModelWithFindById = Infrastructure as unknown as { findById: (id: string) => Promise<unknown> };
    const originalInfrastructureFindById = infrastructureModelWithFindById.findById;
  const originalPanchayatFindById = panchayatModel.findById;
  const originalPriorityFindOne = priorityConfigModel.findOne;
    const originalPriorityEvidenceFind = priorityEvidenceModel.find;
  const infrastructureFilters: Record<string, string>[] = [];
  let responseStatus = 200;
  let responseBody: Record<string, unknown> | undefined;
  const response = {
    status(code: number) { responseStatus = code; return this; },
    json(body: Record<string, unknown>) { responseBody = body; return this; }
  } as unknown as Response;

  try {
    infrastructureModel.find = (filter) => {
      infrastructureFilters.push(filter);
      return { lean: async () => String(filter.panchayatId) === scopedPanchayatId ? [scopedInfrastructure, unverifiedInfrastructure] : [] };
    };
    panchayatModel.findById = (id) => ({
      select: () => ({ lean: async () => ({ name: `Selected ${id}`, centerCoord: { lat: 12.5, lng: 76.5 } }) })
    });
    priorityConfigModel.findOne = (filter) => 'panchayatId' in filter && typeof filter.panchayatId === 'string'
      ? Promise.resolve(null)
      : { sort: async () => null };
    priorityEvidenceModel.find = () => ({ lean: async () => [] });

    const ownRequest = {
      app,
      query: { panchayatId: scopedPanchayatId },
      user: { id: 'pdo-a', role: 'pdo', panchayatId: scopedPanchayatId }
    } as unknown as Request;
    await RouteOptimizationController.getCandidates(ownRequest, response);
    assert.equal(responseStatus, 200, `a user may request candidates for their assigned Panchayat: ${JSON.stringify(responseBody)}`);
    assert.deepEqual(infrastructureFilters[0], { panchayatId: scopedPanchayatId }, 'candidate ranking queries infrastructure by the resolved Panchayat');
    const payload = responseBody as { count: number; startLocation: { lat: number; lng: number } | null; data: Array<{ panchayatId: string; location: { lat: number; lng: number } }> };
    assert.equal(payload.count, 1, `automatic candidates should omit unverified infrastructure: ${JSON.stringify(payload.data)}`);
    assert.equal(payload.data[0].panchayatId, scopedPanchayatId);
    assert.deepEqual(payload.data[0].location, { lat: 12.5, lng: 76.5 }, 'a Point-only facility remains a valid stop without LineString geometry');
    assert.equal(payload.startLocation, null, 'Panchayat center without coordinate-level verified provenance is not provided as a route origin');

    infrastructureModelWithFindById.findById = (() => ({ lean: async () => unverifiedInfrastructure })) as unknown as typeof infrastructureModelWithFindById.findById;
    responseStatus = 200;
    responseBody = undefined;
    await RouteOptimizationController.optimize({
      app,
      body: {
        panchayatId: scopedPanchayatId,
        startLocation: { lat: 12.5, lng: 76.5 },
        maintenanceLocations: [{ infrastructureId: unverifiedInfrastructure._id, location: { lat: 12.51, lng: 76.51 } }]
      },
      user: { id: 'pdo-a', role: 'pdo', panchayatId: scopedPanchayatId }
    } as unknown as Request, response);
    assert.equal(responseStatus, 422, 'an explicitly requested unverified stop is rejected after database hydration');
    assert.match(String((responseBody as unknown as { error?: string } | undefined)?.error || ''), /verified, trusted spatial coordinates/);

    responseStatus = 200;
    responseBody = undefined;
    await RouteOptimizationController.optimize({
      app,
      body: {
        panchayatId: scopedPanchayatId,
        startLocation: { lat: 12.5, lng: 76.5 },
        maintenanceLocations: [{ name: 'Caller coordinate stop', location: { lat: 12.51, lng: 76.51 } }]
      },
      user: { id: 'pdo-a', role: 'pdo', panchayatId: scopedPanchayatId }
    } as unknown as Request, response);
    assert.equal(responseStatus, 400, 'caller-supplied coordinates without a stored infrastructure ID cannot bypass provenance checks');

    responseStatus = 200;
    responseBody = undefined;
    const filtersBeforeDeniedRequest = infrastructureFilters.length;
    const crossPanchayatRequest = {
      app,
      query: { panchayatId: otherPanchayatId },
      user: { id: 'pdo-a', role: 'pdo', panchayatId: scopedPanchayatId }
    } as unknown as Request;
    await RouteOptimizationController.getCandidates(crossPanchayatRequest, response);
    assert.equal(responseStatus, 403, 'a cross-Panchayat candidate request remains forbidden');
    assert.equal(infrastructureFilters.length, filtersBeforeDeniedRequest, 'denied requests do not query candidate infrastructure');

    console.log('PASS: scoped verified candidates, unverified candidate omission, explicit-stop rejection, caller-coordinate rejection, and cross-Panchayat denial.');
  } finally {
    infrastructureModel.find = originalInfrastructureFind;
    infrastructureModelWithFindById.findById = originalInfrastructureFindById;
    panchayatModel.findById = originalPanchayatFindById;
    priorityConfigModel.findOne = originalPriorityFindOne;
    priorityEvidenceModel.find = originalPriorityEvidenceFind;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
