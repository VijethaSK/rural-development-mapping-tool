# Project Status — Rural Development Mapping Tool

Inspected on 2026-09-25 from the current source tree. This is an implementation inventory, not a claim that every flow has been runtime-tested. No application files were changed for this inspection.

## Progress record convention

`PROJECT_PROGRESS.md.txt` contains the requirements and continuation context in this checkout. This file is the verified implementation status. At the end of each significant feature or major implementation task, update this file before reporting completion with: feature verification status, files changed, APIs added/modified, database changes, tests performed, known limitations, and the next recommended task. Do not claim completion without verifying the actual source; state clearly whether verification was source inspection or runtime/test execution.

## Current architecture

- Full-stack TypeScript monorepo with separate Vite/React frontend (`frontend/`) and Express backend (`backend/`). Root scripts start both dev servers and expose typecheck/model-test scripts.
- Frontend uses React 18, React Router, Tailwind CSS, Leaflet and React-Leaflet. Vite proxies API paths to Express on port 4000; Vite is configured for port 5180.
- Backend uses Express REST routes, Mongoose models and MongoDB. `connectDb()` attempts configured MongoDB, then starts MongoMemoryServer as a fallback. Seed logic runs at server startup.
- GeoJSON Point/LineString coordinates use `[longitude, latitude]`. Leaflet renders OpenStreetMap tiles, infrastructure, complaint markers/heat, routes and gap-analysis layers.
- Authentication uses signed JWT bearer tokens, bcrypt password hashes, role middleware, and localStorage on the client. Roles in the model are `citizen`, `pdo`, and `admin`.
- README describes an older/smaller CRUD application than the current source: the source contains additional roles, analytics, recommendation and operational modules.

## Completed features (present in source)

- Public school/road listing and issue reporting; admin school/road CRUD and issue status/removal endpoints.
- User/citizen registration and login, `/auth/me`, password hashing, JWT issuance, and backend `requireAuth`/`requireRole` helpers.
- Panchayat infrastructure and complaint map with map-layer controls; OSM/Leaflet GIS views.
- Configurable multi-factor infrastructure priority scoring, threshold levels, ranked results, stored recalculation, and factor-level explanations.
- Road-graph shortest paths with Dijkstra, priority-weighted nearest-neighbor stop ordering, 2-opt local improvement, route geometry, distance/time estimates, candidate selection, save/list/detail APIs, and route map UI.
- Accessibility gap analysis over habitation/grid points using school/road thresholds and spatial distance calculations; analyze, overview and defaults/config endpoints; map visualization.
- Complaint summary and heatmap analytics using complaint records and query filters for dates, category, infrastructure type, status, priority and ward; cluster inspection UI/API.
- Budget-based recommendations using priority/impact/cost, greedy selection and a 0/1 knapsack comparison/strategy; reasons, cost totals and budget UI.
- Complaint lifecycle state machine, citizen complaint submission and listing/detail, image upload references, map location, comments, votes, status history, admin/PDO status transitions and admin priority-setting.
- Maintenance assignment model and APIs; PDO work dashboard, status actions, completion notes/photos/location, and admin verification flow are represented in source.
- Admin decision-support endpoint and dashboard sections for overview, priority, maintenance, routes, gaps, budget, analytics and map intelligence.
- Admin analytical report page covering infrastructure summary/condition, full priority ranking and top critical assets, complaint statistics and coordinate hotspots, maintenance assignments, saved routes, spatial gaps, and budget recommendations. It reads stored database records and uses the existing priority, gap, and budget calculations. Browser print/Save as PDF and CSV export are available.
- Seed code and source-level test scripts exist for models, routes, priorities, GIS, gaps, complaints, lifecycle, citizen, budget, dashboard and PDO maintenance. They were not run as part of this inspection.
- Repeatable development/demo seed now upserts a fictional Panchayat fixture with 34 connected roads, 18 schools, 3 healthcare sites, 4 water facilities, 78 synthetic complaints, 12 maintenance assignments, 4 PDO/member demo accounts and 2 saved multi-stop routes. It records no personal contact details.

## Partially completed features

- Anonymous read access remains enabled on public maps, complaint discovery, and analytical endpoints by design. Requests carrying a valid login are constrained to that account's Panchayat; mutation and administrative endpoints use role middleware.
- Complaint submission is optional-auth and works for unregistered users as designed in the route comments; required authenticated citizen-only posting is therefore not enforced. Image upload is public and has no visible size/type restrictions in the Multer setup.
- Configurable priority weights are stored and selected per Panchayat when a scoped account requests them, with the existing global config serving as a fallback. Gap thresholds can be passed per analysis request; `/gap-analysis/config` returns defaults only and has no persisted admin configuration endpoint.
- Routing is algorithmically implemented, but the configured provider is the local road graph. When the graph is empty or snapping fails, Dijkstra service returns direct Haversine paths; these are straight-line estimates rather than network driving directions. Travel time uses a constant average speed.
- Infrastructure CRUD is limited to schools and roads in admin routes/UI; models also define healthcare and water facility discriminators, but equivalent management pages/routes are not present in the inspected tree.
- Complaint lifecycle includes state/transition rules and backend role middleware, but legacy statuses (`New`, `Resolved`, title-case and uppercase variants) coexist in schemas and dashboard aggregates, so end-to-end consistency is incomplete.
- There are two issue/complaint paths: legacy `/panchayats/:id/issues` and newer `/complaints` lifecycle APIs. Legacy and new frontends coexist, and some current pages duplicate functionality.
- Existing test files indicate intended checks, but their pass status is unknown; no tests/builds were run.

## Missing features or not found in current source

- Admin user-management endpoints/pages, despite default admin permission strings mentioning user management.
- Admin workflow for verifying/updating the completion evidence and full assignment status controls is represented partly in APIs/components; a complete user-management and audit/report workflow is not evident.
- Report generation/export (e.g. downloadable operational/budget reports) is not present in the inspected pages/routes.
- Persistent/admin-managed gap thresholds and a panchayat-scoped priority configuration selection workflow.
- Explicit member/PDO account creation/management flow in the inspected auth endpoints (registration creates citizen users; login accepts any existing role).
- Road-network ingestion/import tooling or integration to an external routing provider; code uses saved road geometries only.
- No evidence of deployed runtime, production configuration, or live database validation from source inspection alone.

## Known source-level bugs and inconsistencies

- The admin frontend guard now confirms the role through authenticated `GET /auth/me`; server middleware independently loads the active user and role from MongoDB rather than trusting JWT role claims.
- Assignment lists and detail/actions are scoped by Panchayat; PDO list/detail/action access is limited to work assigned to that PDO. Assignment creation validates infrastructure and PDO ownership, status verification is admin-only, and linked verification updates are constrained to the assignment Panchayat.
- Route planning and public analytical reads remain available anonymously as existing public read features. Logged-in requests are scoped; saving a route requires PDO/admin role and validates assignee plus every infrastructure stop against one Panchayat.
- `frontend/src/App.tsx` maps `/report` to `CitizenPortalPage`; the separate `ReportIssuePage` is not routed there. The `/report` URL therefore does not render the legacy report form.
- Saved route optimization output (geometry, cost and ordering) remains client supplied after stop ownership is validated. Persisted stop membership and assignee are validated server-side, but route metrics are not recomputed during save.
- Some dashboard counters query only legacy statuses (`New`, `Under Review`, `In Progress`, `Resolved`) while newer complaint writes use uppercase states such as `SUBMITTED`, `UNDER_REVIEW`, `IN_PROGRESS`, `VERIFIED`, and `CLOSED`; analytics/completion counts can miss newer records.
- A deployment/configuration caveat: the Vite config allows any host and binds to all interfaces; backend CORS is unrestricted. Appropriate for some development tunnels, but broad for production.
- Repository metadata is not project-specific: `git rev-parse --show-toplevel` resolves to `D:/`, `git log` reports no commits, and the current project appears among untracked drive content. There is no usable project commit history/status baseline here.

