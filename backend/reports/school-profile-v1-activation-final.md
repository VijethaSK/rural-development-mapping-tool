# SCHOOL_PRIORITY_V1 Final Activation Record

**Profile:** `SCHOOL_PRIORITY_V1`
**Version:** `1.0.0`
**Approval:** Explicit project-owner approval, 2026-10-06
**Activation:** **ACTIVE** — this is the only active type-specific production profile.

## Approved weights

| Factor | Weight |
|---|---:|
| Condition | 0.30 |
| Population served | 0.20 |
| Utilization | 0.15 |
| Complaints | 0.15 |
| Maintenance age | 0.10 |
| Accessibility | 0.10 |
| **Total** | **1.00** |

The weights are an explicit policy choice, not a statistical derivation.

## Approved normalization and boundaries

- **Condition:** `Good=15`, `Average=40`, `Needs_Maintenance=65`, `Poor=85`, `Bad=100`.
- **Population served:** official students enrolled/served by the identified school for its academic reference period. `0–250=20`, `251–500=40`, `501–1000=60`, `1001–2000=80`, `>2000=100`. Panchayat population, generic local population, reported quantity, and estimates are prohibited.
- **Utilization:** `enrollment / officially sanctioned student capacity × 100`; use the actual fractional result without rounding before classification. `<50%=20`; `>=50 and <75%=40`; `>=75 and <90%=60`; `>=90 and <100%=80`; `>=100%=100`. Enrollment and capacity must cover the same academic year or have documented compatible periods. Missing capacity makes utilization unavailable.
- **Complaints:** count verified infrastructure-related complaints concerning the specific school during the previous 12 calendar months ending on the evidence review date. `0=0`; `1=20`; `2=40`; `3=60`; `4=80`; `>=5=100`. Missing/incomplete coverage is unavailable, not zero. The period is represented as the UTC date interval from the prior calendar anniversary through the evidence review date.
- **Maintenance age:** use the latest qualifying completed maintenance/repair event for the school asset and the accepted evidence review date. Compare calendar anniversaries, not fixed day approximations: `<1 year=10`; `>=1 and <2=30`; `>=2 and <3=50`; `>=3 and <5=75`; `>=5=100`. Exact 1-, 2-, 3-, and 5-year anniversaries use the higher/newer band. Assignment creation, verification, and publication dates are not substitutes for completion date.
- **Accessibility:** verified network distance in kilometers to the nearest operational equivalent school: `<1=10`; `>=1 and <2=30`; `>=2 and <5=60`; `>=5 and <10=80`; `>=10=100`. The exact boundaries 1, 2, 5, and 10 km use the higher band. Approximate/unverified points, arbitrary facilities, straight-line distance, and inferred road geometry do not qualify.
- **Priority levels:** Critical `80–100`; High `60–<80`; Medium `40–<60`; Low `0–<40`.

## Resolution, legacy behavior, and eligibility

- The approved registry contains `SCHOOL_PRIORITY_V1` v1.0.0 only; the profile resolver selects it for School records.
- Road, Healthcare, WaterFacility, and Other remain inactive. Generic Other remains unresolved and cannot fall back to the School profile.
- School scoring still requires the existing accepted scope, identity, evidence-readiness, and explicit eligibility gates. Activating the profile does not set any record's `priorityScorable` flag or synthesize evidence.
- The legacy Varthur scoring branch, six-factor legacy calculator, and existing legacy behavior are unchanged.
- Ranking remains separated by scoring profile/version. School scores are not ranked against legacy Varthur or another profile.

## Verification

Commands were run from `backend` using the installed Node runtime and in-memory/unit fixtures. No Atlas or MongoDB connection was made.

| Check | Result |
|---|---|
| `node --loader ts-node/esm src/test-priority-scoring-profiles.ts` | PASS |
| `node --loader ts-node/esm src/test-priority-evidence.ts` | PASS |
| `node --loader ts-node/esm src/test-priority-evidence-workflow.ts` | PASS (in-memory repository) |
| `node --loader ts-node/esm src/test-priority-availability.ts` | PASS |
| `tsc --noEmit` | PASS |
| `tsc --project tsconfig.build.json` | PASS |
| `git diff --check` | PASS (after final review) |

Profile tests cover all requested exact utilization, maintenance-anniversary, and accessibility boundaries, approved weights/factors/version/resolution, missing-capacity and missing-evidence behavior, unverified-coordinate rejection, inactive other types, legacy scoring, Mangalore source-record unavailability, and cross-profile ranking separation.

## Data-safety confirmation

- No evidence was created or changed in any persistent store; the evidence-workflow test uses ephemeral in-memory fixtures only.
- No production/database score was created or persisted; the profile test calculated only an ephemeral in-memory fixture result.
- No Mangalore `priorityScorable` flags were changed; no Mangalore record was enabled.
- No production database was accessed or modified.
- No importer or seed script was run.
- No deployment, commit, or push was performed.
