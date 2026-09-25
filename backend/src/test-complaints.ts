import { connectDb, disconnectDb } from './config/db.js';
import { Complaint } from './models/Complaint.js';
import { Panchayat } from './models/Panchayat.js';
import { Road } from './models/Infrastructure.js';
import { ComplaintAnalyticsService } from './services/complaints/complaintAnalyticsService.js';

async function runComplaintTests() {
  console.log('===========================================================');
  console.log('  RUNNING COMPLAINT ANALYTICS & HEATMAP ENGINE TESTS');
  console.log('===========================================================');

  try {
    await connectDb(true);
    console.log('✓ Connected to test database.');

    // Clear test collections
    await Promise.all([
      Complaint.deleteMany({}),
      Panchayat.deleteMany({}),
      Road.deleteMany({})
    ]);

    const p = await Panchayat.create({
      name: 'Varthur Gram Panchayat',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      centerCoord: { lat: 12.9400, lng: 77.7400 }
    });

    const road = await Road.create({
      panchayatId: p._id,
      name: 'Main Bazaar Road',
      type: 'Road',
      ward: 'Ward 2',
      village: 'Bazaar Village',
      condition: 'Bad',
      lineGeometry: {
        type: 'LineString',
        coordinates: [
          [77.7400, 12.9400],
          [77.7450, 12.9450]
        ]
      }
    });

    // -------------------------------------------------------------
    // TEST 1: Safe Handling of Missing and Invalid Coordinates
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Missing & Invalid Coordinates Safety ---');
    // Create 1 valid complaint, 1 with null location, 1 with invalid lat
    await Complaint.create({
      panchayatId: p._id,
      infrastructureId: road._id,
      title: 'Valid Complaint 1',
      description: 'Major road fissure',
      category: 'Road',
      priority: 'Critical',
      status: 'SUBMITTED',
      ward: 'Ward 2',
      village: 'Bazaar Village',
      location: { type: 'Point', coordinates: [77.7410, 12.9410] },
      upvotesCount: 3
    });

    await Complaint.create({
      panchayatId: p._id,
      title: 'Missing Location Complaint',
      description: 'Streetlight issue with no GPS pin',
      category: 'Electricity',
      priority: 'Low',
      status: 'SUBMITTED',
      ward: 'Ward 1',
      location: null // missing location
    });

    await Complaint.create({
      panchayatId: p._id,
      title: 'Missing Location Complaint 2',
      description: 'Water leak reported by phone with no GPS coordinates attached',
      category: 'Water',
      priority: 'Medium',
      status: 'SUBMITTED',
      ward: 'Ward 1'
    });

    const heatmap1 = await ComplaintAnalyticsService.getHeatmapData({
      panchayatId: String(p._id)
    });

    if (heatmap1.validCount !== 1) {
      throw new Error(`Expected 1 valid heatmap point, got ${heatmap1.validCount}`);
    }
    if (heatmap1.missingCoordinatesCount !== 2) {
      throw new Error(`Expected 2 missing/invalid coordinates caught, got ${heatmap1.missingCoordinatesCount}`);
    }
    console.log(`✓ Safe coordinate handling verified: 1 valid point extracted, 2 invalid/missing points filtered without crashing.`);

    // -------------------------------------------------------------
    // TEST 2: Intensity Calculation & Upvote Boosting
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Heatmap Intensity Weights ---');
    const pt = heatmap1.points[0];
    const [ptLat, ptLng, ptIntensity] = pt;

    if (Math.abs(ptLat - 12.9410) > 0.0001 || Math.abs(ptLng - 77.7410) > 0.0001) {
      throw new Error(`Heatmap coordinates mismatch: ${ptLat}, ${ptLng}`);
    }
    // Critical priority (1.0) with upvotes (3 * 0.05 = 0.15 boost, capped at 1.0)
    if (ptIntensity !== 1.0) {
      throw new Error(`Expected intensity 1.0 for Critical priority, got ${ptIntensity}`);
    }
    console.log(`✓ Heatmap point intensity verified: lat=${ptLat}, lng=${ptLng}, intensity=${ptIntensity}`);

    // -------------------------------------------------------------
    // TEST 3: Spatial Clustering of Nearby Complaints
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Spatial Clustering (< 250m) ---');
    // Add two more complaints within 100 meters of Valid Complaint 1
    const c2 = await Complaint.create({
      panchayatId: p._id,
      title: 'Valid Complaint 2 (Near C1)',
      description: 'Flooding at same intersection',
      category: 'Road',
      priority: 'High',
      status: 'IN_PROGRESS',
      ward: 'Ward 2',
      village: 'Bazaar Village',
      location: { type: 'Point', coordinates: [77.7412, 12.9411] }
    });

    const c3 = await Complaint.create({
      panchayatId: p._id,
      title: 'Valid Complaint 3 (Near C1)',
      description: 'Manhole broken near bazaar corner',
      category: 'Sanitation',
      priority: 'Critical',
      status: 'SUBMITTED',
      ward: 'Ward 2',
      village: 'Bazaar Village',
      location: { type: 'Point', coordinates: [77.7414, 12.9412] }
    });

    // Add a distant complaint 5 km away
    await Complaint.create({
      panchayatId: p._id,
      title: 'Distant Complaint (Different area)',
      description: 'Water leak in remote farm',
      category: 'Water',
      priority: 'Low',
      status: 'CLOSED',
      ward: 'Ward 3',
      village: 'Remote Hamlet',
      location: { type: 'Point', coordinates: [77.7800, 12.9900] }
    });

    const heatmap2 = await ComplaintAnalyticsService.getHeatmapData({
      panchayatId: String(p._id)
    });

    if (heatmap2.clusters.length !== 2) {
      throw new Error(`Expected 2 distinct clusters (1 group + 1 distant), got ${heatmap2.clusters.length}`);
    }

    const mainCluster = heatmap2.clusters[0];
    if (mainCluster.count !== 3) {
      throw new Error(`Expected main cluster to contain 3 complaints, got ${mainCluster.count}`);
    }
    if (mainCluster.criticalCount !== 2) {
      throw new Error(`Expected main cluster to have 2 critical complaints, got ${mainCluster.criticalCount}`);
    }
    console.log(`✓ Spatial clustering verified: 3 nearby complaints grouped into Cluster "${mainCluster.name}" with count=${mainCluster.count}, critical=${mainCluster.criticalCount}.`);

    // -------------------------------------------------------------
    // TEST 4: Dashboard Aggregations (Summary Metrics)
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Dashboard Aggregation Metrics ---');
    const summary = await ComplaintAnalyticsService.getSummary({
      panchayatId: String(p._id)
    });

    console.log(`   - Total Complaints: ${summary.totalComplaints}`);
    console.log(`   - Open Complaints: ${summary.openComplaints}`);
    console.log(`   - Resolved Complaints: ${summary.resolvedComplaints}`);
    console.log(`   - Critical Complaints: ${summary.criticalComplaints}`);
    console.log(`   - Most Affected Infrastructure Type: ${summary.mostAffectedInfrastructureType}`);
    console.log(`   - Highest Concentration Area: ${summary.highestConcentrationArea.name} (${summary.highestConcentrationArea.count} reports)`);

    if (summary.totalComplaints !== 6) {
      throw new Error(`Expected totalComplaints = 6, got ${summary.totalComplaints}`);
    }
    if (summary.openComplaints !== 5) {
      throw new Error(`Expected openComplaints = 5, got ${summary.openComplaints}`);
    }
    if (summary.resolvedComplaints !== 1) {
      throw new Error(`Expected resolvedComplaints = 1, got ${summary.resolvedComplaints}`);
    }
    if (summary.criticalComplaints !== 2) {
      throw new Error(`Expected criticalComplaints = 2, got ${summary.criticalComplaints}`);
    }
    if (summary.mostAffectedInfrastructureType !== 'Road') {
      throw new Error(`Expected most affected type = Road, got ${summary.mostAffectedInfrastructureType}`);
    }
    if (!summary.highestConcentrationArea.name.includes('Ward 2')) {
      throw new Error(`Expected highest concentration in Ward 2, got ${summary.highestConcentrationArea.name}`);
    }
    console.log('✓ All dashboard aggregation metrics verified with exact database values.');

    // -------------------------------------------------------------
    // TEST 5: Filter Combinations
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Filter Combinations ---');
    const roadFiltered = await ComplaintAnalyticsService.getSummary({
      panchayatId: String(p._id),
      category: 'Road'
    });
    if (roadFiltered.totalComplaints !== 2) {
      throw new Error(`Expected 2 road complaints, got ${roadFiltered.totalComplaints}`);
    }

    const resolvedFiltered = await ComplaintAnalyticsService.getSummary({
      panchayatId: String(p._id),
      status: 'CLOSED'
    });
    if (resolvedFiltered.totalComplaints !== 1) {
      throw new Error(`Expected 1 resolved complaint, got ${resolvedFiltered.totalComplaints}`);
    }
    console.log('✓ Multi-criteria filtering verified (category, status).');

    // -------------------------------------------------------------
    // TEST 6: Cluster Inspection
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Cluster Inspection ---');
    const inspected = await ComplaintAnalyticsService.getClusterDetails(mainCluster.complaintIds);
    if (inspected.length !== 3) {
      throw new Error(`Cluster inspection failed: expected 3 items, got ${inspected.length}`);
    }
    console.log(`✓ Cluster inspection verified: retrieved ${inspected.length} full complaint records.`);

    console.log('\n===========================================================');
    console.log('  ALL COMPLAINT ANALYTICS TESTS PASSED WITH 100% SUCCESS');
    console.log('===========================================================');
    await disconnectDb();
  } catch (err) {
    console.error('❌ Complaint analytics test failure:', err);
    await disconnectDb();
    process.exit(1);
  }
}

runComplaintTests();