Historical findings above were rechecked during the authorization task. Authorization checks were exercised with an isolated in-memory database and local HTTP requests; remaining verification limits are recorded below.

## Existing database models

Models are Mongoose schemas under `backend/src/models/`:

- `Panchayat` — district/state, wards, center/location and habitation population/geometries.
- `User` base model with `CitizenUser`, `PdoUser`, `AdminUser` discriminators.
- `Infrastructure` base model with `Road`, `School`, `Healthcare`, and `WaterFacility` discriminators (`Road.ts`, `School.ts` and `AdminUser.ts` are compatibility re-exports).
- `Complaint` — also exported as legacy `IssueReport`; status history, location, image, comments and votes.
- `Assignment` — maintenance assignment/work status and completion/verification evidence.
- `Route` — saved route start, destinations, ordered stops, geometry and totals.
- `PriorityConfig` — scoring weights, thresholds and normalization limits.
- `common/Location.ts` — reusable GeoJSON Point and LineString schemas.

## Existing API endpoints

Endpoints are mounted without prefix and most analytical route groups are mounted a second time under `/api` in `backend/src/app.ts` (so both forms exist):

- **Auth:** `POST /auth/register`, `POST /auth/citizen/register`, `POST /auth/login`, `GET /auth/me`.
- **Public/Panchayat:** `GET /panchayats`, `GET /panchayats/:id/schools`, `/roads`, `/issues`; `POST /panchayats/:id/issues`; `POST /panchayats` is admin-only.
- **Admin infrastructure/issues:** `/admin/decision-support`; school and road list/create/get/update/delete under `/admin/schools` and `/admin/roads`; `PATCH /issues/:id/status`, `DELETE /issues/:id`.
- **Upload:** `POST /upload`.
- **Priority:** `GET /priorities`, `/priorities/top`, `/priorities/config`, `/priorities/:infrastructureId`; admin `PUT /priorities/config`, `POST /priorities/recalculate`.
- **Routing:** `POST /routes/optimize`, `/routes/save`; `GET /routes/candidates`, `/routes`, `/routes/:id`.
- **Gaps:** `POST /gap-analysis/analyze`; `GET /gap-analysis/overview`, `/gap-analysis/config`.
- **Complaint analytics:** `GET /complaints/analytics/summary`, `/heatmap`; `POST /complaints/analytics/inspect`.
- **Budget:** `GET` or `POST /budget/recommend`; `GET /budget/overview`.
- **Assignments:** `GET /assignments/my-work`, `/assignments/:id`, `/assignments`; `POST /assignments`; `PATCH /assignments/:id/action`, `/status`.
- **Complaints:** `GET /complaints`, `/complaints/:id`; `POST /complaints`, `/:id/comments`, `/:id/vote`, `/:id/transition`; `PATCH /complaints/:id/status`, `/:id/priority`.

Role protection varies by route; see the partial-completion and bug sections.

## Existing frontend pages/components

- **General:** `Landing`, `MapPage`, `SchoolsPage`, `RoadsPage`, `ReportIssuePage` (currently not routed), `PriorityDashboardPage`, `RouteOptimizationPage`, `GapAnalysisPage`, `ComplaintHeatmapPage`, `BudgetRecommendationPage`.
- **Admin:** login/registration page, dashboard, issues, school management, road management.
- **Citizen:** portal, complaint submission modal, detail modal, lifecycle stepper/timeline.
- **PDO:** work dashboard, task card, work detail modal, completion modal.
- **Shared decision/map:** priority config modal, score explanation modal, heatmap overlay, cluster inspection modal; dashboard overview, priority, maintenance, routes, gap, budget, trends and map sections.
- `App.tsx` also defines navigation, theme toggle and page routing.

## Existing algorithms

- **Priority:** normalize condition, complaint count, population, traffic/utilization, maintenance age and alternative/accessibility distance; weighted 0–100 score, threshold class and factor explanation. Configurable weights/limits are persisted.
- **Shortest path:** road geometries form a graph; Dijkstra finds paths between snapped graph nodes and stitches first/last-mile segments. Haversine direct fallback applies when graph is unavailable or snapping fails.
- **Multi-stop routing:** distance matrix of pairwise paths, priority-weighted nearest-neighbor initial ordering, then bounded 2-opt improvement. This is correctly separated from Dijkstra shortest-path calculation.
- **Gap analysis:** generate/use habitation/grid locations, calculate distances to school and road geometries, classify accessibility severity and aggregate population impact; optional network-distance setting is exposed.
- **Complaint analysis:** filter complaints and aggregate summaries/heatmap points from stored complaint coordinates; cluster details can be fetched by ID list.
- **Budget:** calculate impact and benefit/cost, greedy cost-efficiency selection under budget, and discretized 0/1 knapsack comparison or chosen strategy.
- **Complaint transitions:** explicit state normalization and transition/role rules in `complaintStateMachine.ts`.

## Recommended next step

The backend development command has been corrected and verified against the persistent database. Next, consider making MongoDB connection failures fatal or visibly degraded so the app cannot silently serve an empty in-memory database. Do not rerun the importer or demo seed.

## Latest implementation record — Analytical reporting module

- **Status:** Implemented in source and backend/frontend TypeScript typechecks pass. Runtime UI/database behavior and generated print/CSV output have not been exercised.
- **Files changed:** `backend/src/services/reporting/analyticalReportService.ts` (new), `backend/src/controllers/reportController.ts` (new), `backend/src/routes/reportRoutes.ts` (new), `backend/src/app.ts`, `backend/src/services/budget/types.ts`, `backend/src/services/budget/budgetRecommendationService.ts`, `frontend/src/pages/admin/ReportsPage.tsx` (new), `frontend/src/App.tsx`, `frontend/src/styles/index.css`, and this file plus `PROJECT_PROGRESS.md.txt`.
- **API added:** Admin-only `GET /api/reports/analytical`; accepts `panchayatId`, `infrastructureType`, `startDate`, `endDate`, and `budget` query parameters.
- **Database changes:** None. Reads existing Panchayat, Infrastructure, Complaint, Assignment, and Route models. Budget recommendations in the report exclude assets without a recorded repair/maintenance cost, rather than using the existing generic fallback estimates.
- **Tests/verification performed:** `backend/node_modules/.bin/tsc.cmd --noEmit` passed; `frontend/node_modules/.bin/tsc.cmd --noEmit` passed. `npm run typecheck` could not launch because this machine's global npm shim points to a missing `npm-cli.js`; the project-local TypeScript compiler was run directly. No automated tests or runtime database/browser tests were run.
- **Known limitations:** Date range filters dated complaints, assignments, and routes; infrastructure inventory, priority scores, budget candidates, and gap coverage are current-state snapshots, stated in the report. Gap coverage currently uses 3 km school / 1 km road thresholds. Priority scoring still uses the existing globally selected priority configuration. Hotspots use a 250 m greedy seed-neighbor grouping. The report exposes the top 10 critical assets and top 10 selected budget projects, while the priority ranking includes all matching assets.
- **Next recommended task:** Validate with real/seeded records and review print/CSV output. Then address the authorization and cross-Panchayat configuration/status issues already listed above.

## Latest implementation record — Repeatable development/demo dataset

