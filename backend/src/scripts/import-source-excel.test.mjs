import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTarget, buildCoordinateReconciliationReport, buildGlobalApplyAssessment, makeInfrastructureDocument, makePanchayatDocument, parseArgs, stableSourceKey, validateRunMode, withApplyIdentityPrecheck } from './import-source-excel.mjs';

const sourceRow = {
  Panchayat: 'Adyar',
  'Village/Area': 'Adyar; Arkula',
  'Infrastructure / Facility': 'Government education facilities',
  Category: 'Education',
  Type: 'Government school(s)',
  Ownership: 'Government',
  'Reported Quantity': 'Multiple / verify',
  Status: 'Reported',
  Latitude: null,
  Longitude: null,
  Source: 'Current education records required',
  'Source Vintage': '2026',
  'Verification / Notes': 'Obtain the current official list; exact names require verification.'
};

const isolatedTarget = 'mongodb://127.0.0.1:27018/rdmt';
const isolatedDryRunOptions = { dryRun: true, apply: false, allowIsolatedDryRunPort27018: true };

test('existing local rdmt targets on port 27017 remain approved', () => {
  for (const uri of [
    'mongodb://localhost:27017/rdmt',
    'mongodb://127.0.0.1:27017/rdmt',
    'mongodb://[::1]:27017/rdmt'
  ]) {
    assert.doesNotThrow(() => assertTarget(uri, { dryRun: true }));
  }
});

test('isolated port-27018 target requires explicit dry-run opt-in', () => {
  assert.throws(() => assertTarget(isolatedTarget, { dryRun: true }), /requires --dry-run and --allow-isolated-dry-run-port-27018/i);
  assert.doesNotThrow(() => assertTarget(isolatedTarget, isolatedDryRunOptions));
});

test('isolated port-27018 opt-in rejects Atlas, alternate hosts, ports, and databases', () => {
  const rejectedTargets = [
    'mongodb+srv://cluster.example.mongodb.net/rdmt',
    'mongodb://localhost:27018/rdmt',
    'mongodb://127.0.0.1:27017/rdmt',
    'mongodb://127.0.0.2:27018/rdmt',
    'mongodb://[::1]:27018/rdmt',
    'mongodb://192.168.1.10:27018/rdmt',
    'mongodb://127.0.0.1:27019/rdmt',
    'mongodb://127.0.0.1:27018/otherdb',
    'mongodb://127.0.0.1:27018/rdmt/other',
    'mongodb://127.0.0.1:27018/rdmt?authSource=admin',
    'mongodb://127.0.0.1:27018/rdmt?',
    'mongodb://127.0.0.1:27018/rdmt#',
    'mongodb://@127.0.0.1:27018/rdmt',
    'MONGODB://127.0.0.1:27018/rdmt',
    'mongodb://user:pass@127.0.0.1:27018/rdmt'
  ];

  for (const uri of rejectedTargets) {
    assert.throws(() => assertTarget(uri, isolatedDryRunOptions), undefined, uri);
  }
});

test('isolated target opt-in cannot be combined with apply or used without explicit dry-run', () => {
  assert.throws(
    () => validateRunMode({ apply: true, dryRun: false, allowIsolatedDryRunPort27018: true }),
    /valid only with --dry-run and without --apply/i
  );
  assert.throws(
    () => validateRunMode({ apply: false, dryRun: false, allowIsolatedDryRunPort27018: true }),
    /valid only with --dry-run and without --apply/i
  );
  assert.throws(
    () => assertTarget(isolatedTarget, { apply: true, dryRun: true, allowIsolatedDryRunPort27018: true }),
    /choose either --dry-run or --apply/i
  );
  assert.throws(
    () => assertTarget(isolatedTarget, { apply: true, dryRun: false, allowIsolatedDryRunPort27018: true }),
    /valid only with --dry-run and without --apply/i
  );
});

