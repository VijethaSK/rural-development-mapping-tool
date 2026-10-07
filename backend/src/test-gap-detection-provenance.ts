import assert from 'node:assert/strict';
import { Road, School } from './models/Infrastructure.js';
import { Panchayat } from './models/Panchayat.js';
import { GapDetectionService } from './services/spatial/gapDetectionService.js';
import { GAP_ANALYSIS_DEMO_SOURCE } from './services/spatial/gapAnalysisDemoProvenance.js';

const point = (lng: number, lat: number) => ({ type: 'Point', coordinates: [lng, lat] as [number, number] });
const survey = { coordinatesVerified: true, coordinateSource: 'FIELD_SURVEY', coordinateStatus: 'VERIFIED' };
const origin = { lat: 12.87, lng: 74.93 };

const panchayatRecord: any = {
  _id: '64b000000000000000000001',
  centerCoord: origin,
  habitations: [{ name: 'Test Hamlet', ward: 'Ward 1', population: 10, location: point(origin.lng, origin.lat) }]
};
let schools: any[] = [];
let roads: any[] = [];
const schoolModel = School as unknown as { find: (filter: Record<string, unknown>) => { lean: () => Promise<any[]> } };
const roadModel = Road as unknown as { find: (filter: Record<string, unknown>) => { lean: () => Promise<any[]> } };
const panchayatModel = Panchayat as unknown as { findOne: (filter: Record<string, unknown>) => { lean: () => Promise<any> } };
const originalSchoolFind = schoolModel.find;
const originalRoadFind = roadModel.find;
const originalPanchayatFindOne = panchayatModel.findOne;

async function run(): Promise<void> {
  try {
    schoolModel.find = () => ({ lean: async () => schools });
    roadModel.find = () => ({ lean: async () => roads });
    panchayatModel.findOne = () => ({ lean: async () => panchayatRecord });

    schools = [{ _id: 'school-surveyed', name: 'Surveyed School', location: point(origin.lng, origin.lat), ...survey }];
    roads = [{ _id: 'road-surveyed', name: 'Surveyed Road', lineGeometry: { type: 'LineString', coordinates: [[origin.lng + 0.02, origin.lat], [origin.lng + 0.03, origin.lat]] }, ...survey }];
    const verifiedResult = await GapDetectionService.detectUnderservedAreas({ panchayatId: String(panchayatRecord._id), computeNetworkDistance: false, gridResolutionKm: 1 });
    const verifiedHabitation = verifiedResult.underservedAreas.find(area => area.areaType === 'Habitation');
    assert(verifiedHabitation?.nearestSchool, 'verified school point contributes to distance analysis');
    assert(verifiedHabitation?.nearestRoad, 'verified road LineString contributes to distance analysis');
    assert(Number.isFinite(verifiedHabitation.nearestSchool.geographicDistanceKm));
    assert(Number.isFinite(verifiedHabitation.nearestRoad.geographicDistanceKm));

    schools = [{ _id: 'school-approx', name: 'Approximate School', location: point(origin.lng, origin.lat), coordinatesVerified: false, coordinateSource: 'PUBLIC_MAP_APPROXIMATE', coordinateStatus: 'APPROXIMATE' }];
    roads = [{ _id: 'road-unknown', name: 'Unverified Road', lineGeometry: { type: 'LineString', coordinates: [[origin.lng, origin.lat], [origin.lng + 0.01, origin.lat]] }, coordinatesVerified: false, coordinateSource: 'SOURCE_EXCEL', coordinateStatus: 'UNVERIFIED' }];
    const rejectedResult = await GapDetectionService.detectUnderservedAreas({ panchayatId: String(panchayatRecord._id), computeNetworkDistance: false, gridResolutionKm: 1 });
    const rejectedHabitation = rejectedResult.underservedAreas.find(area => area.areaType === 'Habitation');
    assert(rejectedHabitation, 'the existing habitation-origin analysis remains present');
    assert.equal(rejectedHabitation.nearestSchool, undefined);
    assert.equal(rejectedHabitation.nearestRoad, undefined);
    assert.equal(rejectedHabitation.schoolCoverageStatus, 'NO_FACILITY');
    assert.equal(rejectedHabitation.roadCoverageStatus, 'NO_FACILITY');
    assert.equal(rejectedHabitation.schoolDistanceToThresholdRatio, null);
    assert.equal(rejectedHabitation.roadDistanceToThresholdRatio, null);
    assert.equal(rejectedHabitation.distanceToThresholdRatio, null);

    panchayatRecord.source = GAP_ANALYSIS_DEMO_SOURCE;
    panchayatRecord.isSynthetic = true;
    panchayatRecord.dataOrigin = 'SYNTHETIC_DEMO';
    panchayatRecord.coordinatesVerified = false;
    panchayatRecord.coordinateSource = 'SYNTHETIC';
    panchayatRecord.coordinateStatus = 'DEMO_ONLY';
    panchayatRecord.habitations = [{
      name: 'Demo Hamlet', location: point(origin.lng, origin.lat), dataOrigin: 'SYNTHETIC_DEMO',
      isSynthetic: true, coordinatesVerified: false, coordinateSource: 'SYNTHETIC', coordinateStatus: 'DEMO_ONLY'
    }];
    schools = [{
      _id: 'demo-school', name: 'Preview School', location: point(origin.lng, origin.lat),
      source: GAP_ANALYSIS_DEMO_SOURCE, dataOrigin: 'SYNTHETIC_DEMO', isSynthetic: true,
      coordinatesVerified: false, coordinateSource: 'SYNTHETIC', coordinateStatus: 'DEMO_ONLY',
      syntheticDemoRoles: ['GAP_ANALYSIS_FACILITY']
    }];
    roads = [{
      _id: 'demo-road', name: 'Preview Road', lineGeometry: { type: 'LineString', coordinates: [[origin.lng, origin.lat], [origin.lng + 0.01, origin.lat]] },
      source: GAP_ANALYSIS_DEMO_SOURCE, dataOrigin: 'SYNTHETIC_DEMO', isSynthetic: true,
      coordinatesVerified: false, coordinateSource: 'SYNTHETIC', coordinateStatus: 'DEMO_ONLY',
      syntheticDemoRoles: ['GAP_ANALYSIS_ROAD']
    }];
    const ordinaryDemoRead = await GapDetectionService.detectUnderservedAreas({ panchayatId: String(panchayatRecord._id), computeNetworkDistance: false, gridResolutionKm: 1 });
    assert.equal(ordinaryDemoRead.demonstrationGridCells, undefined, 'synthetic rows do not implicitly enable preview mode');
    assert.equal(ordinaryDemoRead.underservedAreas.find(area => area.areaType === 'Habitation')?.nearestSchool, undefined);

    const isolatedPreview = await GapDetectionService.detectUnderservedAreas({ panchayatId: String(panchayatRecord._id), computeNetworkDistance: false, gridResolutionKm: 1, includeSyntheticDemo: true });
    assert(isolatedPreview.demonstrationGridCells?.length, 'explicit preview opt-in includes only the marked synthetic scenario');
    assert(isolatedPreview.demonstrationGridCells?.every(area => area.nearestSchool && area.nearestRoad));
    console.log('PASS: Gap Analysis uses verified facility/road geometry, leaves unverified distances unavailable, and isolates synthetic preview opt-in.');
  } finally {
    schoolModel.find = originalSchoolFind;
    roadModel.find = originalRoadFind;
    panchayatModel.findOne = originalPanchayatFindOne;
  }
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