- **Status:** Seed fixture implemented and source typecheck passes. The seed command was not run against any database; no data has been inserted into the currently configured database by this task.
- **Files changed:** `backend/src/seed/demoDataset.ts` (new), `backend/src/seed/seed.ts` (replaced the prior one-shot fixture), `backend/src/seed/seed-run.ts`, `README.md`, and this file plus `PROJECT_PROGRESS.md.txt`.
- **API changes:** None. Existing `npm --prefix backend run seed` command now runs the repeatable demo fixture.
- **Database changes:** No schema/model changes. The seed upserts a fictional `Kerehalli Development Demo Gram Panchayat`, its habitation data, development-only admin/PDO accounts, configured scoring weights, 34 connected road segments, 18 schools, 3 healthcare sites, 4 water facilities, 78 complaints with asset associations/hotspots, 12 assignments, and 2 saved routes with 5 stops each. Infrastructure complaint counters are synchronized to generated complaint records.
- **Tests/verification performed:** Backend `node_modules/.bin/tsc.cmd --noEmit` passed. No automated tests and no database seed execution were performed. The script includes database count checks for its minimum dataset requirements when run.
- **Known limitations:** Fixture coordinates and place names are synthetic, geographically plausible demo data and are not field-verified. Maintenance/complaint/route dates are fixed sample dates (primarily 2019–2026). Existing non-demo records in a database are left untouched. Production server startup skips the fixture unless explicitly enabled; the explicit seed command opts in.
- **Next recommended task:** Run the seed against an isolated development MongoDB, verify the exact collection counts and report/map/route/budget outputs, then rerun it to confirm no duplicate demo records.

## Latest implementation record — Authorization and Panchayat/data scoping

- **Status:** Implemented and verified in source, TypeScript/build checks, existing model tests, a scope-helper check, and targeted HTTP API tests using an isolated MongoDB. No persistent project database was used.
- **Files changed:** `backend/src/types/express.d.ts`, `backend/src/middleware/auth.ts`, `backend/src/middleware/panchayatScope.ts` (new); controllers `authController.ts`, `citizenComplaintController.ts`, `assignmentController.ts`, `schoolController.ts`, `roadController.ts`, `panchayatController.ts`, `issueController.ts`, `priorityController.ts`, `adminDashboardController.ts`, `reportController.ts`, `routeOptimizationController.ts`, `complaintAnalyticsController.ts`, `gapDetectionController.ts`, and `budgetRecommendationController.ts`; routes `assignmentRoutes.ts` and `routeOptimizationRoutes.ts`; services `priorityScoringService.ts` and `complaintAnalyticsService.ts`; `backend/src/test-authorization-api.ts` (new), `backend/package.json`, frontend `App.tsx`, `store/auth.tsx`, `hooks/useAdminDecisionSupport.ts`, `pages/RouteOptimizationPage.tsx`, `types/route.ts`, `PROJECT_PROGRESS.md.txt`, and this file.
- **Authorization rules now enforced:** Bearer tokens resolve to an active DB user and the DB role; role claims in the JWT are not authoritative. Admin endpoints require admin; PDO/admin assignment APIs require those roles; assignment status verification requires admin. Scoped accounts cannot choose a different Panchayat in reads or writes. PDOs only see/act on their own assignments; assignment creation validates the infrastructure and assigned PDO belong to the same authorized Panchayat. Complaint, legacy issue, infrastructure, priority/configuration, analytics, report, dashboard, route candidate/list/detail/optimization data are scoped on authenticated requests. Route saving requires PDO/admin, validates an active same-Panchayat PDO assignee and all stop infrastructure IDs, and prevents PDOs from assigning another member. Frontend admin pages verify `/auth/me` role before rendering. Existing anonymous read/submission endpoints remain public where previously designed.
- **APIs modified:** Existing endpoints only; no endpoint paths were added. Route middleware/role requirements changed on `GET /assignments`, `PATCH /assignments/:id/status`, and `POST /routes/save`. Existing complaint, infrastructure/legacy issue, priority, route, analytics, budget, gap, report and admin dashboard controllers now enforce the authenticated account's Panchayat scope. `GET /auth/me` is used by the frontend admin guard. Added repeatable test command `npm --prefix backend run test:authorization`.
- **Database changes:** No schema, collection, or migration changes. Existing `User.panchayatId` is authoritative. Added `panchayatId` to the Express request user type and to calculated priority result objects in memory only.
- **Tests performed:** Backend `tsc --noEmit` passed; backend TypeScript build passed; frontend `tsc --noEmit` passed; Vite production build passed (existing stale Browserslist data and large-chunk advisories only). Existing `src/test-models.ts` passed all 8 phases on MongoMemoryServer. New `src/test-authorization-api.ts` passed same-Panchayat allowed reads/assignment creation/verification, cross-Panchayat road/priority/assignment read, create, complete and verify denials, false JWT-role elevation denial, and scoped admin allowed/denied access. A direct `resolvePanchayatScope` check passed PDO/admin same- and cross-Panchayat cases, global admin scope, and public-query behavior. The isolated database/API test used localhost and MongoMemoryServer, not the configured project database. No lint script is defined in the existing package scripts.
- **Known limitations and risks:** Existing convention treats an `admin` user without `panchayatId` as a system-wide administrator; the current schema has no explicit global-admin flag, so assigning an admin without a Panchayat grants global scope. Anonymous public listing/analytics/optimization reads can still select any Panchayat as intended for the existing public map/analysis UX. `/upload` remains public and uploaded files are not tenant-bound until referenced. Saving a route validates stop IDs and ownership but accepts client-generated route geometry/metrics; recomputation is a separate routing correctness task. Legacy inconsistent assignments with linked complaint/infrastructure records from a different Panchayat may still show populated related fields on permitted parent reads; verification updates are constrained to matching Panchayat. No changes were made to complaint state-transition policy or GIS algorithms.
- **Next recommended task:** Priority 2 — canonical complaint and assignment state handling, retaining these authorization checks.

## Latest implementation record — Priority 2: Canonical complaint and assignment lifecycle