test('CLI rejects simultaneous dry-run and apply flags and parses isolated opt-in explicitly', () => {
  const bothModes = parseArgs(['--dry-run', '--apply']);
  assert.throws(() => validateRunMode(bothModes), /choose either --dry-run or --apply, not both/i);

  const isolatedDryRun = parseArgs(['--dry-run', '--allow-isolated-dry-run-port-27018']);
  assert.deepEqual(isolatedDryRun, { apply: false, dryRun: true, allowIsolatedDryRunPort27018: true });
  assert.doesNotThrow(() => validateRunMode(isolatedDryRun));
});

test('malformed MongoDB URI gets a safe validation error', () => {
  assert.throws(() => assertTarget('not-a-mongodb-uri', { dryRun: true }), /invalid mongodb uri/i);
});

test('apply identity precheck rejects duplicate source keys before invoking the database continuation', async () => {
  let databaseWorkStarted = false;
  await assert.rejects(
    withApplyIdentityPrecheck(
      { duplicateRows: [{ key: 'duplicate-key', firstRow: 2, duplicateRow: 5 }] },
      true,
      async () => { databaseWorkStarted = true; }
    ),
    /resolve dry-run schema\/identity conflicts/i
  );
  assert.equal(databaseWorkStarted, false);
});

test('apply identity precheck rejects missing stable identity before invoking the database continuation', async () => {
  let databaseWorkStarted = false;
  await assert.rejects(
    withApplyIdentityPrecheck(
      { rowsMissingIdentity: [{ row: 7, fields: ['Category'] }] },
      true,
      async () => { databaseWorkStarted = true; }
    ),
    /resolve dry-run schema\/identity conflicts/i
  );
  assert.equal(databaseWorkStarted, false);
});

test('apply identity precheck accepts valid identity input', () => {
  return withApplyIdentityPrecheck({ duplicateRows: [], rowsMissingIdentity: [] }, true, async () => 'continued')
    .then((result) => assert.equal(result, 'continued'));
});

test('dry-run identity findings continue and remain reportable', async () => {
  const validation = {
    duplicateRows: [{ key: 'duplicate-key', firstRow: 2, duplicateRow: 5 }],
    rowsMissingIdentity: [{ row: 7, fields: ['Category'] }]
  };

  let databaseWorkStarted = false;
  await withApplyIdentityPrecheck(validation, false, async () => { databaseWorkStarted = true; });
  assert.equal(databaseWorkStarted, true);
  const report = buildGlobalApplyAssessment(validation);
  assert.deepEqual(report.blockers.map(({ type }) => type), ['DUPLICATE_SOURCE_KEYS', 'MISSING_STABLE_IDENTITY']);
});

function coordinateReconciliationFor(row, existing, validation, panchayatById) {
  return buildCoordinateReconciliationReport(
    [{ rowNumber: 12, sourceData: row }],
    existing ? [{ _id: 'existing-infrastructure-id', sourceKey: stableSourceKey(row), ...existing }] : [],
    validation,
    panchayatById
  )[0];
}

test('source identity is deterministic and normalizes formatting only', () => {
  assert.equal(stableSourceKey(sourceRow), stableSourceKey({ ...sourceRow, Panchayat: ' adyar ', 'Village/Area': 'Adyar;   Arkula' }));
  assert.notEqual(stableSourceKey(sourceRow), stableSourceKey({ ...sourceRow, Category: 'Childcare' }));
});

test('source document retains raw data and never fills missing coordinates or scoring facts', () => {
  const doc = makeInfrastructureDocument({ rowNumber: 2, sourceData: sourceRow }, 'source.xlsx', 'panchayat-id', new Date('2026-09-25T00:00:00Z'));
  assert.equal(doc.dataOrigin, 'SOURCE_EXCEL');
  assert.equal(doc.isSynthetic, false);
  assert.equal(doc.type, 'School');
  assert.equal(doc.sourceStatus, 'Reported');
  assert.equal(doc.normalizedStatus, null);
  assert.equal(doc.sourceReportedQuantity, 'Multiple / verify');
  assert.equal(doc.location, null);
  assert.equal(doc.coordinatesVerified, false);
  assert.equal(doc.coordinateSource, 'UNAVAILABLE');
  assert.equal(doc.coordinateStatus, 'UNVERIFIED');
  assert.equal(doc.priorityScorable, false);
  assert.equal(doc.condition, null);
  assert.equal(doc.complaintsCount, null);
  assert.equal(doc.populationServed, null);
  assert.equal(doc.estimatedMaintenanceCost, null);
  assert.equal(doc.sourceData['Verification / Notes'], sourceRow['Verification / Notes']);
  assert.ok(doc.missingDataFields.includes('coordinates'));
});

