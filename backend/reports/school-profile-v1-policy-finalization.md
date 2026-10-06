# SCHOOL_PRIORITY_V1 Policy Finalization

**Profile:** `SCHOOL_PRIORITY_V1` v`1.0.0`
**Policy status:** APPROVED BY PROJECT OWNER
**Runtime status:** ACTIVE
**Decision date:** 2026-10-06

The owner-approved final boundary semantics supersede the earlier candidate bands in this report and in the initial School V1 proposal. The complete activated configuration is recorded in `school-profile-v1-activation-final.md` and `school-profile-v1-policy-finalization.json`.

## Approved policy snapshot

Weights total exactly 1.00: condition 0.30, population served 0.20, utilization 0.15, complaints 0.15, maintenance age 0.10, accessibility 0.10. They are an explicit owner policy choice, not a statistical derivation.

- **Condition:** Good 15; Average 40; Needs_Maintenance 65; Poor 85; Bad 100.
- **Population served:** official students enrolled/served for the stated academic period: 0–250 → 20; 251–500 → 40; 501–1000 → 60; 1001–2000 → 80; >2000 → 100.
- **Utilization:** enrollment / officially sanctioned student capacity × 100, retaining fractional percentage and classifying without rounding: `<50` → 20; `>=50 and <75` → 40; `>=75 and <90` → 60; `>=90 and <100` → 80; `>=100` → 100. A missing/invalid capacity or incompatible period leaves the factor unavailable.
- **Complaints:** verified infrastructure-related complaints for the school in the previous 12 calendar months ending on the evidence review date: 0 → 0; 1 → 20; 2 → 40; 3 → 60; 4 → 80; >=5 → 100. Missing or incomplete coverage is unavailable, not zero.
- **Maintenance age:** most recent qualifying completed school maintenance/repair, evaluated against the accepted evidence review date using calendar anniversaries: `<1` year → 10; `>=1 and <2` → 30; `>=2 and <3` → 50; `>=3 and <5` → 75; `>=5` → 100. Exact anniversaries use the newer band.
- **Accessibility:** verified network distance to an operational equivalent school: `<1` km → 10; `>=1 and <2` → 30; `>=2 and <5` → 60; `>=5 and <10` → 80; `>=10` → 100.
- **Priority levels:** Critical 80–100; High 60–<80; Medium 40–<60; Low 0–<40.

## Runtime disposition

Only `SCHOOL_PRIORITY_V1` v1.0.0 is active in the approved profile registry. Road, Healthcare, WaterFacility, and Other have no active profile; generic Other remains unresolved. Cross-profile ranking remains disabled. The six-factor legacy Varthur scoring path and existing legacy outputs are unchanged. Existing source records still require their existing explicit eligibility and accepted evidence; activation does not make Mangalore SOURCE_EXCEL records scoreable.
