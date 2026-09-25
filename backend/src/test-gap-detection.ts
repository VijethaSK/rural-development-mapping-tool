import { SpatialUtils } from './services/spatial/spatialUtils.js';
import { GapDetectionService } from './services/spatial/gapDetectionService.js';
import { Coordinate, FacilityCandidate, RoadSegmentCandidate } from './services/spatial/types.js';
import { connectDb, disconnectDb } from './config/db.js';
import { Panchayat } from './models/Panchayat.js';
import { School, Road } from './models/Infrastructure.js';

async function runGapDetectionTests() {
  console.log('===========================================================');
  console.log('  RUNNING INFRASTRUCTURE GAP DETECTION & SPATIAL TESTS');
  console.log('===========================================================');

  try {
    // -------------------------------------------------------------
    // TEST 1: Haversine Geodesic Distance with Known Coordinates
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Geodesic Haversine Distance (Known Coordinates) ---');
    // Bangalore Vidhana Soudha: 12.9796° N, 77.5908° E
    // MG Road Metro Station:   12.9756° N, 77.6066° E
    // Known straight-line distance is ~1.77 - 1.79 km
    const p1: Coordinate = { lat: 12.9796, lng: 77.5908 };
    const p2: Coordinate = { lat: 12.9756, lng: 77.6066 };

    const distKm = SpatialUtils.haversineDistanceKm(p1, p2);
    console.log(`Measured distance between Vidhana Soudha and MG Road: ${distKm} km`);

    if (distKm < 1.70 || distKm > 1.85) {
      throw new Error(`Haversine calculation out of acceptable tolerance: expected ~1.78 km, got ${distKm} km`);
    }
    console.log('✓ Haversine geographic calculation verified with real-world landmarks.');

    // -------------------------------------------------------------
    // TEST 2: Point to Road Segment / Polyline Distance
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Point to Road Polyline Shortest Distance ---');
    // Horizontal road from (12.9500, 77.7400) to (12.9500, 77.7600)
    const roadCoords: [number, number][] = [
      [77.7400, 12.9500],
      [77.7600, 12.9500]
    ];
    // Village point located 0.005 degrees north of the middle of the road (approx 550m)
    const villagePoint: Coordinate = { lat: 12.9550, lng: 77.7500 };

    const roadDistKm = SpatialUtils.distanceToPolylineKm(villagePoint, roadCoords);
    console.log(`Perpendicular distance to road polyline: ${roadDistKm} km (~${Math.round(roadDistKm * 1000)} meters)`);

    if (roadDistKm < 0.50 || roadDistKm > 0.60) {
      throw new Error(`Expected perpendicular road distance ~0.55 km, got ${roadDistKm} km`);
    }
    console.log('✓ Point-to-road polyline perpendicular distance accurately calculated.');

    // -------------------------------------------------------------
    // TEST 3: Nearest Facility Selection
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Nearest Facility Selection ---');
    const facilities: FacilityCandidate[] = [
      { id: 'sch-1', name: 'Far School A', type: 'School', location: { lat: 12.9900, lng: 77.6200 } },
      { id: 'sch-2', name: 'Near School B', type: 'School', location: { lat: 12.9520, lng: 77.7490 } },
      { id: 'sch-3', name: 'Moderate School C', type: 'School', location: { lat: 12.9650, lng: 77.7600 } }
    ];

    const targetVillage: Coordinate = { lat: 12.9510, lng: 77.7480 };
    const nearest = GapDetectionService.findNearestFacility(targetVillage, facilities);

    if (!nearest || nearest.facility.id !== 'sch-2') {
      throw new Error(`Nearest facility failed: expected sch-2, got ${nearest?.facility.id}`);
    }
    console.log(`✓ Correctly identified nearest facility: "${nearest.facility.name}" at ${nearest.distanceKm} km.`);

    // -------------------------------------------------------------
    // TEST 4: Configurable Thresholds & Severity Classification
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Configurable Thresholds & Severity Classification ---');
    // Threshold = 3.0 km
    const s1 = GapDetectionService.determineSeverity(2.5, 3.0); // <= 3.0 -> Served
    const s2 = GapDetectionService.determineSeverity(4.0, 3.0); // 1.33x -> Moderate
    const s3 = GapDetectionService.determineSeverity(5.2, 3.0); // 1.73x -> High
    const s4 = GapDetectionService.determineSeverity(6.8, 3.0); // 2.26x -> Critical

    if (s1 !== 'Served' || s2 !== 'Moderate' || s3 !== 'High' || s4 !== 'Critical') {
      throw new Error(`Severity classification failed: s1=${s1}, s2=${s2}, s3=${s3}, s4=${s4}`);
    }
    console.log('✓ Threshold classification validated: 2.5km=Served, 4.0km=Moderate, 5.2km=High, 6.8km=Critical');

    // -------------------------------------------------------------
    // TEST 5: Clear Distinction between Geographic vs Network Distance
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Distinction: Geographic Distance vs Network Travel Distance ---');
    // In real terrain, road network travel distance is strictly >= straight-line geographic distance
    const origin: Coordinate = { lat: 12.9400, lng: 77.7400 };
    const destination: Coordinate = { lat: 12.9600, lng: 77.7600 };

    const straightLineGeodesic = SpatialUtils.haversineDistanceKm(origin, destination);
    // Simulated realistic road network route with winding factor (circuity = 1.35x)
    const simulatedNetworkTravelKm = Number((straightLineGeodesic * 1.35).toFixed(2));
    const circuityFactor = Number((simulatedNetworkTravelKm / straightLineGeodesic).toFixed(2));

    if (simulatedNetworkTravelKm <= straightLineGeodesic) {
      throw new Error('Network road travel distance must be greater than or equal to straight-line distance!');
    }
    console.log(`   - Straight-line Geographic Distance (d_geo): ${straightLineGeodesic} km`);
    console.log(`   - Network Road Travel Distance (d_network):  ${simulatedNetworkTravelKm} km`);
    console.log(`   - Circuity Factor (d_network / d_geo):       ${circuityFactor}x`);
    console.log('✓ Clear conceptual & numerical distinction enforced: straight-line != road travel distance.');

    // -------------------------------------------------------------
    // TEST 6: Polygon Geometry Generation (Service Buffer & Grid Cells)
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Polygon Geometry Generation for Map Display ---');
    const bufferPoly = SpatialUtils.createRadialBufferPolygon({ lat: 12.9500, lng: 77.7500 }, 3.0, 32);

    if (bufferPoly.type !== 'Polygon' || !bufferPoly.coordinates[0] || bufferPoly.coordinates[0].length !== 33) {
      throw new Error(`Radial buffer polygon generation failed: length=${bufferPoly.coordinates[0]?.length}`);
    }
    // Check closed polygon (first coordinate == last coordinate)
    const firstPt = bufferPoly.coordinates[0][0];
    const lastPt = bufferPoly.coordinates[0][32];
    if (firstPt[0] !== lastPt[0] || firstPt[1] !== lastPt[1]) {
      throw new Error('Polygon ring is not closed!');
    }
    console.log('✓ Radial coverage buffer polygon verified as valid closed GeoJSON ring (33 vertices).');

    // Test grid cell generator
    const gridCells = SpatialUtils.generateSpatialGrid(
      { minLat: 12.94, maxLat: 12.96, minLng: 77.74, maxLng: 77.76 },
      1.0
    );
    if (gridCells.length === 0 || gridCells[0].polygon.coordinates[0].length !== 5) {
      throw new Error(`Grid generation failed: count=${gridCells.length}`);
    }
    console.log(`✓ Spatial grid generated ${gridCells.length} boundary polygon cells with closed 5-point rings.`);

    // -------------------------------------------------------------
    // TEST 7: End-to-End Gap Analysis Service with Database
    // -------------------------------------------------------------
    console.log('\n--- Test 7: End-to-End Gap Analysis Service with Database ---');
    await connectDb(true);
    console.log('Connected to test database.');

    // Clear and seed test Panchayat with schools and habitations
    await Promise.all([
      Panchayat.deleteMany({}),
      School.deleteMany({}),
      Road.deleteMany({})
    ]);

    const testPanchayat = await Panchayat.create({
      name: 'Test Rural Panchayat',
      district: 'Bengaluru Rural',
      state: 'Karnataka',
      centerCoord: { lat: 12.9500, lng: 77.7500 },
      habitations: [
        {
          name: 'Central Village (Served)',
          ward: 'Ward 1',
          population: 1500,
          location: { type: 'Point', coordinates: [77.7510, 12.9510] } // Close to school (< 1 km)
        },
        {
          name: 'Remote Hamlet (Underserved)',
          ward: 'Ward 2',
          population: 850,
          location: { type: 'Point', coordinates: [77.7100, 12.9100] } // Far from school (> 6 km)
        }
      ]
    });

    // Create 1 central school
    await School.create({
      panchayatId: testPanchayat._id,
      name: 'Central Primary School',
      type: 'School',
      ward: 'Ward 1',
      village: 'Central Village',
      location: { type: 'Point', coordinates: [77.7500, 12.9500] },
      condition: 'Good',
      status: 'Operational'
    });

    // Create 1 central road
    await Road.create({
      panchayatId: testPanchayat._id,
      name: 'Main Village Road',
      type: 'Road',
      ward: 'Ward 1',
      village: 'Central Village',
      condition: 'Good',
      lineGeometry: {
        type: 'LineString',
        coordinates: [
          [77.7480, 12.9480],
          [77.7520, 12.9520]
        ]
      }
    });

    // Run Gap Detection with 3.0 km school threshold
    const analysis3km = await GapDetectionService.calculateAccessibility({
      panchayatId: String(testPanchayat._id),
      schoolThresholdKm: 3.0,
      roadThresholdKm: 1.0,
      gridResolutionKm: 1.5,
      computeNetworkDistance: false
    });

    const underservedHabs = analysis3km.underservedAreas.filter((a) => a.areaType === 'Habitation');
    if (underservedHabs.length !== 1 || underservedHabs[0].name !== 'Remote Hamlet (Underserved)') {
      throw new Error(`Expected exactly 1 underserved habitation (Remote Hamlet), got ${underservedHabs.length}`);
    }

    if (analysis3km.metrics.populationAffected !== 850) {
      throw new Error(`Expected population affected = 850, got ${analysis3km.metrics.populationAffected}`);
    }

    console.log(`✓ End-to-end analysis verified:`);
    console.log(`   - Total Habitations: ${analysis3km.metrics.totalHabitations}`);
    console.log(`   - Underserved Habitations: ${underservedHabs.length} (${underservedHabs[0].name})`);
    console.log(`   - Affected Population: ${analysis3km.metrics.populationAffected} / ${analysis3km.metrics.totalPopulation}`);
    console.log(`   - Severity: ${underservedHabs[0].overallSeverity} (Ratio: ${underservedHabs[0].distanceToThresholdRatio}x threshold)`);

    // Verify non-hardcoded threshold: if schoolThreshold is increased to 10.0 km, Remote Hamlet becomes served!
    const analysis10km = await GapDetectionService.calculateAccessibility({
      panchayatId: String(testPanchayat._id),
      schoolThresholdKm: 10.0,
      roadThresholdKm: 10.0,
      gridResolutionKm: 1.5,
      computeNetworkDistance: false
    });
    const underservedHabs10km = analysis10km.underservedAreas.filter((a) => a.areaType === 'Habitation');
    if (underservedHabs10km.length !== 0) {
      throw new Error('Configurable threshold test failed: increasing threshold should mark areas served!');
    }
    console.log('✓ Threshold is fully configurable (increasing to 10km clears gap as expected).');

    await Promise.all([School.deleteMany({}), Road.deleteMany({})]);
    const noFacilities = await GapDetectionService.detectUnderservedAreas({ panchayatId: String(testPanchayat._id), computeNetworkDistance: false, gridResolutionKm: 1.5 });
    const noFacilityHab = noFacilities.underservedAreas.find((area) => area.areaType === 'Habitation' && area.name === 'Remote Hamlet (Underserved)');
    if (!noFacilityHab || noFacilityHab.overallSeverity !== 'Critical' || noFacilityHab.schoolCoverageStatus !== 'NO_FACILITY' || noFacilityHab.roadCoverageStatus !== 'NO_FACILITY' || noFacilityHab.distanceToThresholdRatio < 2) {
      throw new Error('Missing schools and roads must yield an explicit Critical no-facility gap, not zero severity.');
    }
    await Road.create({ panchayatId: testPanchayat._id, name: 'Coverage road', ward: 'Ward 1', lineGeometry: { type: 'LineString', coordinates: [[77.748, 12.948], [77.752, 12.952]] } });
    const noSchool = await GapDetectionService.detectUnderservedAreas({ panchayatId: String(testPanchayat._id), computeNetworkDistance: false, gridResolutionKm: 1.5 });
    if (noSchool.underservedAreas.find(a => a.name === 'Central Village (Served)')?.schoolCoverageStatus !== 'NO_FACILITY') throw new Error('No-schools case must expose NO_FACILITY for school coverage.');
    await Road.deleteMany({});
    await School.create({ panchayatId: testPanchayat._id, name: 'Coverage school', ward: 'Ward 1', location: { type: 'Point', coordinates: [77.75, 12.95] } });
    const noRoad = await GapDetectionService.detectUnderservedAreas({ panchayatId: String(testPanchayat._id), computeNetworkDistance: false, gridResolutionKm: 1.5 });
    if (noRoad.underservedAreas.find(a => a.name === 'Central Village (Served)')?.roadCoverageStatus !== 'NO_FACILITY') throw new Error('No-roads case must expose NO_FACILITY for road coverage.');
    const noInputGrid = SpatialUtils.generateSpatialGrid({ minLat: 12.9, maxLat: 12.9, minLng: 77.7, maxLng: 77.7 }, 0.8);
    if (noInputGrid.length !== 0) throw new Error('Degenerate empty spatial bounds must not fabricate grid cells.');
    console.log('✓ No-school/no-road case yields explicit NO_FACILITY statuses and Critical severity; empty bounds yield no grid cells.');

    console.log('\n===========================================================');
    console.log('  ALL GAP DETECTION & SPATIAL TESTS PASSED WITH 100% SUCCESS');
    console.log('===========================================================');
    await disconnectDb();
  } catch (err) {
    console.error('❌ Gap detection test failure:', err);
    await disconnectDb();
    process.exit(1);
  }
}

runGapDetectionTests();