test('approximate workbook coordinate metadata maps to the supported approximate provenance and remains in raw data', () => {
  const row = {
    ...sourceRow,
    Latitude: 12.9716,
    Longitude: 77.5946,
    Coordinate_Status: 'APPROXIMATE_DEMO',
    Coordinate_Source: 'PUBLIC_MAP_AREA_CENTER_PLUS_DETERMINISTIC_OFFSET',
    Coordinates_Verified: false
  };
  const doc = makeInfrastructureDocument({ rowNumber: 3, sourceData: row }, 'source.xlsx', 'panchayat-id');

  assert.equal(doc.dataOrigin, 'SOURCE_EXCEL');
  assert.equal(doc.coordinateSource, 'PUBLIC_MAP_APPROXIMATE');
  assert.equal(doc.coordinateStatus, 'APPROXIMATE');
  assert.equal(doc.coordinatesVerified, false);
  assert.equal(doc.sourceData, row);
  assert.equal(doc.sourceData.Coordinate_Source, 'PUBLIC_MAP_AREA_CENTER_PLUS_DETERMINISTIC_OFFSET');
  assert.equal(doc.sourceData.Coordinate_Status, 'APPROXIMATE_DEMO');
});

test('valid coordinates without recognized quality metadata remain unverified Excel coordinates in GeoJSON order', () => {
  const row = { ...sourceRow, Latitude: '12.9716', Longitude: '77.5946' };
  const doc = makeInfrastructureDocument({ rowNumber: 4, sourceData: row }, 'source.xlsx', 'panchayat-id');

  assert.deepEqual(doc.location, { type: 'Point', coordinates: [77.5946, 12.9716] });
  assert.equal(doc.coordinateSource, 'SOURCE_EXCEL');
  assert.equal(doc.coordinateStatus, 'UNVERIFIED');
  assert.equal(doc.coordinatesVerified, false);
});

test('missing, invalid, out-of-range, nonnumeric, and incomplete coordinates are unavailable', () => {
  const cases = [
    { Latitude: null, Longitude: null },
    { Latitude: 91, Longitude: 77.5946 },
    { Latitude: 12.9716, Longitude: 181 },
    { Latitude: 'not-a-number', Longitude: 77.5946 },
    { Latitude: 12.9716, Longitude: undefined }
  ];

  for (const coordinates of cases) {
    const row = {
      ...sourceRow,
      ...coordinates,
      Coordinate_Status: 'APPROXIMATE_DEMO',
      Coordinate_Source: 'PUBLIC_MAP_AREA_CENTER_PLUS_DETERMINISTIC_OFFSET',
      Coordinates_Verified: false
    };
    const doc = makeInfrastructureDocument({ rowNumber: 5, sourceData: row }, 'source.xlsx', 'panchayat-id');

    assert.equal(doc.location, null);
    assert.equal(doc.coordinateSource, 'UNAVAILABLE');
    assert.equal(doc.coordinateStatus, 'UNVERIFIED');
    assert.equal(doc.coordinatesVerified, false);
  }
});

test('workbook verification flag alone does not mark coordinates verified', () => {
  const row = { ...sourceRow, Latitude: 12.9716, Longitude: 77.5946, Coordinates_Verified: true };
  const doc = makeInfrastructureDocument({ rowNumber: 6, sourceData: row }, 'source.xlsx', 'panchayat-id');

  assert.equal(doc.coordinateSource, 'SOURCE_EXCEL');
  assert.equal(doc.coordinateStatus, 'UNVERIFIED');
  assert.equal(doc.coordinatesVerified, false);
});

