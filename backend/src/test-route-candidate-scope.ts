import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { RouteOptimizationController } from './controllers/routeOptimizationController.js';
import { Infrastructure } from './models/Infrastructure.js';
import { Panchayat } from './models/Panchayat.js';
import { PriorityConfig } from './models/PriorityConfig.js';

const scopedPanchayatId = 'panchayat-a';
const otherPanchayatId = 'panchayat-b';
const scopedInfrastructure = {
  _id: 'infrastructure-a',
  panchayatId: scopedPanchayatId,
  name: 'Point-only school stop',
  type: 'School',
  location: { type: 'Point', coordinates: [76.5, 12.5] },
  condition: 'Poor',
  complaintsCount: 1,
  populationServed: 100,
  priorityScorable: true
};

async function run() {
  const infrastructureModel = Infrastructure as unknown as {
    find: (filter: Record<string, string>) => { lean: () => Promise<typeof scopedInfrastructure[]> };
  };
  const panchayatModel = Panchayat as unknown as {
    findById: (id: string) => { select: (fields: string) => { lean: () => Promise<{ name: string; centerCoord: { lat: number; lng: number } }> } };
  };
  const priorityConfigModel = PriorityConfig as unknown as {
    findOne: (filter: Record<string, unknown>) => Promise<null> | { sort: (sort: Record<string, number>) => Promise<null> };
  };

  const originalInfrastructureFind = infrastructureModel.find;
  const originalPanchayatFindById = panchayatModel.findById;
  const originalPriorityFindOne = priorityConfigModel.findOne;
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
      return { lean: async () => String(filter.panchayatId) === scopedPanchayatId ? [scopedInfrastructure] : [] };
    };
    panchayatModel.findById = (id) => ({
      select: () => ({ lean: async () => ({ name: `Selected ${id}`, centerCoord: { lat: 12.5, lng: 76.5 } }) })
    });
    priorityConfigModel.findOne = (filter) => 'panchayatId' in filter && typeof filter.panchayatId === 'string'
      ? Promise.resolve(null)
      : { sort: async () => null };

    const ownRequest = {
      query: { panchayatId: scopedPanchayatId },
      user: { id: 'pdo-a', role: 'pdo', panchayatId: scopedPanchayatId }
    } as unknown as Request;
    await RouteOptimizationController.getCandidates(ownRequest, response);
    assert.equal(responseStatus, 200, 'a user may request candidates for their assigned Panchayat');
    assert.deepEqual(infrastructureFilters[0], { panchayatId: scopedPanchayatId }, 'candidate ranking queries infrastructure by the resolved Panchayat');
    const payload = responseBody as { count: number; startLocation: { lat: number; lng: number }; data: Array<{ panchayatId: string; location: { lat: number; lng: number } }> };
    assert.equal(payload.count, 1);
    assert.equal(payload.data[0].panchayatId, scopedPanchayatId);
    assert.deepEqual(payload.data[0].location, { lat: 12.5, lng: 76.5 }, 'a Point-only facility remains a valid stop without LineString geometry');
    assert.deepEqual(payload.startLocation, { lat: 12.5, lng: 76.5 }, 'depot context comes from the selected Panchayat');

    responseStatus = 200;
    responseBody = undefined;
    const filtersBeforeDeniedRequest = infrastructureFilters.length;
    const crossPanchayatRequest = {
      query: { panchayatId: otherPanchayatId },
      user: { id: 'pdo-a', role: 'pdo', panchayatId: scopedPanchayatId }
    } as unknown as Request;
    await RouteOptimizationController.getCandidates(crossPanchayatRequest, response);
    assert.equal(responseStatus, 403, 'a cross-Panchayat candidate request remains forbidden');
    assert.equal(infrastructureFilters.length, filtersBeforeDeniedRequest, 'denied requests do not query candidate infrastructure');

    console.log('PASS: candidate query Panchayat filter, Point-only stop eligibility, selected depot, and cross-Panchayat denial.');
  } finally {
    infrastructureModel.find = originalInfrastructureFind;
    panchayatModel.findById = originalPanchayatFindById;
    priorityConfigModel.findOne = originalPriorityFindOne;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