- **Changes made:** Complaints now persist and expose only canonical uppercase lifecycle values: `SUBMITTED`, `UNDER_REVIEW`, `PRIORITY_SET`, `ASSIGNED`, `REASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `VERIFIED`, `CLOSED`, `REJECTED`. Normal progression is Submitted → Under Review → Priority Set → Assigned → In Progress → Completed → Verified → Closed; rejected/reassigned and existing reopen/rework branches are exceptional. Complaint writes and legacy issue status updates use `ComplaintStateMachineService`. Both public complaint creation paths ignore caller-supplied status/history and initialize `SUBMITTED`. Assignment changes use a new `AssignmentStateMachineService`; transition actors, roles, timestamps, and notes are appended to assignment history. Assignment completion requires notes, an evidence image and valid field geolocation. PDOs cannot verify, admins cannot mark work complete, and verification advances a linked complaint to `VERIFIED` without closing it. `CLOSED` remains a distinct admin transition from `VERIFIED`.
- **Files changed:** `backend/src/models/Complaint.ts`, `backend/src/models/Assignment.ts`; services `complaintStateMachine.ts`, new `services/assignments/assignmentStateMachine.ts`, new `services/lifecycleStatusMigration.ts`, `complaintAnalyticsService.ts`, `analyticalReportService.ts`, `adminDashboardService.ts`; controllers `citizenComplaintController.ts`, `assignmentController.ts`, `issueController.ts`, `panchayatController.ts`; new `scripts/normalize-lifecycle-statuses.ts`, new `test-lifecycle-canonical.ts`; `test-models.ts`, `test-citizen-module.ts`, `test-pdo-maintenance.ts`, `test-complaints.ts`, `test-admin-dashboard.ts`; `backend/package.json`; frontend `types/citizen.ts`, `ComplaintLifecycleTimeline.tsx`, `PdoTaskCard.tsx`, `CompleteWorkModal.tsx`, `MaintenanceOpsSection.tsx`, `ClusterInspectionModal.tsx`, `CitizenPortalPage.tsx`, `ComplaintHeatmapPage.tsx`, `MapPage.tsx`, admin `IssuesPage.tsx`, PDO `PdoDashboardPage.tsx`; and both progress documents.
- **APIs added/modified:** No route path added. Existing complaint status/transition endpoints, legacy admin `/issues/:id/status`, assignment action and assignment compatibility status endpoints now enforce state-machine transitions. Assignment creation can link an optional same-Panchayat complaint in `PRIORITY_SET`, then moves it to `ASSIGNED`.
- **Database changes:** Complaint status enum narrowed to canonical values. Assignment gained a `statusHistory` array. No new collection or index. Added a normalization utility that is dry-run by default, aborts before writes if any unknown status is found, preserves existing complaint history, and records normalization entries. Use `npm --prefix backend run migrate:lifecycle-statuses` for a dry-run and append `-- --apply` only after reviewing the report. Legacy mappings: `New` → `SUBMITTED`; `Resolved` → `COMPLETED` (never `CLOSED`); title-case complaint states normalize to uppercase; assignment `In Progress` → `In_Progress`; unknown values are rejected. Migration ran only against isolated MongoMemoryServer in the lifecycle test, not against the configured project database.
- **Tests performed:** Backend TypeScript build and no-emit typecheck passed; frontend typecheck passed; Vite production build passed with existing stale browser database and large-chunk advisories. Existing model test suite passed all 8 phases on isolated MongoMemoryServer. New canonical lifecycle integration test passed required end-to-end transitions, forged-status complaint submission sanitization, invalid `COMPLETED -> CLOSED`, citizen administrative transition denial, PDO verification denial, verification-before-completion denial, cross-Panchayat status-change denial, legacy `Resolved` closure prevention, migration preservation, and unknown-value no-write behavior. Existing citizen/complaint suite passed 16/16 and existing PDO maintenance suite passed 17/17 after their request mocks included the Panchayat scope required by Priority 1. The host npm shim was broken, so repository-local `tsc.cmd` and `vite.cmd` were used.
- **Known limitations/risks:** Linked assignment and complaint writes span separate MongoDB documents without a transaction; prechecks reduce but cannot eliminate race/partial-write inconsistency. The existing API lacks an assignee-replacement action: complaint `REASSIGNED` status changes are auditable, but assignment owner replacement is not implemented. Legacy production data must be reviewed with the dry-run command and explicitly normalized with `--apply`. Seeded preexisting `Verified` assignments remain verified as recorded and are not demoted by this change.
- **Next recommended task:** Priority 3 — admin verification flow, after instruction. It was not started as part of this task.

## Priority 3 implementation record — GIS and routing correctness

**Status:** Implemented and verified against focused pure routing tests, isolated MongoDB API/gap tests, existing model/complaint/PDO/GIS suites, and frontend/backend build checks. This verifies calculations on stored geometry and does not establish live road-network accuracy.

### Architecture and behavior now verified

- `RoadGraph.addRoads` loads all roads in a batch, detects pairwise geometric crossings, splits each crossing segment and builds connected nodes. Calculation uses a local equirectangular projection. Coordinates are merged only by an exact key rounded to 7 decimal places (~centimetre latitude-scale precision); there is no implicit coordinate-proximity connection tolerance. Collinear overlaps are not treated as intersections.
- Dijkstra snaps the route origin/destination to the closest segment within 5,000 metres, then runs shortest path between temporary projected endpoint nodes. Endpoints on one segment can route directly along that segment. Road weights use Haversine distance between stored/split geometry points. GeoJSON remains `[longitude, latitude]`.
- Every path returns `routingMethod` (`NETWORK_ROUTE` or `STRAIGHT_LINE_FALLBACK`) and `fallbackUsed`. Empty/no-nearby graph cases use explicit Haversine straight-line fallback; disconnected graph components return unreachable instead of silently falling back. Fallback distance is not represented as road-network distance. Duration is null whenever a fallback leg is used.
- Multi-stop optimization is Dijkstra per leg plus priority-weighted nearest-neighbor ordering and 2-opt local search. It is a heuristic ordering, not an exact solution to the travelling-salesperson/multi-stop shortest-path problem. The engine caps requests at 50 stops, removes repeated infrastructure IDs while preserving separate co-located assets, excludes unreachable stops from the route geometry and reports them with a reason. Network duration uses a configurable/default average-speed assumption plus 15 minutes per stop; it is not live traffic data.
- Saving rehydrates all stop data from the authenticated Panchayat's infrastructure records, validates the origin and IDs, recalculates route output on the server and discards client-supplied geometry/distance/duration/ordering metrics. Save rejects selected stops that cannot all be reached on the stored road graph and rejects any route containing fallback legs. Saved route metadata identifies routing method/fallback state; older records without this provenance read as `LEGACY_UNKNOWN` and duration is nullable.
- Gap analysis differentiates `WITHIN_THRESHOLD`, `BEYOND_THRESHOLD`, and `NO_FACILITY` per school and road coverage. A missing facility receives at least a 2x threshold ratio and Critical severity rather than a zero ratio. Grid generation handles empty/degenerate bounds without inventing cells, validates positive finite resolution and caps generated cells at 10,000. UI displays when facility coverage is absent and highlights fallback/unreachable route behavior.

### Files changed

- Backend: `backend/src/services/routing/graph.ts`, `dijkstra.ts`, `routingProvider.ts`, `multiStopOptimizer.ts`, `types.ts`; `backend/src/controllers/routeOptimizationController.ts`; `backend/src/models/Route.ts`; `backend/src/services/spatial/gapDetectionService.ts`, `spatialUtils.ts`, `types.ts`; updated `backend/src/test-routes.ts`, `test-gap-detection.ts`; added `backend/src/test-gis-routing-correctness.ts`, `test-route-save-api.ts`.
- Frontend: `frontend/src/pages/RouteOptimizationPage.tsx`, `MapPage.tsx`, `GapAnalysisPage.tsx`; `frontend/src/types/route.ts`, `gap.ts`.
- Progress files: `PROJECT_PROGRESS.md.txt`, `PROJECT_STATUS.md`.

### APIs

- `POST /api/routes/optimize`: validates origin/stops and request count; returns routing method, fallback flag, per-stop routing method, unreachable-stop list, null duration for fallback and the specific ordering heuristic description.
- `POST /api/routes/save`: accepts selected infrastructure IDs and route options, enforces existing authenticated role/Panchayat rules, recalculates server-side and refuses incomplete/non-network plans. Client metrics/geometry are not trusted.
- `GET /api/routes/candidates`: supplies selected Panchayat center/name for a contextual origin and omits candidates without a valid source coordinate.
- Existing `GET /api/routes/:id` Panchayat/assignment authorization was tested; no API path was added.
- Gap analysis responses now include school and road coverage status fields.

### Database changes

Route model adds `routingMethod` with `NETWORK_ROUTE`, `STRAIGHT_LINE_FALLBACK`, `LEGACY_UNKNOWN`; optional `fallbackUsed`; and nullable `estimatedDuration`. Existing documents are not migrated; unknown provenance is deliberately marked `LEGACY_UNKNOWN`. No indexes, collections or other model schemas changed.

### Verification performed

- Backend `tsc` build: passed.
- Frontend `tsc --noEmit`: passed.
- Vite production build: passed. Existing notices: stale Browserslist data and a generated JS chunk above 500 kB.
- `test-gis-routing-correctness`: passed geometric crossing/splitting, coordinate ordering, segment snapping and direct same-segment travel, near-but-disjoint lines, disconnected roads, dead end, alternative paths, 2-stop/multi-stop/duplicate/empty/excessive input, unreachable stop reporting and fallback metadata/no fallback duration.
- Existing `test-routes`: passed shortest-path choice, disconnection, multi-stop distance accounting, empty/single/duplicate inputs and coordinate validation.
- `test-route-save-api` on MongoMemoryServer: passed valid recomputed save, malformed client geometry ignored, manipulated client distance/duration ignored, foreign Panchayat stop denied, invalid start denied, and foreign route read denied.
- Updated `test-gap-detection` on MongoMemoryServer: passed known geodesic/threshold/grid cases, served and beyond-threshold behavior, no-school/no-road/no-facility statuses and severity, empty bounds.
- Existing `test-models`: all 8 phases passed. Existing citizen complaint integration: 16/16 passed. Existing PDO maintenance: 17/17 passed. Existing GIS map layers: 9/9 passed. Mongo-backed suites used isolated MongoMemoryServer instances. No application database or live road service was used.
- No lint script exists in the checked-in package scripts.

### Known limitations and remaining risk

Stored road polylines are the only network evidence. The implementation does not know road level separation, directionality, turns, access restrictions, closures, topology omitted by source geometry or actual drivable access. Segment intersection uses local planar approximation and does not connect collinear overlaps. The 5 km endpoint-snap limit can produce a labelled direct-distance fallback; saving such routes is refused. Segment-intersection building and pairwise routing grow quadratically; route count is capped at 50. Average speed/inspection buffers are assumptions, and no traffic duration accuracy is claimed. Panchayat schema has a center point but no polygon to verify that an explicitly supplied valid start falls within the Panchayat boundary. Seed coordinates have not been field-surveyed.

**Next recommended task:** Priority 4 from the existing audit, after instruction. It was not started in this implementation.

## Historical pre-approval record — Excel source data integration dry run

This entry records the state before the user's later explicit approval. Its pending-import statements are superseded by the completed import record below.

### Verified workbook and mapping

- Five expected sheets read: `ALL_Infrastructure`, `Panchayat_Info`, `Row_Summary`, `Sources`, `Data_Dictionary`.
- 100 infrastructure rows: Adyar 19, Harekala 16, Neermarga 18, Pavuru 30, Pudu 17.
- Categories: Administration 10; Healthcare 19; Childcare 7; Education 8; Water 10; Transport 17; Civic 10; Public service 14; Animal Husbandry 1; Sanitation 1; Digital public service 1; Community 1; Utilities 1.
- All 100 rows lack both coordinates; no partial/invalid coordinates. 56 records are flagged for verification by a documented status/notes keyword heuristic. No duplicate source identities, missing identity fields, or `Row_Summary` mismatch. Thirty-one reported quantities are qualitative strings and are preserved unchanged. Six records retain explicit outside/nearby status (five `Not within village`, one `Outside village (<1 km)`).
- Panchayat mapping preserves only source-provided name, Taluka, village names, village count, administrative note and source. Village names are not fabricated into coordinate-bearing habitations. District/state, wards, population, contacts and center coordinates remain absent.
- Source category/type maps conservatively to existing application types. Exact status/quantity and raw row fields are preserved. Only source statuses with defensible existing enum equivalents are normalized. Missing coordinates, condition, complaint count, population, maintenance, traffic and cost remain null; source records are explicitly unscored.
- Stable source keys are SHA-256 over normalized Panchayat, Village/Area, Facility Name and Category. Only same-key records owned by this source are update candidates; unmatched name collisions are conflicts.

### Dry-run against current database

Current counts remain Panchayats 1, infrastructures 8, complaints 0, assignments 0, routes 0, users 4, priorityconfigs 0. Two successful read-only dry runs both proposed five new Panchayats and 100 infrastructure inserts, zero updates/skips/conflicts/existing records affected. Duplicate stable source keys and unique-index conflict counts are zero. No synthetic records are planned. Varthur is untouched; Kerehalli was not seeded.

The live database has only `_id_` indexes in inspected collections. The importer derives 69 distinct proposed indexes from actual Mongoose schemas. Normal Mongo connections disable auto-index creation so index changes are deferred until after backup verification.

### Implementation changes

- Demo fixtures carry synthetic/demo provenance. Normal startup skips the Kerehalli fixture unless `SEED_DEMO_DATA=true`; the explicit standalone seed command remains available.
- Panchayat and infrastructure models allow missing source fields and hold source provenance; complaints, assignments, routes and users have demo markers.
- Priority calculations/budget recommendations exclude unscorable source rows rather than inventing factors. Priority/map UI reports unavailable score/data and lists unlocated assets outside the map.
- Gap analysis explicitly returns `spatialAnalysisAvailable` and `spatialAnalysisUnavailableReason` when no usable locations exist. No route or complaint synthetic data was created.

### Files changed

Backend: `backend/src/models/Panchayat.ts`, `Infrastructure.ts`, `Complaint.ts`, `Assignment.ts`, `Route.ts`, `User.ts`; `backend/src/config/db.ts`; `backend/src/seed/demoDataset.ts`, `seed.ts`; `backend/src/services/priorityScoringService.ts`, `services/budget/budgetRecommendationService.ts`, `services/dashboard/types.ts`, `services/dashboard/adminDashboardService.ts`, `services/spatial/types.ts`, `services/spatial/gapDetectionService.ts`, `services/reporting/analyticalReportService.ts`; `backend/src/controllers/priorityController.ts`, `gapDetectionController.ts`; new `backend/src/scripts/import-source-excel.mjs`, `import-source-excel.test.mjs`; `backend/src/test-priority.ts`, `test-admin-dashboard.ts`, `test-gis-map-layers.ts`, `test-authorization-api.ts`; `backend/package.json`, `backend/package-lock.json`. Frontend: `frontend/src/types/priority.ts`, `types/adminDashboard.ts`, `types/gap.ts`; `frontend/src/pages/MapPage.tsx`, `PriorityDashboardPage.tsx`, `GapAnalysisPage.tsx`; `frontend/src/components/ScoreExplanationModal.tsx`, `components/admin/dashboard/OverviewSection.tsx`, `MapIntelligenceSection.tsx`. This file and `PROJECT_PROGRESS.md.txt`.

### APIs, database and verification

- **API:** no endpoint added; gap-analysis output includes availability metadata.
- **Database:** no writes, migration, index creation, or backup. Mongoose schemas changed locally only. Importer apply path builds schema indexes only after backup verification.
- **Passed:** backend TypeScript typecheck/build; frontend typecheck/Vite production build; importer unit tests 3/3; read-only database dry-run twice. Existing Vite warnings: stale Browserslist data and a large JavaScript chunk.
- **Blocked/failed:** model suite could not start MongoMemoryServer (`mongod` internal `fassert()` after fixing an initial temp-path `EPERM`). The authorization test exposed a stale direct-Assigned-to-Verified assertion; its test setup now performs evidence-backed completion before admin verification, but rerun failed at MongoMemoryServer startup. No lifecycle/GIS/complaint/PDO runtime results are claimed. MongoDB Database Tools are unavailable. Backup/apply were not run.

### Remaining risks and next step

The source records cannot appear on a map, be routed, or support geographic gap calculations until verified coordinates are available. Missing condition, complaint, population, usage, maintenance and cost fields mean priority/budget scores must remain unavailable. Verification flags are heuristic triage only. Existing Varthur data remains untagged as legacy/demo. The pending-import state in this historical entry is superseded by the completed import record below. Do not seed Kerehalli into `rdmt`.

## Latest implementation record — Approved source Excel import

- **Status:** Completed once against `mongodb://localhost:27017/rdmt` using the approved workbook. No importer or application source code was changed for the import.
- **Backup:** The user-referenced pre-existing path `D:\College\mini project\rdmt_backups\rdmt_backup_before_source_import_20260925_190920` did not exist. The previously verified backup was at a different path. The importer created a fresh backup before applying at `D:\College\mini project\rdmt_backups\rdmt_backup_before_source_import_apply_20260925_191508`; its output confirms `mongodump` completed and `mongorestore --dryRun` verified the dump before writes.
- **Database changes:** Inserted 5 source Panchayats (Adyar, Harekala, Neermarga, Pavuru, Pudu) and 100 `SOURCE_EXCEL`, non-synthetic infrastructure records. Inserted 0 complaints, assignments, routes, or users; updated 0 pre-existing records; deleted 0 documents. Source-key unique indexes and schema-derived indexes were created after backup verification. Varthur Gram Panchayat and its 8 infrastructure documents remain present. Kerehalli was not seeded/imported.
- **Live counts:** Panchayats 6; infrastructures 108; complaints 0; assignments 0; routes 0; users 4; priorityconfigs 0 documents (collection exists with indexes but is empty).
- **Reconciliation:** Adyar 19; Harekala 16; Neermarga 18; Pavuru 30; Pudu 17; Varthur 8; total infrastructure 108. All 100 source records have no location, `coordinatesVerified=false`, `coordinateSource=UNAVAILABLE`, and `priorityScorable=false`. There are 100 unique source keys and 56 verification flags. Workbook comparison by stable key found zero mismatches in source status, verification notes, reported quantity, or provenance. Post-import dry run proposed 0 Panchayat creates, 0 infrastructure inserts, 5 source-Panchayat updates and 100 source-row updates, with zero skips/conflicts; no second apply was run.
- **API changes:** None. No endpoint was modified.
- **Files changed for this task:** `PROJECT_PROGRESS.md.txt` and `PROJECT_STATUS.md` only. Validation generated build artifacts. No application source or database records were manually edited after import.
- **Checks actually run:** Backend TypeScript typecheck/build passed; frontend typecheck/Vite build passed; source-importer tests passed 3/3. Read-only MongoDB reconciliation passed. Direct priority-service check returned all 19 Adyar records as unscored with zero calculated scores. Direct gap-service check reported spatial analysis unavailable because coordinates are missing and returned zero underserved areas. Panchayat scope helper resolved Varthur scope and denied a cross-Panchayat Adyar request with 403.
- **Runtime verification issue:** HTTP smoke test could not import the existing Express app. `backend/src/models/School.ts` re-exports `SchoolDoc` from `Infrastructure.js` as a runtime export; Node reported that `Infrastructure.js` has no such export. Live `GET /panchayats` and authenticated API-level scoping checks remain unverified. Direct database, service, and scope-helper checks did run. No MongoMemoryServer suite was run for this import validation.
- **UI verification/limitations:** Source inspection confirms MapPage lists unlocated source records separately and does not put records without coordinates on the map. PriorityDashboard filters out unavailable-score records, so these source rows do not appear in that table. Browser verification was blocked by the app import error. Source records cannot be mapped/routed or geographically analyzed until coordinates are verified, and cannot be scored until operational inputs are supplied. The 56 verification flags are triage hints, not official verification.
- **Next recommended task:** Fix the existing type-only re-export runtime issue, then verify `GET /panchayats`, authenticated Panchayat scoping, map/table behavior, and the imported dataset in a browser. Keep this source-only dataset separate from any later demo-seed or production-data strategy.

