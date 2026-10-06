# Priority evidence workflow implementation

## Scope and safety

This report records the evidence-workflow implementation phase, when no production type-specific profile was active. That implementation did not activate a profile, alter score weights or arithmetic, set `priorityScorable`, change existing infrastructure values, or recalculate scores. `SCHOOL_PRIORITY_V1` v1.0.0 was finalized and activated in later profile work. The current registry has that School profile active; Road, Healthcare, WaterFacility, and Other remain inactive. Tests use an in-memory repository and do not connect to MongoDB.

## Endpoints

All endpoints are mounted under both the existing `/priorities` and `/api/priorities` prefixes.

| Method and path | Role | Purpose |
|---|---|---|
| `POST /priorities/:infrastructureId/evidence` | PDO or admin | Create a pending factor evidence version. |
| `GET /priorities/:infrastructureId/evidence` | PDO or admin | List the evidence package and current readiness. |
| `GET /priorities/:infrastructureId/evidence/:evidenceId` | PDO or admin | Retrieve one package and readiness. |
| `POST /priorities/:infrastructureId/evidence/:evidenceId/factors/:factor/submit` | PDO or admin | Submit a pending factor for review. Requires an approved profile that declares the factor applicable. |
| `POST /priorities/:infrastructureId/evidence/:evidenceId/factors/:factor/accept` | Admin | Accept submitted evidence. Requires an approved production profile and applicable factor. |
| `POST /priorities/:infrastructureId/evidence/:evidenceId/factors/:factor/reject` | Admin | Reject submitted evidence with a required reason. |

Example create body:

```json
{
  "sourceKey": "the-infrastructure-source-key",
  "factor": "condition",
  "value": "Average",
  "unit": "category",
  "sourceName": "Official inspection record",
  "sourceRecordReference": "record identifier",
  "sourceUrl": "https://example.gov/record",
  "observedAt": "2026-09-12",
  "referencePeriod": "2026",
  "derivationKind": "DIRECT",
  "confidence": "HIGH"
}
```

Calculated evidence additionally requires `derivationMethod`. Factor-specific evidence may include the existing readiness metadata for complaint coverage, utilization measurement, completed maintenance evidence, or verified network-distance evidence. Rejection body: `{ "reason": "...", "notes": "..." }`. Acceptance may include reviewer `notes`.

Responses contain sanitized factor values/provenance, verification status, rejection reason, resolved profile ID/version when one exists, and computed readiness. Submitter/reviewer user IDs and reviewer notes are returned only to admins; the normal public priority readiness response continues to omit reviewer identity.

## Authorization and scope

- Uses existing JWT `requireMemberOrAdmin` (`pdo`, `admin`) for evidence reads, creation, and submission.
- Uses existing `requireAdmin` for acceptance and rejection.
- Each endpoint loads the infrastructure and applies existing `assertPanchayatAccess`; a frontend-supplied ID cannot override user scope.
- No new roles, tokens, or authorization mechanism were introduced.
- Citizens have no evidence-submission or review permission.

## Lifecycle and audit fields

Evidence factor versions use the existing `verificationStatus` lifecycle: `PENDING` → `ACCEPTED` or `REJECTED`. Replacement evidence marks the previous current factor version `current=false` and appends a new pending version, preserving history. Each factor stores `submittedBy`, `submittedAt`, `reviewedBy`, `reviewedAt`, `rejectionReason`, and `reviewerNotes` alongside source, observation/reference period, derivation, confidence, and factor-specific evidence metadata.

At the original implementation stage, creation with no approved profile was deliberately allowed only as `PENDING` with applicability `UNRESOLVED`; it was not readiness evidence. Submission, acceptance, and scoring readiness require a matching approved profile and a factor declared applicable. After the later School V1 activation, applicable School evidence can proceed through review under `SCHOOL_PRIORITY_V1` v1.0.0; evidence for types without an active profile remains blocked from profile-dependent review and readiness. Rejected evidence is never ready.

## Validation

The workflow validates ObjectId format and infrastructure existence; exact sourceKey equality; supported factor; profile applicability when a profile exists; value type/range and policy unit; required source name/reference; safe HTTP(S) source URL; ISO observation date; derivation and confidence enums; calculated-method requirements; and the existing factor-specific evidence prerequisites. It does not accept client-supplied reviewer, status, applicability, or profile fields. Duplicate evidence-review documents for an infrastructure fail closed because current readiness treats duplicates as a data-integrity conflict.

## Tests

`backend/src/test-priority-evidence-workflow.ts` uses a fake in-memory repository and covers valid pending creation, invalid/missing infrastructure, sourceKey mismatch, factor/value/unit/source/date/derivation/confidence validation, factor-specific requirements, role denials, non-applicable factors, no-profile submit/accept rejection, accepted and rejected evidence behavior under a test-injected profile, sanitized reviewer identity, and read/list behavior.

Existing `backend/src/test-priority-evidence.ts` covers readiness states, approximate-coordinate protections, unchanged legacy arithmetic/Varthur compatibility, and 100 imported records remaining unavailable. No test connects to a database.

## Remaining dependencies and limitations

1. The evidence workflow originally launched with an empty production profile registry. `SCHOOL_PRIORITY_V1` v1.0.0 has since been activated; other type-specific profiles remain inactive, so their evidence cannot satisfy profile-dependent review or scoring readiness.
2. `Other` requires resolved subtype/scope before profile resolution. This workflow does not add a separate asset-scope approval endpoint; unresolved `Other` records remain blocked.
3. The existing readiness model requires accepted record scope/profile identity in addition to accepted factor evidence. This workflow does not automatically approve scope or profile identity when accepting a factor.
4. The evidence collection has no unique infrastructure index. The workflow refuses to proceed if multiple review documents already exist, but concurrent first submissions could race without a database uniqueness constraint. Adding that constraint requires a separate duplicate audit and index rollout.
5. Accepted evidence can make an individual factor ready only when an approved test/production profile exists; it does not by itself make the record scoreable. Full readiness still requires all applicable factors and accepted scope/profile identity.

## Production data confirmation

No production MongoDB/Atlas connection or write was performed during the evidence-workflow implementation. No evidence was created in a database and no score was recalculated or persisted as part of that work. The School profile was activated later, as documented in `school-profile-v1-activation-final.md`.
