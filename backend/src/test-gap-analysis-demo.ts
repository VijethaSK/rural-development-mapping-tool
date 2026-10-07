import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import identityFixture from './seed/fixtures/rdmt-five-panchayat-demo-identities.json' with { type: 'json' };
import { connectDb, disconnectDb } from './config/db.js';
import { Infrastructure, Road, School } from './models/Infrastructure.js';
import { Panchayat } from './models/Panchayat.js';
import { seedGapAnalysisDemoDataset } from './seed/gapAnalysisDemoDataset.js';
import { GapDetectionService } from './services/spatial/gapDetectionService.js';
import { GAP_ANALYSIS_DEMO_SOURCE } from './services/spatial/gapAnalysisDemoProvenance.js';
import { getVerifiedRoadLineString, getVerifiedSpatialPoint } from './services/spatial/spatialCoordinateEligibility.js';
import { MultiStopOptimizer } from './services/routing/multiStopOptimizer.js';
import { getSyntheticDemoRouteCandidates, getSyntheticDemoRoutingProvider, roadDocumentsToLineInputs } from './services/routing/routingProvider.js';
import { PriorityScoringService } from './services/priorityScoringService.js';

const workbookRows = (identityFixture as any).infrastructures as Array<{ sourceRow: number; sourceKey: string; sourceData: Record<string, unknown> }>;
const panchayatInfo = (identityFixture as any).panchayats as Array<{ sourceRow: number; sourceData: Record<string, unknown> }>;
const expectedSourceCounts: Record<string, number> = { Adyar: 19, Harekala: 16, Neermarga: 18, Pavuru: 30, Pudu: 17 };
const expectedBands = [
  { severity: 'Served', roadRatio: 0.531 },
  { severity: 'Moderate', roadRatio: 1.288 },
  { severity: 'High', roadRatio: 1.72 },
  { severity: 'High', roadRatio: 2 },
  { severity: 'Critical', roadRatio: 2.298 }
] as const;

