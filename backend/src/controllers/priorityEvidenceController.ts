import type { Request, Response } from 'express';
import { Infrastructure } from '../models/Infrastructure.js';
import { assertPanchayatAccess } from '../middleware/panchayatScope.js';
import { PriorityEvidenceWorkflow, PriorityEvidenceWorkflowError } from '../services/priorityEvidenceWorkflow.js';
import { PRIORITY_EVIDENCE_FACTORS, type PriorityEvidenceFactor } from '../models/PriorityEvidence.js';

function actorFromRequest(req: Request) {
  if (!req.user) throw new PriorityEvidenceWorkflowError(401, 'Authentication is required.');
  return { id: req.user.id, role: req.user.role };
}

async function authorizeInfrastructureScope(req: Request): Promise<void> {
  const asset = await Infrastructure.findById(req.params.infrastructureId).select('panchayatId');
  if (!asset) throw new PriorityEvidenceWorkflowError(404, 'Infrastructure item not found.');
  assertPanchayatAccess(req, asset.panchayatId);
}

function factorFromRequest(req: Request): PriorityEvidenceFactor {
  const factor = req.params.factor;
  if (!PRIORITY_EVIDENCE_FACTORS.includes(factor as PriorityEvidenceFactor)) {
    throw new PriorityEvidenceWorkflowError(400, 'Unsupported evidence factor.');
  }
  return factor as PriorityEvidenceFactor;
}

async function respond(res: Response, action: () => Promise<unknown>, successStatus = 200): Promise<void> {
  try {
    res.status(successStatus).json(await action());
  } catch (error) {
    const statusCode = error instanceof PriorityEvidenceWorkflowError
      ? error.statusCode
      : (error as { statusCode?: number })?.statusCode || 500;
    const message = error instanceof PriorityEvidenceWorkflowError
      ? error.message
      : statusCode === 403
        ? 'Forbidden: this account cannot access the requested infrastructure.'
        : 'Priority evidence request failed.';
    res.status(statusCode).json({ error: message });
  }
}

export async function createEvidence(req: Request, res: Response): Promise<void> {
  await respond(res, async () => {
    await authorizeInfrastructureScope(req);
    return PriorityEvidenceWorkflow.create(req.params.infrastructureId, req.body, actorFromRequest(req));
  }, 201);
}

export async function listEvidence(req: Request, res: Response): Promise<void> {
  await respond(res, async () => {
    await authorizeInfrastructureScope(req);
    return PriorityEvidenceWorkflow.list(req.params.infrastructureId, actorFromRequest(req));
  });
}

export async function getEvidence(req: Request, res: Response): Promise<void> {
  await respond(res, async () => {
    await authorizeInfrastructureScope(req);
    return PriorityEvidenceWorkflow.details(req.params.infrastructureId, req.params.evidenceId, actorFromRequest(req));
  });
}

export async function submitEvidence(req: Request, res: Response): Promise<void> {
  await respond(res, async () => {
    await authorizeInfrastructureScope(req);
    return PriorityEvidenceWorkflow.submit(
      req.params.infrastructureId,
      req.params.evidenceId,
      factorFromRequest(req),
      actorFromRequest(req)
    );
  });
}

export async function acceptEvidence(req: Request, res: Response): Promise<void> {
  await respond(res, async () => {
    await authorizeInfrastructureScope(req);
    return PriorityEvidenceWorkflow.review(
      req.params.infrastructureId,
      req.params.evidenceId,
      factorFromRequest(req),
      'ACCEPTED',
      actorFromRequest(req),
      req.body || {}
    );
  });
}

export async function rejectEvidence(req: Request, res: Response): Promise<void> {
  await respond(res, async () => {
    await authorizeInfrastructureScope(req);
    return PriorityEvidenceWorkflow.review(
      req.params.infrastructureId,
      req.params.evidenceId,
      factorFromRequest(req),
      'REJECTED',
      actorFromRequest(req),
      req.body || {}
    );
  });
}

export async function approveAssetScope(req: Request, res: Response): Promise<void> {
  await respond(res, async () => {
    await authorizeInfrastructureScope(req);
    return PriorityEvidenceWorkflow.approveAssetScope(
      req.params.infrastructureId,
      req.params.evidenceId,
      req.body || {},
      actorFromRequest(req)
    );
  });
}

export async function approveProfileReview(req: Request, res: Response): Promise<void> {
  await respond(res, async () => {
    await authorizeInfrastructureScope(req);
    return PriorityEvidenceWorkflow.approveProfileReview(
      req.params.infrastructureId,
      req.params.evidenceId,
      actorFromRequest(req)
    );
  });
}