## Latest implementation record — Model type-only re-exports

- **Status:** Fixed the model runtime export failure with a minimal TypeScript ESM export correction. No database operation, migration, importer, or seed was run.
- **Root cause:** `SchoolDoc` and `RoadDoc` are TypeScript interfaces declared in `Infrastructure.ts`; neither exists as a JavaScript runtime value. The compatibility modules re-exported them with ordinary `export { ... }`, which asked Node ESM to resolve nonexistent runtime exports. The same pattern existed for both school and road models.
- **Files changed:** `backend/src/models/School.ts`, `backend/src/models/Road.ts`, and `backend/src/services/priorityScoringService.ts` (document interfaces are now imported explicitly with `import type`). TypeScript build output generated under `backend/dist/`. Both progress documents were updated.
- **Fix:** Kept `School` and `Road` as runtime model re-exports and used `export type` for `SchoolDoc` and `RoadDoc`. Separated `InfrastructureDoc`/`RoadDoc` in the priority service into a type-only import. Compiled ESM modules now export only the actual runtime models.
- **Verification:** Backend `tsc --noEmit` and build passed; frontend typecheck and Vite build passed. Importing compiled `dist/app.js` succeeded. Compiled School/Road compatibility modules expose `School` and `Road`, respectively, and no interface runtime value.
- **Server/API:** The project's direct `ts-node-dev` invocation reported `no script to run provided`; the built application entrypoint `node dist/server.js` did start, skip the demo seed, and listen on port 4000. MongoDB at localhost:27017 was unavailable (`ECONNREFUSED`), so the app fell back to a temporary empty MongoMemoryServer. In that fallback only, `GET /panchayats` returned HTTP 200 with an empty list and `GET /priorities` returned HTTP 200. No `/health` route exists (`GET /health` returned 404). These checks do not verify the live `rdmt` dataset or Panchayat-specific API results.
- **Persistent database verification:** The MongoDB Windows service was observed stopped. Starting it was denied by Windows even when retried with elevated tool permissions. A direct read-only count query therefore failed to connect before tests; no post-test count query against the persistent database was possible. Since the database service was unreachable, no persistent-database API request or document mutation could occur. The memory fallback was stopped after the smoke test; seed was explicitly disabled.
- **Authorization/GIS checks:** Not run against the API because the persistent database service was unavailable. No authorization changes were made. No fabricated coordinates were created; fallback API returned no records.
- **Remaining runtime issue:** To finish the requested real-data smoke tests, the existing local MongoDB service must be started by an operator with service access. A health endpoint is not implemented. The normal development script also needs separate diagnosis because the installed `ts-node-dev` command rejected the configured invocation; the built server entrypoint did run.
- **Next recommended task:** After MongoDB service access is restored, run read-only count checks and Panchayat/infrastructure API smoke tests against `rdmt`. No import, seed, or data changes are needed.