test('coordinate reconciliation preserves verified FIELD_SURVEY coordinates and structured metadata', () => {
  const row = {
    ...sourceRow,
    Latitude: 12.9716,
    Longitude: 77.5946,
    Coordinate_Status: 'APPROXIMATE_DEMO',
    Coordinate_Source: 'PUBLIC_MAP_AREA_CENTER_PLUS_DETERMINISTIC_OFFSET',
    Coordinates_Verified: false
  };
  const existing = {
    dataOrigin: 'SOURCE_EXCEL',
    location: { type: 'Point', coordinates: [77.6, 12.98] },
    coordinateSource: 'FIELD_SURVEY',
    coordinateStatus: 'VERIFIED',
    coordinatesVerified: true
  };

  const report = coordinateReconciliationFor(row, existing);

  assert.equal(report.decision, 'PRESERVE_VERIFIED_FIELD_SURVEY');
  assert.deepEqual(report.proposed, {
    location: existing.location,
    coordinateSource: 'FIELD_SURVEY',
    coordinateStatus: 'VERIFIED',
    coordinatesVerified: true
  });
  assert.equal(report.locationWouldChange, false);
  assert.equal(report.existingStructuredCoordinateFieldsPreserved, true);
  assert.match(report.reason, /verified FIELD_SURVEY.*preserved/i);
  assert.equal(report.sourceDataCoordinateMetadata.wouldBeReplaced, true);
  assert.equal(report.sourceDataCoordinateMetadata.proposed.Coordinate_Source, 'PUBLIC_MAP_AREA_CENTER_PLUS_DETERMINISTIC_OFFSET');
});

test('coordinate reconciliation preserves existing coordinate fields when incoming coordinates are absent or invalid', () => {
  for (const row of [
    { ...sourceRow },
    { ...sourceRow, Latitude: 'invalid', Longitude: 77.5946 }
  ]) {
    const existing = {
      dataOrigin: 'SOURCE_EXCEL',
      location: { type: 'Point', coordinates: [77.6, 12.98] },
      coordinateSource: 'PUBLIC_MAP_APPROXIMATE',
      coordinateStatus: 'APPROXIMATE',
      coordinatesVerified: false
    };

    const report = coordinateReconciliationFor(row, existing);

    assert.equal(report.decision, 'PRESERVE_EXISTING_COORDINATES');
    assert.deepEqual(report.proposed, {
      location: existing.location,
      coordinateSource: 'PUBLIC_MAP_APPROXIMATE',
      coordinateStatus: 'APPROXIMATE',
      coordinatesVerified: false
    });
    assert.equal(report.locationWouldChange, false);
    assert.equal(report.existingStructuredCoordinateFieldsPreserved, true);
    assert.match(report.reason, /missing or invalid/i);
  }
});

test('coordinate reconciliation reports proposed approximate coordinate metadata and location change', () => {
  const row = {
    ...sourceRow,
    Latitude: 12.9716,
    Longitude: 77.5946,
    Coordinate_Status: 'APPROXIMATE_DEMO',
    Coordinate_Source: 'PUBLIC_MAP_AREA_CENTER_PLUS_DETERMINISTIC_OFFSET',
    Coordinates_Verified: false
  };
  const report = coordinateReconciliationFor(row, {
    dataOrigin: 'SOURCE_EXCEL',
    location: { type: 'Point', coordinates: [77.6, 12.98] },
    coordinateSource: 'SOURCE_EXCEL',
    coordinateStatus: 'UNVERIFIED',
    coordinatesVerified: false
  });

  assert.equal(report.panchayat, 'Adyar');
  assert.equal(report.infrastructure, 'Government education facilities');
  assert.equal(report.sourceKey, stableSourceKey(row));
  assert.equal(report.decision, 'APPLY_INCOMING_COORDINATES');
  assert.deepEqual(report.proposed, {
    location: { type: 'Point', coordinates: [77.5946, 12.9716] },
    coordinateSource: 'PUBLIC_MAP_APPROXIMATE',
    coordinateStatus: 'APPROXIMATE',
    coordinatesVerified: false
  });
  assert.equal(report.locationWouldChange, true);
  assert.equal(report.existingStructuredCoordinateFieldsPreserved, false);
  assert.match(report.reason, /valid incoming coordinates/i);
  assert.equal(report.sourceDataCoordinateMetadata.wouldBeReplaced, true);
});

