import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { GapDetectionController } from './controllers/gapDetectionController.js';

function request(body: Record<string, unknown>, user?: NonNullable<Request['user']>): Request {
  return { body, query: {}, user, headers: {} } as unknown as Request;
}

function responseCapture(): { response: Response; status: number; body: unknown } {
  const capture = {
    status: 200,
    body: undefined as unknown,
    response: undefined as unknown as Response
  };
  capture.response = {
    status(code: number) {
      capture.status = code;
      return this;
    },
    json(body: unknown) {
      capture.body = body;
      return this;
    }
  } as unknown as Response;
  return capture;
}

const missingScopeResponse = responseCapture();
await GapDetectionController.analyze(request({}), missingScopeResponse.response);
assert.equal(missingScopeResponse.status, 400);
assert.deepEqual(missingScopeResponse.body, {
  error: 'Select a Panchayat before running gap analysis.'
});

const missingOverviewScopeResponse = responseCapture();
await GapDetectionController.getOverview(request({}), missingOverviewScopeResponse.response);
assert.equal(missingOverviewScopeResponse.status, 400);

const assignedUser: NonNullable<Request['user']> = {
  id: 'assigned-user',
  role: 'pdo',
  name: 'Test PDO',
  panchayatId: 'panchayat-a'
};
const crossPanchayatResponse = responseCapture();
const originalConsoleError = console.error;
console.error = () => {};
try {
  await GapDetectionController.analyze(
    request({ panchayatId: 'panchayat-b' }, assignedUser),
    crossPanchayatResponse.response
  );
} finally {
  console.error = originalConsoleError;
}
assert.equal(crossPanchayatResponse.status, 403);
assert.deepEqual(crossPanchayatResponse.body, {
  error: 'Forbidden: this account cannot access the requested Panchayat'
});

console.log('PASS: Gap Analysis rejects missing scope and assigned-user cross-Panchayat requests before data access.');