## Latest diagnostic update — Browser data loading

- **Package commands:** Root `npm start` launches backend `npm run dev` and frontend `npm run dev` concurrently. Backend `dev` is `ts-node-dev --respawn --transpile-only --esm src/server.ts`; backend `start` is `node dist/server.js`; backend build is `tsc`. Frontend `dev` is Vite (port 5180), and frontend build is `vite build`.
- **Configuration:** Backend `.env` resolves, without exposing credentials, to `mongodb://localhost:27017/rdmt`; port defaults to 4000. Frontend `VITE_BACKEND_URL` was unset and there are no frontend `.env*` files in the project. Development fallback URLs in Landing/Schools/Roads are `http://localhost:4000`; other main pages use relative requests. Vite proxies `/panchayats`, `/api`, `/priorities`, `/complaints`, `/routes`, `/gap-analysis`, and related paths to `http://localhost:4000`. Backend enables permissive CORS middleware (`cors()`). Production Landing/Schools/Roads default to same-origin relative requests unless `VITE_BACKEND_URL` is supplied.
- **Database snapshot:** A read-only query succeeded before starting the server and confirmed 6 Panchayats, 108 infrastructures, 4 users, and 0 complaints/assignments/routes. Counts by Panchayat were Varthur 8, Adyar 19, Harekala 16, Neermarga 18, Pavuru 30, Pudu 17. During/after backend startup MongoDB was observed stopped; no after-count query was possible.
- **Backend startup:** `npm.cmd --prefix backend run start` launched `node dist/server.js`. Despite MongoDB having answered the earlier read-only query, the app's MongoDB connection then failed with `ECONNREFUSED ::1:27017` and `ECONNREFUSED 127.0.0.1:27017`. Existing `connectDb()` silently fell back to MongoMemoryServer; the backend then listened on port 4000. The seed flag was explicitly false and the log confirmed seed skipped. The fallback process was stopped without sending application API requests.
- **Frontend error tracing:** The exact string `Failed to load data` is set by `Landing.tsx`, `SchoolsPage.tsx`, and `RoadsPage.tsx` after fetch failure (network/CORS) or non-2xx response; the user-visible page/tab and actual request are unavailable in the connected browser inventory, which had no tabs. Therefore the exact failing browser URL, status, and body cannot be confirmed. Source shows Landing/Schools/Roads use `GET http://localhost:4000/panchayats` in development when no override is set. In a hosted production browser, an unset override means the frontend origin's `/panchayats`, which requires a same-origin proxy/backend. CORS policy is permissive in backend source, so no source evidence points to CORS as the primary cause.
- **Classification:** The observed backend startup/data-source failure is confirmed. A specific browser/API request failure and hosted-vs-local cause are not confirmed. The existing memory fallback can make the backend appear live while serving an empty database; this behavior needs an explicit policy decision, but it was not changed during diagnosis.
- **Data safety:** No importer, seed, migration, API mutation, schema change, or database record write was performed. The direct queries were count/find only. Since MongoDB stopped during the check, after-counts could not be reconfirmed.
- **Next recommended task:** Diagnose why the MongoDB service stops/refuses the backend connection, then rerun read-only endpoint and browser-network checks with the live database. Separately consider restricting/removing the memory fallback so connection failure cannot appear as a successful empty-data application. No fixes were implemented in this diagnostic task.