test('coordinate reconciliation reports ordinary valid Excel coordinates as unverified', () => {
  const row = { ...sourceRow, Latitude: 12.9716, Longitude: 77.5946 };
  const report = coordinateReconciliationFor(row, {
    dataOrigin: 'SOURCE_EXCEL',
    location: null,
    coordinateSource: 'UNAVAILABLE',
    coordinateStatus: 'UNVERIFIED',
    coordinatesVerified: false
  });

  assert.equal(report.proposed.coordinateSource, 'SOURCE_EXCEL');
  assert.equal(report.proposed.coordinateStatus, 'UNVERIFIED');
  assert.equal(report.proposed.coordinatesVerified, false);
  assert.equal(report.locationWouldChange, true);
});

test('coordinate reconciliation proposes an eligible approximate-coordinate insert', () => {
  const row = {
    ...sourceRow,
    Latitude: 12.9716,
    Longitude: 77.5946,
    Coordinate_Status: 'APPROXIMATE_DEMO',
    Coordinate_Source: 'PUBLIC_MAP_AREA_CENTER_PLUS_DETERMINISTIC_OFFSET',
    Coordinates_Verified: false
  };
  const report = coordinateReconciliationFor(row, null);

  assert.equal(report.operation, 'INSERT');
  assert.equal(report.decision, 'PROPOSE_INSERT');
  assert.equal(report.classification, 'ROW_LEVEL_PROPOSAL');
  assert.equal(report.existingDocumentId, null);
  assert.deepEqual(report.proposed, {
    location: { type: 'Point', coordinates: [77.5946, 12.9716] },
    coordinateSource: 'PUBLIC_MAP_APPROXIMATE',
    coordinateStatus: 'APPROXIMATE',
    coordinatesVerified: false
  });
  assert.match(report.reason, /passes the importer identity and duplicate checks/i);
});

test('coordinate reconciliation proposes eligible inserts without inventing missing or invalid coordinates', () => {
  for (const row of [
    { ...sourceRow },
    { ...sourceRow, Latitude: 12.9716, Longitude: 'invalid' }
  ]) {
    const report = coordinateReconciliationFor(row, null);

    assert.equal(report.operation, 'INSERT');
    assert.equal(report.decision, 'PROPOSE_INSERT');
    assert.deepEqual(report.proposed, {
      location: null,
      coordinateSource: 'UNAVAILABLE',
      coordinateStatus: 'UNVERIFIED',
      coordinatesVerified: false
    });
  }
});

test('coordinate reconciliation blocks duplicate rows instead of treating them as inserts', () => {
  const row = { ...sourceRow, Latitude: 12.9716, Longitude: 77.5946 };
  const first = { rowNumber: 20, sourceData: row };
  const duplicate = { rowNumber: 21, sourceData: row };
  const reports = buildCoordinateReconciliationReport(
    [first, duplicate],
    [],
    { duplicateRows: [{ key: stableSourceKey(row), firstRow: 20, duplicateRow: 21 }] }
  );

  assert.equal(reports.length, 2);
  assert.ok(reports.every((report) => report.operation === 'BLOCKED'));
  assert.ok(reports.every((report) => report.decision === 'BLOCKED_DUPLICATE_SOURCE_KEY'));
  assert.ok(reports.every((report) => report.proposed === null));
});

test('coordinate reconciliation blocks a natural-key collision rather than proposing an insert', () => {
  const row = { ...sourceRow, Latitude: 12.9716, Longitude: 77.5946 };
  const panchayatId = 'existing-panchayat-id';
  const collision = buildCoordinateReconciliationReport(
    [{ rowNumber: 12, sourceData: row }],
    [{
      _id: 'natural-key-collision-id',
      sourceKey: 'different-source-key',
      panchayatId,
      name: row['Infrastructure / Facility'],
      location: { type: 'Point', coordinates: [77.5, 12.9] },
      coordinateSource: 'FIELD_SURVEY',
      coordinateStatus: 'VERIFIED',
      coordinatesVerified: true
    }],
    {},
    new Map([[panchayatId, { name: 'Adyar' }]])
  )[0];

  assert.equal(collision.operation, 'BLOCKED');
  assert.equal(collision.decision, 'BLOCKED_BY_NATURAL_KEY_CONFLICT');
  assert.equal(collision.classification, 'GLOBAL_APPLY');
  assert.equal(collision.proposed.location, collision.existing.location);
});