function normalizedType(row: Record<string, unknown>): string {
  const category = String(row.Category || '').toLowerCase();
  const type = String(row.Type || '').toLowerCase();
  if (category === 'healthcare') return 'Healthcare';
  if (category === 'education') return 'School';
  if (category === 'water') return 'WaterFacility';
  if (category === 'transport' && /(road|bridge|footpath)/.test(type)) return 'Road';
  return 'Other';
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run the isolated demo test with NODE_ENV=production.');
  await connectDb(true);
  try {
    // Simulate the 100 original source records in the disposable memory DB.
    // The demo seed must namespace its keys and leave every source row intact.
    const sourcePanchayats = new Map<string, mongoose.Types.ObjectId>();
    for (const info of panchayatInfo) {
      const name = String(info.sourceData.Panchayat);
      const originalPanchayat = await Panchayat.create({
        name,
        dataOrigin: 'SOURCE_EXCEL',
        sourceKey: `original-workbook-panchayat:${name}`,
        wards: [],
        villages: []
      });
      sourcePanchayats.set(name, originalPanchayat._id as mongoose.Types.ObjectId);
    }
    await Infrastructure.collection.insertMany(workbookRows.map((row) => ({
      _id: new mongoose.Types.ObjectId(),
      panchayatId: sourcePanchayats.get(String(row.sourceData.Panchayat)),
      name: String(row.sourceData['Infrastructure / Facility']),
      type: normalizedType(row.sourceData),
      dataOrigin: 'SOURCE_EXCEL',
      isSynthetic: false,
      sourceKey: row.sourceKey,
      sourceWorkbook: 'Adyar_5_Panchayats_MAX_Infrastructure_Inventory.xlsx',
      sourceWorksheet: 'ALL_Infrastructure',
      sourceRow: row.sourceRow,
      sourceData: row.sourceData,
      location: null,
      coordinatesVerified: false,
      coordinateSource: 'UNAVAILABLE',
      coordinateStatus: 'UNVERIFIED',
      priorityScorable: false
    })));
    const sourceSnapshots = await Infrastructure.find({ dataOrigin: 'SOURCE_EXCEL' }).lean();
    assert.equal(sourceSnapshots.length, 100);

    const first = await seedGapAnalysisDemoDataset();
    assert.deepEqual(first.sourceIdentityCounts, expectedSourceCounts);
    assert.equal(first.sourceIdentityRecordCount, 100);
    assert.equal(first.syntheticCoverageSchoolCount, 45);
    assert.equal(first.syntheticCoverageRoadCount, 45);
    const firstCounts = {
      panchayats: await Panchayat.countDocuments({ source: GAP_ANALYSIS_DEMO_SOURCE }),
      identities: await Infrastructure.countDocuments({ source: GAP_ANALYSIS_DEMO_SOURCE, syntheticDemoRoles: 'WORKBOOK_IDENTITY' }),
      schools: await School.countDocuments({ source: GAP_ANALYSIS_DEMO_SOURCE }),
      roads: await Road.countDocuments({ source: GAP_ANALYSIS_DEMO_SOURCE })
    };
    await seedGapAnalysisDemoDataset();
    assert.deepEqual({
      panchayats: await Panchayat.countDocuments({ source: GAP_ANALYSIS_DEMO_SOURCE }),
      identities: await Infrastructure.countDocuments({ source: GAP_ANALYSIS_DEMO_SOURCE, syntheticDemoRoles: 'WORKBOOK_IDENTITY' }),
      schools: await School.countDocuments({ source: GAP_ANALYSIS_DEMO_SOURCE }),
      roads: await Road.countDocuments({ source: GAP_ANALYSIS_DEMO_SOURCE })
    }, firstCounts, 'rerunning the fixture must upsert the same namespaced demo records');
    assert.deepEqual(firstCounts, { panchayats: 5, identities: 100, schools: 53, roads: 55 });

    const sourceAfter = await Infrastructure.find({ dataOrigin: 'SOURCE_EXCEL' }).lean();
    assert.equal(sourceAfter.length, 100);
    const sourceByKey = new Map(sourceSnapshots.map((item: any) => [item.sourceKey, item]));
    for (const row of workbookRows) {
      const before: any = sourceByKey.get(row.sourceKey);
      const after: any = sourceAfter.find((item: any) => item.sourceKey === row.sourceKey);
      assert(before && after, `source record ${row.sourceKey} remains present`);
      assert.deepEqual(after.sourceData, before.sourceData, `sourceData for ${row.sourceKey} remains unchanged`);
      assert.equal(after.dataOrigin, 'SOURCE_EXCEL');
      assert.equal(after.location, null);
      assert.equal(after.coordinateSource, 'UNAVAILABLE');
      assert.equal(after.coordinatesVerified, false);
    }

    const syntheticPanchayats: any[] = await Panchayat.find({ source: GAP_ANALYSIS_DEMO_SOURCE }).lean();
    assert.equal(syntheticPanchayats.length, 5);
    assert(syntheticPanchayats.every((item) => item.dataOrigin === 'SYNTHETIC_DEMO' && item.coordinatesVerified === false && item.coordinateStatus === 'DEMO_ONLY' && item.coordinateSource === 'SYNTHETIC' && item.isSynthetic === true));
    assert.deepEqual(Object.fromEntries(syntheticPanchayats.map((item) => [item.name, item.lgdCode])), {
      Adyar: '217288', Harekala: '217302', Neermarga: '217320', Pavuru: '217326', Pudu: '217231'
    });
    assert(syntheticPanchayats.every((item) => item.habitations.length > 0 && item.habitations.every((habitation: any) =>
      habitation.dataOrigin === 'SYNTHETIC_DEMO' && habitation.coordinatesVerified === false &&
      habitation.coordinateStatus === 'DEMO_ONLY' && habitation.coordinateSource === 'SYNTHETIC' && habitation.isSynthetic === true)));

    const syntheticRecords: any[] = await Infrastructure.find({ source: GAP_ANALYSIS_DEMO_SOURCE }).lean();
    assert.equal(syntheticRecords.length, 190);
    assert(syntheticRecords.every((record) => record.dataOrigin === 'SYNTHETIC_DEMO' && record.coordinatesVerified === false &&
      record.coordinateStatus === 'DEMO_ONLY' && record.coordinateSource === 'SYNTHETIC' && record.isSynthetic === true && record.priorityScorable === false));
    assert(syntheticRecords.every((record) => record.location?.type === 'Point' && record.location.coordinates.length === 2 &&
      record.location.coordinates.every((coordinate: number) => Number.isFinite(coordinate))));
    assert(syntheticRecords.filter((record) => record.type === 'Road').every((record) =>
      record.lineGeometry?.type === 'LineString' && record.lineGeometry.coordinates.length >= 2));
    assert(syntheticRecords.every((record) => getVerifiedSpatialPoint(record) === null));
    assert(syntheticRecords.filter((record) => record.type === 'Road').every((record) => getVerifiedRoadLineString(record) === null));
    assert.equal(roadDocumentsToLineInputs(syntheticRecords.filter((record) => record.type === 'Road')).length, 0,
      'normal routing graph construction continues to reject synthetic roads');

    const ordinaryAdyar = syntheticPanchayats.find((item) => item.name === 'Adyar');
    const ordinaryAnalysis = await GapDetectionService.calculateAccessibility({
      panchayatId: String(ordinaryAdyar._id), schoolThresholdKm: 3, roadThresholdKm: 1,
      gridResolutionKm: 0.8, computeNetworkDistance: false
    });
    assert.equal(ordinaryAnalysis.syntheticDemonstration, undefined, 'ordinary analysis cannot infer or include demo geometry');
    assert.equal(ordinaryAnalysis.spatialAnalysisAvailable, false, 'synthetic center, habitations, schools, and roads are excluded without preview opt-in');
    assert.equal(ordinaryAnalysis.underservedAreas.length, 0);

    for (const name of Object.keys(expectedSourceCounts)) {
      const panchayat = syntheticPanchayats.find((item) => item.name === name);
      const result = await GapDetectionService.calculateAccessibility({
        panchayatId: String(panchayat._id), schoolThresholdKm: 3, roadThresholdKm: 1,
        gridResolutionKm: 0.8, computeNetworkDistance: false, includeSyntheticDemo: true
      });
      assert.equal(result.syntheticDemonstration, true, `${name} preview opts into the synthetic geometry`);
      assert.equal(result.metrics.totalHabitations, panchayat.habitations.length);
      const targets = first.coverageByPanchayat[name].targetSectorIds.map((id) => {
        const area = result.demonstrationGridCells?.find((candidate) => candidate.id === id);
        assert(area, `${name} actual gap response contains target sector ${id}`);
        return area!;
      });
      console.log(`${name} demo target measurements: ${targets.map((area) => `${area.id}=${area.overallSeverity}/${area.roadDistanceToThresholdRatio}x (${area.nearestRoad?.geographicDistanceKm} km)`).join(', ')}`);
      targets.forEach((area, index) => {
        const expected = expectedBands[index];
        assert(area.nearestSchool, `${name} ${area.id} has a calculated school distance`);
        assert(area.nearestRoad, `${name} ${area.id} has a calculated road distance`);
        assert(Number.isFinite(area.nearestSchool.geographicDistanceKm));
        assert(Number.isFinite(area.nearestRoad.geographicDistanceKm));
        assert.equal(area.schoolCoverageStatus, 'WITHIN_THRESHOLD');
        assert.equal(area.severityBasis, 'ROAD_DISTANCE');
        const expectedSeverity = index === 3 && name !== 'Adyar'
          ? (area.roadDistanceToThresholdRatio! <= 2 ? 'High' : 'Critical')
          : expected.severity;
        assert.equal(area.overallSeverity, expectedSeverity);
        assert(Math.abs((area.roadDistanceToThresholdRatio ?? NaN) - expected.roadRatio) < 0.003,
          `${name} road ratio is based on the generated LineString, expected ${expected.roadRatio}x, got ${area.roadDistanceToThresholdRatio}`);
        assert.equal(area.distanceToThresholdRatio, area.roadDistanceToThresholdRatio);
        assert.equal(result.underservedAreas.some((gap) => gap.id === area.id), expected.severity !== 'Served');
      });
      if (name === 'Adyar') {
        assert(targets.some((area) => area.distanceToThresholdRatio === 2 && area.overallSeverity === 'High'),
          'an exact 2.0x preview sector remains High');
      }
    }

    const adyar = syntheticPanchayats.find((item) => item.name === 'Adyar');
    const routeCandidates = await getSyntheticDemoRouteCandidates(String(adyar._id));
    assert(routeCandidates.length > 0, 'isolated route preview receives only explicitly tagged atomic source stops');
    assert(routeCandidates.every((item: any) => item.syntheticDemo === true && item.priorityScoresAvailable !== true && item.priorityLevel === 'Unavailable'));
    const routeProvider = await getSyntheticDemoRoutingProvider(String(adyar._id));
    const routeResult = await MultiStopOptimizer.optimizeRoute(
      adyar.centerCoord,
      routeCandidates.slice(0, 2).map((item: any) => ({
        infrastructureId: String(item._id),
        infrastructureName: String(item.name),
        type: String(item.type),
        location: item.location,
        priorityScore: 0,
        priorityLevel: 'Unavailable' as const
      })),
      { panchayatId: String(adyar._id), priorityWeight: 0 },
      routeProvider
    );
    assert.equal(routeResult.stopsCount, 2);
    assert.equal(routeResult.provider, 'INTERNAL');
    assert(routeResult.routeGeometry.coordinates.length >= 2, 'preview route returns generated route geometry without external services');

    for (const name of Object.keys(expectedSourceCounts)) {
      const summary = await PriorityScoringService.getRanked({ panchayatId: String(syntheticPanchayats.find((item) => item.name === name)._id), limit: 250 });
      assert.equal(summary.items.length, expectedSourceCounts[name] + 18);
      assert(summary.items.every((item) => item.scoringStatus === 'UNAVAILABLE' && item.priorityScorable === false),
        `${name} synthetic records remain unavailable and unscored in the map/priority API`);
    }

    console.log('PASS: five Panchayat identities and all 100 source rows load repeatably into the isolated preview only.');
    console.log('PASS: 100 original SOURCE_EXCEL source keys and sourceData remain unchanged.');
    console.log('PASS: every generated point/LineString has SYNTHETIC_DEMO provenance and fails trusted analysis/routing helpers.');
    console.log('PASS: ordinary Gap Analysis excludes synthetic data; explicit preview calculates school/road ratios for all five Panchayats.');
    console.log('PASS: Served, Moderate, High, exact 2.0x High, and Critical are calculated from synthetic geometry.');
    console.log('PASS: route preview returns in-memory geometry with priority scoring unavailable and saving handled by the separate verified path.');
    console.log('PASS: no synthetic demo record becomes priority-scoreable.');
  } finally {
    await disconnectDb();
  }
}

main().catch(async (error) => {
  console.error('Gap Analysis demo test failed:', error);
  await disconnectDb();
  process.exit(1);
});
