import { connectDb, disconnectDb } from './config/db.js';
import {
  Panchayat,
  User,
  CitizenUser,
  PdoUser,
  AdminUser,
  Infrastructure,
  Road,
  School,
  Healthcare,
  WaterFacility,
  Complaint,
  Assignment,
  Route
} from './models/index.js';

async function runModelTests() {
  console.log('=====================================================');
  console.log('  RUNNING MONGOOSE & GEOJSON MODEL TEST SUITE');
  console.log('=====================================================');

  try {
    await connectDb(true);
    console.log('✓ Connected to isolated in-memory test database.');

    // Clear test collections
    await Promise.all([
      Panchayat.deleteMany({}),
      User.deleteMany({}),
      Infrastructure.deleteMany({}),
      Complaint.deleteMany({}),
      Assignment.deleteMany({}),
      Route.deleteMany({})
    ]);
    console.log('✓ Cleared test collections.');

    // Sync indexes to ensure 2dsphere indexes are immediately available in memory
    await Promise.all([
      Infrastructure.syncIndexes(),
      Complaint.syncIndexes(),
      Route.syncIndexes(),
      Assignment.syncIndexes(),
      User.syncIndexes(),
      Panchayat.syncIndexes()
    ]);
    console.log('✓ Synchronized all indexes (including 2dsphere).');

    // 1. Test Panchayat Model
    console.log('\n--- 1. Testing Panchayat Model ---');
    const panchayat = await Panchayat.create({
      name: 'Test Gram Panchayat',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      wards: ['Ward A', 'Ward B'],
      centerCoord: { lat: 12.9716, lng: 77.5946 },
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      habitations: [
        {
          name: 'Hamlet 1',
          ward: 'Ward A',
          population: 500,
          location: { type: 'Point', coordinates: [77.595, 12.972] }
        }
      ]
    });
    console.log('✓ Panchayat created with ID:', panchayat._id.toString());
    if (panchayat.habitations?.length !== 1) throw new Error('Panchayat habitations count mismatch');

    // 2. Test User Model & Discriminators
    console.log('\n--- 2. Testing User Roles & Discriminators ---');
    const admin = await AdminUser.create({
      name: 'Super Admin',
      email: 'admin.test@panchayat.gov.in',
      username: 'test_admin',
      passwordHash: 'hashed_pw_admin',
      role: 'admin',
      panchayatId: panchayat._id,
      permissions: ['all']
    });
    console.log('✓ AdminUser created:', admin.name, 'Role:', admin.role);

    const pdo = await PdoUser.create({
      name: 'Test Officer',
      email: 'pdo.test@panchayat.gov.in',
      username: 'test_pdo',
      passwordHash: 'hashed_pw_pdo',
      role: 'pdo',
      panchayatId: panchayat._id,
      designation: 'PDO',
      assignedWard: 'Ward A'
    });
    console.log('✓ PdoUser created:', pdo.name, 'Designation:', pdo.designation);

    const citizen = await CitizenUser.create({
      name: 'Test Citizen',
      email: 'citizen.test@gmail.com',
      username: 'test_citizen',
      passwordHash: 'hashed_pw_citizen',
      role: 'citizen',
      panchayatId: panchayat._id,
      voterId: 'VOTER12345'
    });
    console.log('✓ CitizenUser created:', citizen.name, 'Voter ID:', citizen.voterId);

    // Verify polymorphic query
    const allUsers = await User.find({ panchayatId: panchayat._id });
    console.log('✓ Polymorphic User.find() returned', allUsers.length, 'users (expected 3).');
    if (allUsers.length !== 3) throw new Error('User count mismatch');

    // 3. Test Infrastructure Model & Discriminators
    console.log('\n--- 3. Testing Infrastructure Entities & GeoJSON ---');
    const road = await Road.create({
      panchayatId: panchayat._id,
      name: 'Village Link Road #1',
      type: 'Road',
      ward: 'Ward A',
      condition: 'Average',
      status: 'Operational',
      populationServed: 1200,
      trafficLevel: 'High',
      roadLength: 2.4,
      surfaceType: 'Paved',
      roadType: 'Village',
      estimatedRepairCost: 75000,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      lineGeometry: {
        type: 'LineString',
        coordinates: [
          [77.5946, 12.9716],
          [77.5960, 12.9730],
          [77.5980, 12.9750]
        ]
      }
    });
    console.log('✓ Road created with length:', road.roadLength, 'km, line coordinates:', road.lineGeometry?.coordinates.length);

    const school = await School.create({
      panchayatId: panchayat._id,
      name: 'Govt Model Primary School',
      type: 'School',
      ward: 'Ward A',
      condition: 'Good',
      status: 'Operational',
      populationServed: 350,
      studentCount: 180,
      staffCount: 8,
      schoolType: 'Primary',
      management: 'Govt',
      estimatedMaintenanceCost: 25000,
      location: { type: 'Point', coordinates: [77.5955, 12.9725] },
      accessibility: {
        roadAccess: true,
        allWeatherAccessible: true,
        wheelchairAccessible: true,
        distanceToNearestRoadMeters: 10
      },
      facilities: {
        toilets: 'Functional',
        drinkingWater: true,
        playground: true,
        boundaryWall: true,
        electricity: true
      }
    });
    console.log('✓ School created with students:', school.studentCount, 'accessibility roadAccess:', school.accessibility.roadAccess);

    const healthcare = await Healthcare.create({
      panchayatId: panchayat._id,
      name: 'Ward A Health Sub-Center',
      type: 'Healthcare',
      ward: 'Ward A',
      condition: 'Good',
      status: 'Operational',
      populationServed: 2500,
      doctorCount: 1,
      bedCount: 2,
      emergencyAvailable: false,
      location: { type: 'Point', coordinates: [77.5948, 12.9718] }
    });
    console.log('✓ Healthcare facility created:', healthcare.name);

    const water = await WaterFacility.create({
      panchayatId: panchayat._id,
      name: 'Solar Dual Borewell Station',
      type: 'WaterFacility',
      ward: 'Ward A',
      condition: 'Bad',
      status: 'Needs_Maintenance',
      populationServed: 600,
      waterType: 'Borewell',
      functionalStatus: 'Partial',
      capacityLitres: 8000,
      familiesServed: 95,
      waterQualityStatus: 'Potable',
      location: { type: 'Point', coordinates: [77.5952, 12.9722] }
    });
    console.log('✓ WaterFacility created:', water.name, 'Status:', water.functionalStatus);

    // Test polymorphic Infrastructure queries
    const allInfra = await Infrastructure.find({ panchayatId: panchayat._id });
    const onlyRoads = await Road.find({ panchayatId: panchayat._id });
    const onlySchools = await School.find({ panchayatId: panchayat._id });
    console.log(`✓ Infrastructure queries: All=${allInfra.length}, Roads=${onlyRoads.length}, Schools=${onlySchools.length}`);
    if (allInfra.length !== 4 || onlyRoads.length !== 1 || onlySchools.length !== 1) {
      throw new Error('Polymorphic infrastructure query count mismatch');
    }

    // 4. Test 2dsphere Spatial Queries on Infrastructure
    console.log('\n--- 4. Testing 2dsphere Geospatial Index & Queries ---');
    const nearFacilities = await Infrastructure.find({
      location: {
        $nearSphere: {
          $geometry: {
            type: 'Point',
            coordinates: [77.5946, 12.9716]
          },
          $maxDistance: 500 // within 500 meters
        }
      }
    });
    console.log('✓ 2dsphere $nearSphere query returned', nearFacilities.length, 'facilities within 500m.');
    if (nearFacilities.length === 0) throw new Error('Spatial nearSphere query failed to find nearby assets');

    // 5. Test Complaint Model with Images, Comments, and Votes
    console.log('\n--- 5. Testing Complaint Model, Comments & Votes ---');
    const complaint = await Complaint.create({
      panchayatId: panchayat._id,
      infrastructureId: road._id,
      citizenId: citizen._id,
      title: 'Deep crater pothole near primary school gate',
      description: 'Dangerous pothole causing severe traffic slowdown and splashing water on walking schoolchildren.',
      category: 'Road',
      priority: 'High',
      status: 'SUBMITTED',
      ward: 'Ward A',
      village: 'Village Alpha',
      location: { type: 'Point', coordinates: [77.5951, 12.9720] },
      images: [
        {
          url: '/uploads/test-pothole.jpg',
          caption: 'Road surface damage',
          uploadedAt: new Date()
        }
      ],
      comments: [
        {
          userId: citizen._id,
          userName: citizen.name,
          userRole: 'citizen',
          text: 'Happened after yesterday heavy rain.',
          createdAt: new Date()
        }
      ],
      votes: [{ userId: citizen._id, votedAt: new Date() }],
      upvotesCount: 1
    });
    console.log('✓ Complaint created:', complaint.title, 'Upvotes:', complaint.upvotesCount);

    // Test adding another comment and vote
    complaint.comments.push({
      userId: pdo._id,
      userName: pdo.name,
      userRole: 'pdo',
      text: 'Inspecting site tomorrow at 10 AM.',
      createdAt: new Date()
    });
    complaint.votes.push({
      userId: admin._id,
      votedAt: new Date()
    });
    complaint.upvotesCount = complaint.votes.length;
    await complaint.save();

    const updatedComplaint = await Complaint.findById(complaint._id);
    console.log('✓ Updated complaint comments count:', updatedComplaint?.comments.length, 'Votes count:', updatedComplaint?.upvotesCount);
    if (updatedComplaint?.comments.length !== 2 || updatedComplaint?.upvotesCount !== 2) {
      throw new Error('Complaint comment/vote persistence failure');
    }

    // 6. Test Assignment Model
    console.log('\n--- 6. Testing Maintenance Assignment Model ---');
    const assignment = await Assignment.create({
      panchayatId: panchayat._id,
      assignmentNumber: 'ASG-TEST-001',
      title: 'Pothole patch repair',
      description: 'Fill crater using cold-mix bituminous patch',
      infrastructureId: road._id,
      complaintId: complaint._id,
      assignedMember: pdo._id,
      assignedBy: admin._id,
      priority: 'High',
      scheduledDate: new Date(),
      status: 'In_Progress',
      startLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
      allocatedBudget: 15000,
      actualCost: 0
    });
    console.log('✓ Assignment created:', assignment.assignmentNumber, 'Status:', assignment.status);

    // Simulate completion with GPS coordinates and photo
    assignment.status = 'Completed';
    assignment.completionLocation = { type: 'Point', coordinates: [77.5951, 12.9720] };
    assignment.completionImages = [
      {
        url: '/uploads/test-completed.jpg',
        caption: 'Pothole patched and leveled',
        uploadedAt: new Date()
      }
    ];
    assignment.completedAt = new Date();
    assignment.completionNotes = 'Completed 2.5m patch using premix carpet.';
    await assignment.save();
    console.log('✓ Assignment completed with evidence coordinates:', assignment.completionLocation.coordinates);

    // 7. Test Route Model
    console.log('\n--- 7. Testing Route Optimization Model ---');
    const route = await Route.create({
      panchayatId: panchayat._id,
      name: 'Morning Maintenance Tour - Ward A',
      assignedMember: pdo._id,
      startLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
      destinations: [
        {
          infrastructureId: road._id,
          assignmentId: assignment._id,
          name: 'Road Repair Stop',
          location: { type: 'Point', coordinates: [77.5951, 12.9720] },
          priority: 85
        },
        {
          infrastructureId: water._id,
          name: 'Borewell Check Stop',
          location: { type: 'Point', coordinates: [77.5952, 12.9722] },
          priority: 80
        }
      ],
      orderedStops: [
        {
          stopOrder: 1,
          infrastructureId: road._id,
          assignmentId: assignment._id,
          name: 'Road Repair Stop',
          location: { type: 'Point', coordinates: [77.5951, 12.9720] },
          legDistanceMeters: 450,
          legDurationSeconds: 120,
          priorityScore: 85
        },
        {
          stopOrder: 2,
          infrastructureId: water._id,
          name: 'Borewell Check Stop',
          location: { type: 'Point', coordinates: [77.5952, 12.9722] },
          legDistanceMeters: 80,
          legDurationSeconds: 20,
          priorityScore: 80
        }
      ],
      geometry: {
        type: 'LineString',
        coordinates: [
          [77.5946, 12.9716],
          [77.5951, 12.9720],
          [77.5952, 12.9722],
          [77.5946, 12.9716]
        ]
      },
      totalDistance: 1100,
      estimatedDuration: 15,
      algorithmUsed: 'Dijkstra + 2-Opt TSP'
    });
    console.log('✓ Route created:', route.name, 'Total km:', route.totalDistanceKm, 'Stops:', route.orderedStops.length);
    if (route.totalDistanceKm !== 1.1) throw new Error('Route totalDistanceKm calculation failed');

    // 8. Test Coordinate Bounds Validation
    console.log('\n--- 8. Testing Boundary Validation Rules ---');
    let validationFailed = false;
    try {
      await School.create({
        panchayatId: panchayat._id,
        name: 'Invalid School Location',
        type: 'School',
        ward: 'Ward A',
        location: { type: 'Point', coordinates: [250, 95] } // Invalid coordinates!
      });
    } catch (err: any) {
      validationFailed = true;
      console.log('✓ Correctly rejected invalid coordinates:', err.message.slice(0, 80));
    }
    if (!validationFailed) throw new Error('Failed to reject out-of-bounds coordinates');

    console.log('\n=====================================================');
    console.log('  ALL 8 DATABASE MODEL TEST PHASES PASSED SUCCESSFULLY');
    console.log('=====================================================');
  } catch (error) {
    console.error('❌ Model test failed:', error);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}

runModelTests();