test('apply assessment labels natural-key collisions as global orchestration blockers', () => {
  const assessment = buildGlobalApplyAssessment({}, [
    'Possible name collision with existing infrastructure record-1; no automatic overwrite is planned.'
  ]);

  assert.equal(assessment.status, 'GLOBAL_BLOCKERS_PRESENT');
  assert.equal(assessment.applySuccessVerified, false);
  assert.equal(assessment.blockers[0].scope, 'GLOBAL_APPLY');
  assert.equal(assessment.blockers[0].stage, 'DRY_RUN_ORCHESTRATION_GATE');
  assert.equal(assessment.blockers[0].type, 'NATURAL_KEY_COLLISION');
  assert.match(assessment.blockers[0].message, /record-writing function itself only upserts by sourceKey/i);
  assert.match(assessment.note, /proposals only.*does not prove apply mode will succeed/i);
});

test('apply assessment reports duplicate and missing-identity checks as global import blockers', () => {
  const assessment = buildGlobalApplyAssessment({
    duplicateRows: [{ firstRow: 4, duplicateRow: 8 }],
    rowsMissingIdentity: [{ row: 9, fields: ['Category'] }]
  });

  assert.deepEqual(assessment.blockers.map(({ type, scope, stage }) => ({ type, scope, stage })), [
    { type: 'DUPLICATE_SOURCE_KEYS', scope: 'GLOBAL_APPLY', stage: 'APPLY_IDENTITY_PRECHECK' },
    { type: 'MISSING_STABLE_IDENTITY', scope: 'GLOBAL_APPLY', stage: 'APPLY_IDENTITY_PRECHECK' }
  ]);
  assert.ok(assessment.blockers.every(({ message }) =>
    /before MongoDB connection, backup verification, index creation, or source-record writes/i.test(message)
  ));
});

test('validation conflicts are identified as a pre-report abort, not a normal CLI report result', () => {
  const assessment = buildGlobalApplyAssessment({ conflicts: ['Workbook row conflict'] });
  const row = { ...sourceRow, Latitude: 12.9716, Longitude: 77.5946 };
  const report = coordinateReconciliationFor(row, null, { conflicts: ['Workbook row conflict'] });

  assert.equal(assessment.blockers[0].stage, 'PRE_REPORT_VALIDATION');
  assert.match(assessment.validationConflictBehavior, /throws.*before constructing a dry-run report/i);
  assert.equal(report.decision, 'PRE_REPORT_VALIDATION_ABORT');
  assert.equal(report.classification, 'GLOBAL_APPLY_PRE_REPORT');
  assert.doesNotMatch(report.decision, /BLOCKED_WORKBOOK_VALIDATION/);
});

test('Panchayat document uses only provided administrative fields and has no invented center or wards', () => {
  const doc = makePanchayatDocument({
    Panchayat: 'Adyar', Taluka: 'Mangaluru Taluka', Villages: 'Adyar; Arkula',
    'Number of Villages': 2, 'Administrative Note': 'Adyar GP covers two villages.', Source: 'VillageInfo', sourceRow: 2
  }, 'source.xlsx', new Date('2026-09-25T00:00:00Z'));
  assert.deepEqual(doc.villages, ['Adyar', 'Arkula']);
  assert.equal(doc.taluka, 'Mangaluru Taluka');
  assert.equal(doc.district, undefined);
  assert.equal(doc.state, undefined);
  assert.deepEqual(doc.wards, []);
  assert.equal(doc.centerCoord, null);
  assert.equal(doc.location, null);
  assert.deepEqual(doc.habitations, []);
});