## Latest implementation record — Backend development startup

- **Status:** Fixed the backend `dev` command and verified it against the persistent `rdmt` database. No MongoDB data, schema, seed, or importer changes were made.
- **Root cause:** Installed `ts-node-dev` 2.0.0 does not define `--esm`; its CLI parser uses `stopEarly`, so the unsupported flag prevented recognition of `src/server.ts`. Removing the flag alone causes a `require()`/ESM error. Native ts-node ESM loading encounters other pre-existing type re-export runtime errors. Existing TypeScript NodeNext compilation and Node ESM output provide a compatible runner.
- **File changed:** `backend/package.json` only. `dev` now runs `npm run build`, then root-installed `concurrently` runs `tsc --watch --preserveWatchOutput` alongside `node --watch dist/server.js`. Source edits compile and the compiled ESM server restarts. TypeScript and module configuration are unchanged.
- **Backend verification:** `npm.cmd run dev` from `backend/` passed its build. Logs confirmed connection to `mongodb://localhost:27017/rdmt`, demo seed skipped, listening on port 4000, watch compilation with zero errors, and a Node watch restart that reconnected and again skipped seeding.
- **API verification:** `GET /panchayats` returned HTTP 200, an array of 6. `GET /priorities` returned HTTP 200 with `{items, stats}` and total 108. Panchayat filters returned 200 with Adyar 19, Harekala 16, Neermarga 18, Pavuru 30, Pudu 17, and Varthur 8. All 100 source records remain without coordinates. No `/health` endpoint exists (`GET /health` returned 404).
- **Frontend verification:** Vite started on `http://127.0.0.1:5180/`. Browser Landing rendered live Varthur data without the load error. Through Vite, `/panchayats` returned 200 with 6 records and `/priorities?panchayatId=<Adyar ID>` returned 200 with 19 records. Backend CORS response is `*` for the frontend origin.
- **Database safety:** Read-only counts before/after matched: Panchayats 6, infrastructure 108, users 4, complaints 0, assignments 0, routes 0, priorityconfigs 0. Per-Panchayat counts matched. Seed was explicitly disabled and logged skipped. Only GET requests and count/find queries were used.
- **Known limitation:** `connectDb()` still silently falls back to MongoMemoryServer if the persistent connection fails; unchanged by this task. Root `npm start` was not rerun as one command, but its backend and frontend development components were started and verified independently. Vite needed elevated permission to bind its configured port in this environment.
- **Next recommended task:** Consider making a missing MongoDB connection fatal or visibly degraded rather than silently serving an empty database. No more data setup is needed.

## Latest implementation record — Source Panchayat visibility and scoped Panchayat listing

- **Root cause verified:** `GET /panchayats` returned all six documents in insertion order with Varthur first. `frontend/src/pages/Landing.tsx` displayed only `panchayats[0]`; `MapPage.tsx` selected `list[0]` and then requested `/priorities?panchayatId=<selected id>`, correctly limiting the first map view to Varthur's eight. `SchoolsPage.tsx` and `RoadsPage.tsx` also fetched only the first Panchayat. The shared infrastructure endpoint is `GET /priorities` (not `/infrastructures`): unfiltered it returned 108 records and a selected Panchayat returned its expected count. Source entries have null location/ward/condition fields, which the prior Schools/Roads UI assumed were always populated.
- **Authorization finding:** `optionalAuth` validates a supplied bearer token and `panchayatScope.ts` restricts assigned users. Existing active admin, PDO, and citizen accounts are assigned to Varthur. `listPanchayats` incorrectly applied the child-document field `panchayatId` to Panchayat records, whose identifier is `_id`; this returned zero Panchayat records for authenticated scoped users. Corrected the query to `_id` while retaining the current scope rules. An admin with an assigned Panchayat remains scoped; system-wide admin behavior remains available only for an admin with no assigned Panchayat. No user records or permissions were changed.
- **Files changed:** `backend/src/controllers/panchayatController.ts`; `frontend/src/pages/Landing.tsx`; `frontend/src/pages/MapPage.tsx`; `frontend/src/pages/SchoolsPage.tsx`; `frontend/src/pages/RoadsPage.tsx`; this file and `PROJECT_STATUS.md`.
- **Behavior:** Landing now lists all six Panchayats and links to the selected map view. The map defaults to the first `SOURCE_EXCEL` Panchayat where present, supports direct Panchayat selection, and continues to include Varthur. Roads and Schools now expose a Panchayat selector, default to the source dataset when present, display source status, and render missing ward/condition/location as unavailable instead of throwing or inventing coordinates. Map source rows without coordinates remain in the unlocated-record list and are not plotted.
- **APIs:** No new endpoints. `GET /panchayats` now filters an assigned user's Panchayat using `_id`; `GET /priorities` behavior and `panchayatId` scope are unchanged.
- **Tests/checks actually run:** Backend `npm run typecheck` and `npm run build` passed. Frontend `npm run typecheck` and `npm run build` passed (existing stale Baseline/Browserslist and bundle-size advisory warnings). Live GET checks returned six Panchayats and 108 infrastructure items; by Panchayat: Varthur 8, Adyar 19, Neermarga 18, Pavuru 30, Harekala 16, Pudu 17. Scoped short-lived tokens for the existing admin/PDO/citizen roles each returned one assigned Panchayat; cross-Panchayat Adyar priority queries returned HTTP 403. Browser checks showed all six landing cards, Adyar selected by default with all 19 source rows listed as unlocated, Adyar Schools (1) and Roads (2) rendering null source fields safely, and Varthur displaying eight map assets. All database operations in this task were reads/counts only; no import, seed, write, or schema operation was run.
- **Test limitation:** The existing `npm run test:authorization` suite was attempted but MongoMemoryServer failed to start with `mongod internal error (fassert() failure)`, before the test could execute. Authorization behavior was instead smoke-tested against the live API using read-only requests and ephemeral signed tokens; no token or secret was recorded.
- **Current read-only database observation after checks:** panchayats 6, infrastructures 108, users 5, complaints 1, assignments 0, routes 0, priorityconfigs 0. This differs from the older recorded snapshot of users 4 / complaints 0; no write operation was issued by this task, and the user/complaint difference was observed rather than changed here.
- **Remaining limits:** The five imported Panchayats' infrastructure records still have no verified coordinates; map pins and spatial analysis remain unavailable for those items. The existing admin account is assigned to Varthur and therefore is not a system-wide admin under the current policy. The website's public read calls currently omit bearer tokens, so the scoped-user checks apply when callers send authenticated requests; this task did not redesign that existing API access policy.
- **Next recommended task:** Decide whether to assign/establish a separate system-wide administrator through the authorized account-management process, then continue the next approved project priority. No authorization broadening or database update was made here.

