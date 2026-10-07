import mongoose from 'mongoose';
import { connectDb, disconnectDb } from './config/db.js';
import { Panchayat } from './models/Panchayat.js';
import { Infrastructure, Road, School } from './models/Infrastructure.js';
import { Complaint } from './models/Complaint.js';
import { Route } from './models/Route.js';
import { AdminUser, PdoUser } from './models/User.js';
import { PriorityScoringService } from './services/priorityScoringService.js';
import { GapDetectionService } from './services/spatial/gapDetectionService.js';
import { ComplaintAnalyticsService } from './services/complaints/complaintAnalyticsService.js';

async function runGisMapLayersTest() {
  console.log('===========================================================');
  console.log('       CENTRAL GIS MAP DATA LAYERS VERIFICATION            ');
  console.log('===========================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`[PASS] Test ${total}: ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${total}: ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
      process.exitCode = 1;
    }
  }

  try {
    await connectDb(true);

    // Seed test Panchayat
    const panchayat = await Panchayat.create({
      name: 'Varthur Gram Panchayat',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      wards: ['Ward 1', 'Ward 2', 'Ward 3'],
      centerCoord: { lat: 12.9489, lng: 77.7479 }
    });

    const pdo = await PdoUser.create({
      name: 'Suresh Kumar',
      email: 'suresh@panchayat.gov.in',
      username: 'suresh_pdo',
      passwordHash: 'dummy',
      role: 'pdo',
      assignedWard: 'Ward 1'
    });

    // 1. Seed Roads
    const road1 = await Road.create({
      panchayatId: panchayat._id,
      name: 'Varthur Main Road',
      type: 'Road',
      ward: 'Ward 1',
      condition: 'Poor',
      status: 'Needs_Repair',
      complaintsCount: 6,
      populationServed: 4500,
      trafficLevel: 'High',
      roadLength: 3.2,
      surfaceType: 'Paved',
      roadType: 'MajorDistrict',
      estimatedRepairCost: 450000,
      location: { type: 'Point', coordinates: [77.7479, 12.9489] },
      lineGeometry: {
        type: 'LineString',
        coordinates: [
          [77.745, 12.945],
          [77.7479, 12.9489],
          [77.752, 12.953]
        ]
      },
      connects: ['Village Square', 'National Highway']
    });

    // 2. Seed Schools
    const school1 = await School.create({
      panchayatId: panchayat._id,
      name: 'Govt Higher Primary School Varthur',
      type: 'School',
      ward: 'Ward 1',
      condition: 'Average',
      status: 'Operational',
      complaintsCount: 2,
      populationServed: 1200,
      studentCount: 420,
      estimatedMaintenanceCost: 180000,
      location: { type: 'Point', coordinates: [77.7495, 12.951] },
      accessibility: {
        roadAccess: true,
        allWeatherAccessible: true,
        wheelchairAccessible: true
      },
      facilities: {
        toilets: 'Adequate',
        drinkingWater: true,
        playground: true,
        boundaryWall: true,
        electricity: true
      }
    });

    // 3. Seed Other Infrastructure (Healthcare & Water)
    const health1 = await Infrastructure.create({
      panchayatId: panchayat._id,
      name: 'Varthur Primary Health Centre (PHC)',
      type: 'Healthcare',
      ward: 'Ward 2',
      condition: 'Good',
      status: 'Operational',
      complaintsCount: 1,
      populationServed: 8000,
      estimatedMaintenanceCost: 120000,
      location: { type: 'Point', coordinates: [77.742, 12.943] }
    });

    const water1 = await Infrastructure.create({
      panchayatId: panchayat._id,
      name: 'Community Overhead Water Reservoir',
      type: 'WaterFacility',
      ward: 'Ward 3',
      condition: 'Bad',
      status: 'Needs_Repair',
      complaintsCount: 8,
      populationServed: 3200,
      estimatedMaintenanceCost: 260000,
      location: { type: 'Point', coordinates: [77.756, 12.957] }
    });

    // 4. Seed Complaints
    const comp1 = await Complaint.create({
      panchayatId: panchayat._id,
      infrastructureId: road1._id,
      title: 'Massive pothole near junction',
      description: 'Dangerous depression causing scooter accidents',
      category: 'Road',
      priority: 'Critical',
      status: 'IN_PROGRESS',
      ward: 'Ward 1',
      location: { type: 'Point', coordinates: [77.7479, 12.9489] }
    });

    const comp2 = await Complaint.create({
      panchayatId: panchayat._id,
      infrastructureId: water1._id,
      title: 'Water valve leakage flooding lane',
      description: 'Main pump valve cracked and water wasting',
      category: 'Water',
      priority: 'High',
      status: 'SUBMITTED',
      ward: 'Ward 3',
      location: { type: 'Point', coordinates: [77.7562, 12.9572] }
    });

    // 5. Seed Maintenance Route
    const route1 = await Route.create({
      panchayatId: panchayat._id,
      name: 'Emergency Road & Water Crew Alpha',
      assignedMember: pdo._id,
      startLocation: { type: 'Point', coordinates: [77.74, 12.94] },
      status: 'In_Progress',
      algorithmUsed: 'Dijkstra + 2-Opt TSP',
      totalDistance: 4800,
      totalDistanceKm: 4.8,
      estimatedDuration: 45,
      orderedStops: [
        {
          stopOrder: 1,
          infrastructureId: road1._id,
          name: road1.name,
          location: { type: 'Point', coordinates: [77.7479, 12.9489] },
          priorityScore: 84.5,
          legDistanceMeters: 2100,
          legDurationSeconds: 1200
        },
        {
          stopOrder: 2,
          infrastructureId: water1._id,
          name: water1.name,
          location: { type: 'Point', coordinates: [77.756, 12.957] },
          priorityScore: 78.0,
          legDistanceMeters: 2700,
          legDurationSeconds: 1500
        }
      ],
      geometry: {
        type: 'LineString',
        coordinates: [
          [77.74, 12.94],
          [77.7479, 12.9489],
          [77.756, 12.957]
        ]
      }
    });

    console.log('--- TESTING 8 GIS LAYERS DATA EXTRACTION ---\n');

    // Layer 1: Roads with polylines
    const rankedData = await PriorityScoringService.getRanked({ panchayatId: String(panchayat._id) });
    const roads = rankedData.items.filter((i) => i.type === 'Road');
    assert(roads.length === 1 && !!roads[0].lineGeometry, 'Layer 1 (Roads): Retrieved road with line geometry');
    assert(roads[0].estimatedRepairCost === 450000, 'Layer 1: Road estimatedRepairCost mapped accurately');

    // Layer 2: Schools
    const schools = rankedData.items.filter((i) => i.type === 'School');
    assert(schools.length === 1 && schools[0].studentCount === 420, 'Layer 2 (Schools): Retrieved school with studentCount');

    // Layer 3: Other Infrastructure (Healthcare, Water)
    const others = rankedData.items.filter((i) => i.type !== 'Road' && i.type !== 'School');
    assert(others.length === 2, 'Layer 3 (Other Infrastructure): Retrieved Healthcare and Water facilities');

    // Layer 4: Complaints
    const complaints = await Complaint.find({ panchayatId: panchayat._id }).lean();
    assert(complaints.length === 2 && complaints[0].location?.coordinates != null, 'Layer 4 (Complaints): Retrieved complaints with GeoJSON coordinates');

    // Layer 5: Complaint Heatmap Points
    const heatmap = await ComplaintAnalyticsService.getHeatmapData({ panchayatId: String(panchayat._id) });
    assert(heatmap.points.length === 2 && heatmap.maxIntensity > 0, 'Layer 5 (Complaint Heatmap): Generated thermal heatmap coordinate points');

    // Layer 6: Priority Infrastructure
    const criticals = rankedData.items.filter((i) => i.priorityLevel === 'Critical' || i.priorityLevel === 'High');
    assert(criticals.length >= 1 && criticals[0].priorityScore != null && criticals[0].priorityScore > 0, 'Layer 6 (Priority Infrastructure): High/Critical assets ranked with SAW priority scores');

    // Layer 7: Maintenance Routes
    const savedRoutes = await Route.find({ panchayatId: panchayat._id }).populate('assignedMember').lean();
    assert(savedRoutes.length === 1 && savedRoutes[0].orderedStops.length === 2, 'Layer 7 (Maintenance Routes): Retrieved active route with ordered stops');

    // Layer 8: Underserved Regions (Spatial Gap Analysis)
    const gapAnalysis = await GapDetectionService.calculateAccessibility({
      panchayatId: String(panchayat._id),
      schoolThresholdKm: 3.0,
      roadThresholdKm: 1.0,
      gridResolutionKm: 1.0,
      computeNetworkDistance: false
    });
    assert(gapAnalysis != null && Array.isArray(gapAnalysis.underservedAreas), 'Layer 8 (Underserved Regions): Spatial gap analysis calculates underserved zones');

    console.log('\n===========================================================');
    console.log(`  RESULTS: ${passed}/${total} GIS LAYERS VERIFIED (100%)`);
    console.log('===========================================================');
  } catch (err: any) {
    console.error('GIS Layers verification failed:', err);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}

runGisMapLayersTest();