## Road geometry fix — Stage 1 (2026-09-26)

- **Verified behavior:** MapPage separates road-record count from mapped-road count. Only a GeoJSON `LineString` with at least two valid `[longitude, latitude]` pairs is counted or rendered as a road line. Point-only roads are not polylines. RoadsPage still lists source records and identifies approximate-point-only records explicitly. Routing graph inputs now require valid LineString geometry; point locations are ignored. Synthetic demo LineStrings remain eligible and retain `DEMO` / `isSynthetic` metadata.
- **Files changed:** `frontend/src/utils/roadGeometry.ts` (new), `frontend/src/utils/roadGeometry.test.mjs` (new), `frontend/src/pages/MapPage.tsx`, `frontend/src/pages/RoadsPage.tsx`, `backend/src/services/routing/routingProvider.ts`, `backend/src/test-gis-routing-correctness.ts`, `PROJECT_PROGRESS.md.txt`, and this file.
- **APIs and database:** No API endpoint or response shape changed. No database schema or data changed. No MongoDB operations were performed.
- **Tests:** Frontend `npm ci` PASS after restoring the generated dependency directory; frontend typecheck PASS; frontend build PASS; road-geometry utility tests PASS (4/4, including empty and malformed coordinate structures); backend typecheck/build and focused GIS routing correctness suite PASS; `git diff --check` PASS with line-ending warnings only.
- **Limitations:** Frontend components were not mounted or browser-tested as part of these checks. Source roads still have approximate points only and no LineString, so they are intentionally not mapped as road lines or added as routing edges.
- **Next recommended task:** Browser-check the map and Roads page when browser verification is desired; continue to source/verify genuine road geometry separately before enabling source-road lines or network routing.

## Route Optimizer Panchayat scoping

- **Verified behavior:** The optimizer has an explicit Panchayat selector backed by scoped `GET /panchayats`. Candidate loading is disabled until a Panchayat is selected (or supplied through `/routes?panchayatId=<id>`). It calls `GET /api/routes/candidates?panchayatId=<selectedId>`, keeps only matching-Panchayat candidates with finite in-range point coordinates, ignores stale responses, and clears stops/depot/result on Panchayat change. No default candidates or stop selections are loaded.
- **Depot and GIS:** The selected Panchayat center is the depot when present. Otherwise, the first available point is labelled as an estimated origin. No Varthur-specific coordinate is used. Infrastructure Points can locate stops; only valid stored LineStrings add road graph edges. Routing algorithms and explicit straight-line fallback behavior are unchanged.
- **Authorization:** No authorization code changed. The existing backend resolves requested Panchayat IDs against the authenticated user’s scope before calling priority ranking. The candidate query is Panchayat-filtered; cross-Panchayat requests return 403 before querying candidate infrastructure. The selector limits assigned users to the Panchayat returned by the scoped API, with backend enforcement remaining authoritative.
- **Files changed:** `frontend/src/pages/RouteOptimizationPage.tsx`; new `frontend/src/utils/routeOptimizerScope.ts`; new `frontend/src/utils/routeOptimizerScope.test.mjs`; new `backend/src/test-route-candidate-scope.ts`; `PROJECT_PROGRESS.md.txt`; this file.
- **API/database changes:** No API endpoint or response schema changes. No database/schema changes or MongoDB operations. The backend candidate-scope test stubs Mongoose model calls; it does not connect to a database.
- **Tests actually run:** Frontend typecheck PASS; frontend build PASS (existing Baseline/Browserslist and bundle-size warnings); frontend route-scope helper test PASS; backend typecheck PASS; backend build PASS; new backend candidate-scope test PASS; existing routing and GIS routing tests PASS; `git diff --check` PASS after the final review.
- **Limitations:** No browser-driven or live API test was run. The installed Node 24 `ts-node/esm` loader failed opaquely for the focused test, so it was compiled with the existing TypeScript configuration and then executed from `backend/dist`. The no-network/no-database test covers scope behavior with stubbed model calls. Approximate Point records are still eligible stops if coordinates are present; they do not create network edges.
- **Next recommended task:** Browser-check direct URL context, selector changes, stale request handling, and the selected Panchayat depot. Verify current source-coordinate availability separately before making route accuracy claims.

## Route Optimizer optimization-response race guard — 2026-09-26

- **Implemented:** Optimization requests capture the selected Panchayat and a request generation. Panchayat changes invalidate in-flight optimization requests and keep the established reset behavior for candidates, stops, depot, and result. Stale success, error, and loading-cleanup effects are ignored. A newer optimization request invalidates an older request for the same Panchayat as well.
- **Files:** `frontend/src/pages/RouteOptimizationPage.tsx`, `frontend/src/utils/routeOptimizerScope.ts`, `frontend/src/utils/routeOptimizerScope.test.mjs`, `PROJECT_PROGRESS.md.txt`, and `PROJECT_STATUS.md`.
- **Verification:** Route Optimizer scope/race test PASS; road geometry tests PASS (4/4); frontend typecheck PASS; frontend production build PASS with existing browser-data and chunk-size warnings. `git diff --check` PASS (Git emitted only line-ending normalization warnings).
- **Limitations:** No browser-driven race test was run. No database, schema, backend authorization, routing algorithm, or Stage 1 geometry changes were made; no MongoDB/database operation or commit/push occurred.
- **Next recommended task:** Browser-test switching Panchayats while optimization is in flight.

## Route Optimizer fallback wording — 2026-09-26

- **Implemented:** Per-leg decision-support wording no longer calls Haversine fallback distance road distance. The map overlay reflects actual route-leg methods, distinguishing Dijkstra/network, straight-line fallback, and mixed routes. Before a route exists it no longer claims Dijkstra was used.
- **Files:** `backend/src/services/routing/multiStopOptimizer.ts`, `backend/src/test-gis-routing-correctness.ts`, `frontend/src/pages/RouteOptimizationPage.tsx`, `frontend/src/utils/routeOptimizerScope.ts`, `frontend/src/utils/routeOptimizerScope.test.mjs`, `PROJECT_PROGRESS.md.txt`, and `PROJECT_STATUS.md`.
- **API/database:** No API endpoint or response contract changed. No database or schema changes.
- **Verification:** Backend typecheck/build PASS; GIS routing test PASS; existing routing test PASS; frontend route label/scope tests PASS; road geometry tests PASS (4/4); frontend typecheck/build PASS with existing stale browser data and chunk-size advisories; `git diff --check` PASS with line-ending normalization warnings.
- **Scope and limits:** Existing fallback warning and refusal to save fallback routes remain. No database, schema, authorization, routing algorithm, or road geometry changes. No database operation or commit/push occurred. No browser test was run.
- **Next recommended task:** Browser-verify fallback-only Adyar wording; verify the network label only when real verified LineString network geometry is available.
