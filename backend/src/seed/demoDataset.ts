import bcrypt from 'bcryptjs';
import {
  Assignment, Complaint, Healthcare, Infrastructure, Panchayat, PdoUser,
  PriorityConfig, Road, Route, School, User, WaterFacility, AdminUser
} from '../models/index.js';
import { PriorityScoringService } from '../services/priorityScoringService.js';
import { SpatialUtils } from '../services/spatial/spatialUtils.js';

const PANCHAYAT_NAME = 'Kerehalli Development Demo Gram Panchayat';
const CENTER = { lat: 13.95, lng: 75.55 };
const WARDS = [
  'Ward 1 - Kerehalli North',
  'Ward 2 - Santhe Maidan',
  'Ward 3 - Areca Belt',
  'Ward 4 - Kallur East',
  'Ward 5 - Halasuru Upland'
];
const VILLAGES = [
  { name: 'Kerehalli Santhe', ward: 1, population: 2480, dx: -0.012, dy: 0.006 },
  { name: 'Halasuru Betta', ward: 5, population: 1730, dx: -0.067, dy: 0.038 },
  { name: 'Areca Thota', ward: 3, population: 3240, dx: -0.025, dy: -0.025 },
  { name: 'Kallur Halla', ward: 4, population: 4420, dx: 0.086, dy: 0.025 },
  { name: 'Dodda Kere', ward: 2, population: 2860, dx: 0.012, dy: 0.014 },
  { name: 'Mavinakoppa', ward: 4, population: 3710, dx: 0.105, dy: -0.038 },
  { name: 'Bettada Beedu', ward: 5, population: 1320, dx: -0.086, dy: -0.031 },
  { name: 'Kumbarakoppa', ward: 3, population: 2190, dx: 0.035, dy: 0.051 },
  { name: 'Hulikal Thanda', ward: 4, population: 1840, dx: 0.125, dy: 0.002 },
  { name: 'Neralekoppa', ward: 1, population: 1560, dx: -0.038, dy: 0.064 },
  { name: 'Bannigudde', ward: 2, population: 2980, dx: 0.041, dy: -0.052 },
  { name: 'Kerehalli Colony', ward: 1, population: 2050, dx: 0.003, dy: -0.004 }
];

const ROAD_NAMES = [
  'Kerehalli Santhe Main Road', 'Halasuru Areca Estate Road', 'Kallur Halla Causeway Road',
  'Dodda Kere Bund Road', 'Mavinakoppa Village Link', 'Bettada Beedu Ghat Approach',
  'Kumbarakoppa School Road', 'Hulikal Thanda Access Road', 'Neralekoppa Milk Route',
  'Bannigudde Tank Road', 'Kerehalli Colony Cross Road', 'North Areca Collection Road',
  'Santhe Maidan Bus Stand Road', 'Kallur Check Dam Link', 'Halasuru Hill Cart Track',
  'Dodda Kere Anganwadi Road', 'Mavinakoppa Lower Hamlet Road', 'Bettada Beedu Forest Edge Road',
  'Kumbarakoppa Market Link', 'Hulikal Primary School Road', 'Neralekoppa Upper Road',
  'Bannigudde Canal Service Road', 'Kerehalli Panchayat Office Road', 'Areca Thota Harvest Road',
  'Kallur East Ridge Road', 'Halasuru Water Tank Road', 'Santhe Maidan Clinic Road',
  'Mavinakoppa Cross Bund Road', 'Dodda Kere Southern Link', 'Hulikal Bus Shelter Road',
  'Bettada Beedu Lower Ghat Road', 'Kumbarakoppa Temple Approach', 'Neralekoppa Anganwadi Link',
  'Kallur Halla Eastern Farm Road'
];
const ROAD_COMPLAINTS = [8, 7, 6, 5, 4, 3, 3, 2, 2, 1, 1, ...Array(23).fill(0)];
const ROAD_CONDITIONS = [
  'Bad', 'Bad', 'Poor', 'Bad', 'Poor', 'Poor', 'Average', 'Bad', 'Average', 'Poor', 'Good', 'Average',
  'Good', 'Average', 'Poor', 'Good', 'Average', 'Good', 'Average', 'Poor', 'Good', 'Average', 'Good',
  'Poor', 'Average', 'Good', 'Average', 'Good', 'Poor', 'Good', 'Average', 'Good', 'Average', 'Good'
];
const ROAD_POPULATION = [7200, 6100, 4800, 8100, 3500, 2800, 4200, 5600, 1800, 2300, 900, 3900, 6700, 3100, 1200, 2700, 5400, 850, 2100, 3300, 1600, 5100, 4400, 1900, 6200, 1400, 7600, 2600, 3700, 1100, 4900, 2200, 1300, 3000];
const ROAD_TRAFFIC = ['High', 'High', 'High', 'High', 'Medium', 'Medium', 'High', 'High', 'Medium', 'Medium', 'Low', 'Medium', 'High', 'Medium', 'Low', 'Low', 'High', 'Low', 'Medium', 'Medium', 'Low', 'High', 'High', 'Low', 'Medium', 'Low', 'High', 'Medium', 'Medium', 'Low', 'Medium', 'Low', 'Low', 'Medium'];
const ROAD_REPAIR_YEARS = [2019, 2020, 2021, 2019, 2022, 2023, 2022, 2020, 2025, 2023, 2025, 2022, 2024, 2021, 2020, 2025, 2023, 2025, 2024, 2021, 2025, 2022, 2024, 2020, 2023, 2025, 2024, 2022, 2023, 2025, 2021, 2024, 2025, 2023];
const ROAD_COSTS = [640000, 520000, 430000, 610000, 365000, 295000, 410000, 485000, 175000, 210000, 98000, 335000, 570000, 275000, 155000, 195000, 455000, 112000, 180000, 300000, 145000, 425000, 390000, 165000, 515000, 130000, 590000, 235000, 320000, 105000, 440000, 190000, 125000, 265000];

const SCHOOL_NAMES = [
  'Government Lower Primary School, Kerehalli', 'Government Higher Primary School, Areca Thota',
  'Kallur Halla Government Primary School', 'Halasuru Government Lower Primary School',
  'Dodda Kere Model Government School', 'Bannigudde Government Primary School',
  'Kumbarakoppa Aided Higher Primary School', 'Neralekoppa Government Lower Primary School',
  'Mavinakoppa Government Primary School', 'Santhe Maidan Government High School',
  'Kerehalli Composite Government School', 'Bettada Beedu Lower Primary School',
  'Hulikal Thanda Government Primary School', 'Areca Belt Aided High School',
  'Kallur East Government Higher Primary School', 'Halasuru Residential School',
  'Mavinakoppa Anganwadi Learning Centre', 'Kerehalli Urdu Higher Primary School'
];
const SCHOOL_COMPLAINTS = [5, 4, 3, 2, 1, 1, 1, ...Array(11).fill(0)];
const SCHOOL_CONDITIONS = ['Poor', 'Bad', 'Average', 'Poor', 'Good', 'Average', 'Good', 'Good', 'Average', 'Poor', 'Good', 'Good', 'Average', 'Poor', 'Good', 'Average', 'Good', 'Good'];
const SCHOOL_POPULATION = [680, 540, 460, 310, 720, 260, 390, 170, 430, 1150, 860, 145, 220, 740, 580, 330, 180, 510];
const SCHOOL_YEARS = [2020, 2019, 2022, 2021, 2025, 2023, 2025, 2024, 2022, 2020, 2025, 2024, 2023, 2019, 2025, 2022, 2024, 2025];

const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'PRIORITY_SET', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CLOSED', 'REJECTED'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const COMPLAINT_TEXT: Record<string, { title: string; description: string }> = {
  Road: { title: 'Potholes and rain damage', description: 'Residents report potholes, loose gravel and poor monsoon drainage on this public road.' },
  School: { title: 'School facility needs attention', description: 'A school facility or safe-access issue was recorded for Panchayat follow-up.' },
  Healthcare: { title: 'Primary health centre service issue', description: 'A building, water or essential service maintenance issue was reported at the public health facility.' },
  Water: { title: 'Community water point repair', description: 'The public water point has reduced flow or needs inspection and repair.' },
  Sanitation: { title: 'Drain and waste collection issue', description: 'Residents report a blocked drain or missed waste collection near the habitation.' },
  Electricity: { title: 'Public lighting outage', description: 'Street lighting or a public electrical connection requires inspection.' }
};

const point = (dx: number, dy: number) => ({ type: 'Point' as const, coordinates: [Number((CENTER.lng + dx).toFixed(6)), Number((CENTER.lat + dy).toFixed(6))] as [number, number] });
const fixedDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const dateForRepairYear = (year: number, index: number) => fixedDate(year, (index % 12) + 1, (index % 24) + 1);

async function upsert(model: any, filter: Record<string, unknown>, data: Record<string, unknown>) {
  return model.findOneAndUpdate(filter, { $set: data }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
}

async function upsertInfrastructure(model: any, filter: Record<string, unknown>, data: Record<string, unknown>) {
  const existing = await model.findOne(filter);
  if (!existing) return model.create(data);
  existing.set(data);
  return existing.save();
}

async function ensureDemoAccount(model: any, data: Record<string, any>) {
  const existing = await User.findOne({ username: data.username });
  if (existing && existing.role !== data.role) {
    throw new Error(`Demo account username '${data.username}' is already used by a different role.`);
  }
  if (existing) {
    const { role: _role, ...updates } = data;
    await model.updateOne({ _id: existing._id }, { $set: updates }, { runValidators: true });
    return User.findById(existing._id);
  }
  return model.create(data);
}

export async function seedDemoDataset(): Promise<void> {
  console.log('Ensuring repeatable rural infrastructure development demo dataset...');

  const panchayat = await upsert(Panchayat, { name: PANCHAYAT_NAME }, {
    name: PANCHAYAT_NAME,
    dataOrigin: 'DEMO',
    district: 'Shivamogga (fictional demo jurisdiction)',
    state: 'Karnataka',
    wards: WARDS,
    centerCoord: CENTER,
    location: { type: 'Point', coordinates: [CENTER.lng, CENTER.lat] },
    habitations: VILLAGES.map((village) => ({
      name: village.name,
      ward: WARDS[village.ward - 1],
      population: village.population,
      location: point(village.dx, village.dy)
    }))
  });

  const passwordHash = await bcrypt.hash('DemoAccess2026!', 10);
  const admin: any = await ensureDemoAccount(AdminUser, {
    name: 'DEMO ACCOUNT - Panchayat Administrator',
    username: 'demo_admin',
    email: 'demo_admin@rural-demo.invalid',
    passwordHash,
    role: 'admin',
    isDemoAccount: true,
    panchayatId: panchayat._id,
    permissions: ['manage_users', 'configure_weights', 'verify_work', 'manage_infrastructure']
  });

  const pdoDefinitions = [
    ['demo_pdo_north', 'DEMO ACCOUNT - PDO North Circle', 1],
    ['demo_pdo_central', 'DEMO ACCOUNT - PDO Central Circle', 2],
    ['demo_pdo_east', 'DEMO ACCOUNT - PDO East Circle', 4],
    ['demo_member_schools', 'DEMO ACCOUNT - School Works Member', 3]
  ] as const;
  const members: any[] = [];
  for (const [username, name, wardNumber] of pdoDefinitions) {
    members.push(await ensureDemoAccount(PdoUser, {
      name,
      username,
      email: `${username}@rural-demo.invalid`,
      passwordHash,
      role: 'pdo',
      isDemoAccount: true,
      panchayatId: panchayat._id,
      designation: username === 'demo_member_schools' ? 'Junior_Engineer' : 'PDO',
      assignedWard: WARDS[wardNumber - 1],
      department: 'Development Demo - Rural Works'
    }));
  }

  await upsert(PriorityConfig, { panchayatId: panchayat._id }, {
    panchayatId: panchayat._id,
    name: 'Development Demo Priority Weights',
    weights: { condition: 0.30, complaints: 0.20, population: 0.15, traffic: 0.15, maintenanceAge: 0.10, alternativeDistance: 0.10 },
    thresholds: { critical: 80, high: 60, medium: 40, low: 0 },
    limits: { maxComplaintsCap: 5, maxPopulationCap: 5000, maxMaintenanceAgeDays: 1095, maxAlternativeDistanceKm: 5 },
    updatedBy: admin._id
  });

  const assets: any[] = [];
  for (let i = 0; i < ROAD_NAMES.length; i++) {
    const gridStep = 0.014;
    const gridStartLng = CENTER.lng - 0.042;
    const gridStartLat = CENTER.lat - 0.028;
    const horizontal = i < 30;
    let lineCoordinates: [number, number][];
    let location: any;
    if (horizontal) {
      const row = Math.floor(i / 6);
      const col = i % 6;
      const lat = Number((gridStartLat + row * gridStep).toFixed(6));
      const west = Number((gridStartLng + col * gridStep).toFixed(6));
      const middle = Number((west + gridStep / 2).toFixed(6));
      const east = Number((west + gridStep).toFixed(6));
      lineCoordinates = [[west, lat], [middle, lat], [east, lat]];
      location = { type: 'Point', coordinates: [middle, lat] };
    } else {
      const col = i - 29;
      const lng = Number((gridStartLng + col * gridStep).toFixed(6));
      lineCoordinates = Array.from({ length: 5 }, (_, row) => [lng, Number((gridStartLat + row * gridStep).toFixed(6))] as [number, number]);
      location = { type: 'Point', coordinates: [lng, Number((gridStartLat + 2 * gridStep).toFixed(6))] };
    }
    const condition = ROAD_CONDITIONS[i];
    const status = condition === 'Bad' ? 'Needs_Repair' : condition === 'Poor' ? 'Needs_Maintenance' : condition === 'Average' && i % 2 === 0 ? 'Under_Maintenance' : 'Operational';
    const road: any = await upsertInfrastructure(Road, { panchayatId: panchayat._id, name: ROAD_NAMES[i] }, {
      panchayatId: panchayat._id,
      dataOrigin: 'DEMO',
      isSynthetic: true,
      description: `Development demo road asset ${String(i + 1).padStart(2, '0')} serving ${VILLAGES[i % VILLAGES.length].name} and nearby farms.`,
      ward: WARDS[i % WARDS.length],
      village: VILLAGES[i % VILLAGES.length].name,
      location,
      condition,
      status,
      complaintsCount: ROAD_COMPLAINTS[i],
      populationServed: ROAD_POPULATION[i],
      lastMaintenanceDate: dateForRepairYear(ROAD_REPAIR_YEARS[i], i),
      priorityScore: 0,
      estimatedMaintenanceCost: ROAD_COSTS[i],
      trafficLevel: ROAD_TRAFFIC[i],
      roadLength: Number((0.8 + (i % 7) * 0.47).toFixed(2)),
      lengthKm: Number((0.8 + (i % 7) * 0.47).toFixed(2)),
      surfaceType: i % 5 === 0 ? 'Kaccha' : i % 3 === 0 ? 'Gravel' : 'Paved',
      roadType: i % 6 === 0 ? 'Panchayat' : 'Village',
      lastRepairDate: dateForRepairYear(ROAD_REPAIR_YEARS[i], i),
      estimatedRepairCost: ROAD_COSTS[i],
      lineGeometry: { type: 'LineString', coordinates: lineCoordinates },
      geometry: { type: 'LineString', coordinates: lineCoordinates },
      connects: [ROAD_NAMES[(i + 1) % ROAD_NAMES.length], VILLAGES[i % VILLAGES.length].name]
    });
    assets.push(road);
  }

  for (let i = 0; i < SCHOOL_NAMES.length; i++) {
    const dx = ((i % 6) - 3) * 0.012;
    const dy = (Math.floor(i / 6) - 1) * 0.016;
    const condition = SCHOOL_CONDITIONS[i];
    const school: any = await upsertInfrastructure(School, { panchayatId: panchayat._id, name: SCHOOL_NAMES[i] }, {
      panchayatId: panchayat._id,
      dataOrigin: 'DEMO',
      isSynthetic: true,
      description: 'Fictional development-demo government/aided school record for service coverage analysis.',
      ward: WARDS[i % WARDS.length],
      village: VILLAGES[i % VILLAGES.length].name,
      location: point(dx, dy),
      condition,
      status: condition === 'Bad' || condition === 'Poor' ? 'Needs_Maintenance' : 'Operational',
      complaintsCount: SCHOOL_COMPLAINTS[i],
      populationServed: SCHOOL_POPULATION[i],
      lastMaintenanceDate: dateForRepairYear(SCHOOL_YEARS[i], i),
      priorityScore: 0,
      estimatedMaintenanceCost: 85000 + (i % 6) * 27500,
      schoolType: i % 5 === 0 ? 'HighSchool' : i % 4 === 0 ? 'PUC' : 'Primary',
      management: i % 5 === 0 ? 'Aided' : 'Govt',
      medium: i % 3 === 0 ? 'Kannada and English' : 'Kannada',
      classesFrom: 1,
      classesTo: i % 5 === 0 ? 10 : i % 4 === 0 ? 12 : 7,
      studentCount: SCHOOL_POPULATION[i],
      staffCount: 5 + (i % 13),
      accessibility: {
        roadAccess: i % 7 !== 0,
        allWeatherAccessible: i % 6 !== 0,
        wheelchairAccessible: i % 4 === 0,
        distanceToNearestRoadMeters: i % 7 === 0 ? 720 : 45 + (i % 8) * 38,
        notes: i % 7 === 0 ? 'Demo record: seasonal approach needs improvement.' : 'Demo access record; verify during field survey.'
      },
      facilities: {
        toilets: i % 6 === 0 ? 'Needs Repair' : 'Functional',
        drinkingWater: i % 8 !== 0,
        playground: i % 3 !== 0,
        boundaryWall: i % 4 !== 0,
        electricity: i % 9 !== 0
      }
    });
    assets.push(school);
  }

  const healthcareNames = ['Kerehalli Primary Health Sub-Centre', 'Kallur Rural Health and Wellness Centre', 'Halasuru Mobile Clinic Base'];
  const healthcareComplaintCounts = [2, 1, 0];
  for (let i = 0; i < healthcareNames.length; i++) {
    const condition = ['Average', 'Poor', 'Good'][i];
    assets.push(await upsertInfrastructure(Healthcare, { panchayatId: panchayat._id, name: healthcareNames[i] }, {
      panchayatId: panchayat._id, dataOrigin: 'DEMO', isSynthetic: true, description: 'Fictional public health facility included for development-demo planning.',
      ward: WARDS[i * 2], village: VILLAGES[i * 3].name, location: point([-0.018, 0.018, -0.052][i], [0.002, 0.026, 0.031][i]),
      condition, status: condition === 'Poor' ? 'Needs_Repair' : 'Operational', complaintsCount: healthcareComplaintCounts[i],
      populationServed: [9800, 5700, 3600][i], lastMaintenanceDate: dateForRepairYear([2021, 2020, 2025][i], i), priorityScore: 0,
      estimatedMaintenanceCost: [260000, 315000, 145000][i], healthType: i === 0 ? 'PHC' : 'SubCenter', doctorCount: i === 0 ? 3 : 1,
      bedCount: i === 0 ? 8 : 2, emergencyAvailable: i === 0
    }));
  }

  const waterNames = ['Kerehalli Overhead Tank and Pump', 'Areca Belt Community Borewell', 'Kallur Halla Mini Water Scheme', 'Halasuru Rainwater Storage Tank'];
  const waterComplaintCounts = [3, 2, 1, 0];
  for (let i = 0; i < waterNames.length; i++) {
    const condition = ['Poor', 'Average', 'Good', 'Good'][i];
    assets.push(await upsertInfrastructure(WaterFacility, { panchayatId: panchayat._id, name: waterNames[i] }, {
      panchayatId: panchayat._id, dataOrigin: 'DEMO', isSynthetic: true, description: 'Fictional Panchayat water asset for maintenance-planning demonstrations.',
      ward: WARDS[[1, 2, 3, 4][i]], village: VILLAGES[[0, 2, 3, 6][i]].name, location: point([-0.008, -0.024, 0.094, -0.072][i], [-0.012, -0.022, 0.022, -0.028][i]),
      condition, status: i === 0 ? 'Needs_Repair' : i === 1 ? 'Needs_Maintenance' : 'Operational', complaintsCount: waterComplaintCounts[i],
      populationServed: [3400, 2250, 4100, 990][i], lastMaintenanceDate: dateForRepairYear([2020, 2022, 2025, 2024][i], i), priorityScore: 0,
      estimatedMaintenanceCost: [285000, 165000, 225000, 95000][i], waterType: ['OverheadTank', 'Borewell', 'ROPlant', 'OpenWell'][i],
      functionalStatus: i === 0 ? 'Partial' : 'Functional', capacityLitres: [30000, 7500, 12000, 5000][i],
      familiesServed: [420, 260, 510, 125][i], waterQualityStatus: i === 0 ? 'Untested' : 'Potable'
    }));
  }

  const priorityConfig: any = await PriorityConfig.findOne({ panchayatId: panchayat._id }).lean();
  const scoringConfig = priorityConfig || await PriorityConfig.findOne().sort({ updatedAt: -1 }).lean() || {
    weights: { condition: 0.3, complaints: 0.2, population: 0.15, traffic: 0.15, maintenanceAge: 0.1, alternativeDistance: 0.1 },
    thresholds: { critical: 80, high: 60, medium: 40, low: 0 },
    limits: { maxComplaintsCap: 5, maxPopulationCap: 5000, maxMaintenanceAgeDays: 1095, maxAlternativeDistanceKm: 5 }
  };
  for (const asset of assets) {
    const calculated = PriorityScoringService.calculate(asset, scoringConfig);
    await Infrastructure.updateOne({ _id: asset._id }, { $set: { priorityScore: calculated.priorityScore } });
    asset.priorityScore = calculated.priorityScore;
  }

  const assetComplaintReferences = new Map<string, any[]>();
  const incidentIndex = { value: 0 };
  const addComplaint = async (asset: any, category: string, ward: string, village: string, base: any, offset: number) => {
    incidentIndex.value++;
    const number = incidentIndex.value;
    const categoryText = COMPLAINT_TEXT[category] || COMPLAINT_TEXT.Other;
    const location = asset?.location?.coordinates
      ? { type: 'Point', coordinates: [asset.location.coordinates[0] + Math.sin(number) * 0.00045, asset.location.coordinates[1] + Math.cos(number) * 0.00045] }
      : point(base.dx + Math.sin(number) * 0.0005, base.dy + Math.cos(number) * 0.0005);
    const year = 2026;
    const month = ((number * 3) % 8) + 1;
    const createdAt = fixedDate(year, month, (number * 7) % 27 + 1);
    const status = STATUSES[(number * 5 + Math.floor(number / 3)) % STATUSES.length];
    const priority = PRIORITIES[(number * 3 + Math.floor(number / 4)) % PRIORITIES.length];
    const title = `DEMO-${String(number).padStart(3, '0')} ${categoryText.title} - ${village}`;
    const complaint: any = await upsert(Complaint, { panchayatId: panchayat._id, title }, {
      panchayatId: panchayat._id,
      dataOrigin: 'DEMO',
      isSynthetic: true,
      infrastructureId: asset?._id,
      title,
      description: `${categoryText.description} Location: ${village}, ${ward}. This is synthetic development/demo data.`,
      category,
      priority,
      status,
      statusHistory: [{ newStatus: status, toStatus: status, status, changedByName: 'DEMO DATASET', changedByRole: 'system', comment: 'Synthetic development/demo fixture.', notes: 'Synthetic development/demo fixture.', timestamp: createdAt }],
      ward,
      village,
      location,
      images: [],
      comments: [],
      votes: [],
      upvotesCount: 0,
      createdAt,
      updatedAt: createdAt
    });
    if (asset) {
      const key = String(asset._id);
      const refs = assetComplaintReferences.get(key) || [];
      refs.push(complaint);
      assetComplaintReferences.set(key, refs);
    }
    return complaint;
  };

  for (let i = 0; i < ROAD_NAMES.length; i++) {
    const asset = assets.find((item) => item.name === ROAD_NAMES[i]);
    for (let n = 0; n < ROAD_COMPLAINTS[i]; n++) await addComplaint(asset, 'Road', asset.ward, asset.village, VILLAGES[i % VILLAGES.length], n);
  }
  for (let i = 0; i < SCHOOL_NAMES.length; i++) {
    const asset = assets.find((item) => item.name === SCHOOL_NAMES[i]);
    for (let n = 0; n < SCHOOL_COMPLAINTS[i]; n++) await addComplaint(asset, 'School', asset.ward, asset.village, VILLAGES[i % VILLAGES.length], n);
  }
  for (let i = 0; i < healthcareNames.length; i++) {
    const asset = assets.find((item) => item.name === healthcareNames[i]);
    for (let n = 0; n < healthcareComplaintCounts[i]; n++) await addComplaint(asset, 'Healthcare', asset.ward, asset.village, VILLAGES[i % VILLAGES.length], n);
  }
  for (let i = 0; i < waterNames.length; i++) {
    const asset = assets.find((item) => item.name === waterNames[i]);
    for (let n = 0; n < waterComplaintCounts[i]; n++) await addComplaint(asset, 'Water', asset.ward, asset.village, VILLAGES[i % VILLAGES.length], n);
  }
  const generalIncidents: [string, number][] = [
    ['Sanitation', 0], ['Sanitation', 3], ['Sanitation', 5], ['Sanitation', 8],
    ['Electricity', 1], ['Electricity', 4], ['Electricity', 7], ['Electricity', 10],
    ['Sanitation', 2], ['Electricity', 9]
  ];
  for (const [category, villageIndex] of generalIncidents) {
    const village = VILLAGES[villageIndex];
    const word = WARDS[village.ward - 1];
    await addComplaint(null, category, word, village.name, village, 0);
  }

  // Keep denormalized complaint counters consistent with the deterministic complaint records.
  for (const asset of assets) {
    const count = assetComplaintReferences.get(String(asset._id))?.length || 0;
    await Infrastructure.updateOne({ _id: asset._id }, { $set: { complaintsCount: count } });
  }

  const assignments: any[] = [];
  const assignmentPlan = [
    [0, 0, 'Critical', 'In_Progress'], [1, 1, 'Critical', 'Assigned'], [2, 2, 'High', 'Accepted'],
    [3, 3, 'High', 'In_Progress'], [4, 4, 'High', 'Assigned'], [5, 5, 'Medium', 'Completed'],
    [6, 6, 'High', 'Verified'], [7, 7, 'Medium', 'Assigned'], [34, 8, 'High', 'In_Progress'],
    [35, 9, 'Medium', 'Completed'], [38, 10, 'High', 'Accepted'], [40, 11, 'Medium', 'Assigned']
  ] as const;
  for (let i = 0; i < assignmentPlan.length; i++) {
    const [assetIndex, memberIndex, priority, status] = assignmentPlan[i];
    const asset = assets[assetIndex];
    const existingComplaints = assetComplaintReferences.get(String(asset._id)) || [];
    const assignedDate = fixedDate(2026, 4 + (i % 5), 4 + (i % 20));
    const assignment: any = await upsert(Assignment, { assignmentNumber: `DEMO-ASG-2026-${String(i + 1).padStart(3, '0')}` }, {
      panchayatId: panchayat._id,
      dataOrigin: 'DEMO',
      isSynthetic: true,
      assignmentNumber: `DEMO-ASG-2026-${String(i + 1).padStart(3, '0')}`,
      title: `DEMO WORK - ${asset.name} ${status === 'Verified' ? 'inspection' : 'maintenance'}`,
      description: `Development demo work order for ${asset.name}; verify quantities and scope before real use.`,
      infrastructureId: asset._id,
      complaintId: existingComplaints[i % Math.max(1, existingComplaints.length)]?._id,
      assignedMember: members[memberIndex % members.length]._id,
      assignedBy: admin._id,
      priority,
      scheduledDate: assignedDate,
      targetCompletionDate: fixedDate(2026, Math.min(12, assignedDate.getUTCMonth() + 1), Math.min(27, assignedDate.getUTCDate() + 12)),
      status,
      startLocation: { type: 'Point', coordinates: [CENTER.lng, CENTER.lat] },
      completionLocation: ['Completed', 'Verified'].includes(status) ? asset.location : undefined,
      completionImages: [],
      completionNotes: ['Completed', 'Verified'].includes(status) ? 'DEMO fixture completion note.' : '',
      completedAt: ['Completed', 'Verified'].includes(status) ? fixedDate(2026, 7, 18 + (i % 10)) : undefined,
      verifiedBy: status === 'Verified' ? admin._id : undefined,
      verifiedAt: status === 'Verified' ? fixedDate(2026, 8, 3 + (i % 20)) : undefined,
      verificationNotes: status === 'Verified' ? 'DEMO verification only; no real field work was performed.' : '',
      allocatedBudget: Math.min(asset.estimatedRepairCost || asset.estimatedMaintenanceCost, 75000 + i * 12500),
      actualCost: ['Completed', 'Verified'].includes(status) ? 54000 + i * 8200 : 0,
      createdAt: assignedDate,
      updatedAt: assignedDate
    });
    assignments.push(assignment);
  }

  const routePlans = [
    { name: 'DEMO ROUTE - North and Santhe Circuit', member: members[0], assets: [assets[0], assets[1], assets[34], assets[35], assets[40]], status: 'Planned', month: 8 },
    { name: 'DEMO ROUTE - Areca Belt Works', member: members[1], assets: [assets[2], assets[6], assets[12], assets[38], assets[41]], status: 'In_Progress', month: 7 }
  ];
  for (const plan of routePlans) {
    const routePoints = [
      { lat: CENTER.lat, lng: CENTER.lng },
      ...plan.assets.map((asset) => ({ lat: asset.location.coordinates[1], lng: asset.location.coordinates[0] })),
      { lat: CENTER.lat, lng: CENTER.lng }
    ];
    let distanceKm = 0;
    const orderedStops = plan.assets.map((asset, index) => {
      const from = routePoints[index];
      const to = routePoints[index + 1];
      const legDistanceKm = SpatialUtils.haversineDistanceKm(from, to);
      distanceKm += legDistanceKm;
      return {
        stopOrder: index + 1,
        infrastructureId: asset._id,
        assignmentId: assignments.find((assignment) => String(assignment.infrastructureId) === String(asset._id))?._id,
        name: asset.name,
        location: asset.location,
        legDistanceMeters: Math.round(legDistanceKm * 1000),
        legDurationSeconds: Math.round((legDistanceKm / 25) * 3600),
        priorityScore: asset.priorityScore
      };
    });
    const destinations = plan.assets.map((asset) => ({
      infrastructureId: asset._id,
      assignmentId: assignments.find((assignment) => String(assignment.infrastructureId) === String(asset._id))?._id,
      name: asset.name,
      location: asset.location,
      priority: asset.priorityScore
    }));
    await upsert(Route, { panchayatId: panchayat._id, name: plan.name }, {
      panchayatId: panchayat._id,
      dataOrigin: 'DEMO',
      isSynthetic: true,
      name: plan.name,
      assignedMember: plan.member._id,
      startLocation: { type: 'Point', coordinates: [CENTER.lng, CENTER.lat] },
      destinations,
      orderedStops,
      geometry: { type: 'LineString', coordinates: routePoints.map((coord) => [coord.lng, coord.lat]) },
      totalDistance: Math.round(distanceKm * 1000),
      totalDistanceKm: Number(distanceKm.toFixed(2)),
      estimatedDuration: Math.round((distanceKm / 25) * 60),
      algorithmUsed: 'DEMO fixture: Haversine legs; use route optimizer for live recalculation',
      status: plan.status,
      generatedAt: fixedDate(2026, plan.month, 12)
    });
  }

  const [roadCount, schoolCount, healthcareCount, waterCount, complaintCount, assignmentCount, routeCount] = await Promise.all([
    Road.countDocuments({ panchayatId: panchayat._id }),
    School.countDocuments({ panchayatId: panchayat._id }),
    Healthcare.countDocuments({ panchayatId: panchayat._id }),
    WaterFacility.countDocuments({ panchayatId: panchayat._id }),
    Complaint.countDocuments({ panchayatId: panchayat._id }),
    Assignment.countDocuments({ panchayatId: panchayat._id }),
    Route.countDocuments({ panchayatId: panchayat._id })
  ]);
  if (roadCount < 30 || schoolCount < 15 || complaintCount < 50 || assignmentCount < 4 || routeCount < 2) {
    throw new Error(`Demo fixture count check failed (roads=${roadCount}, schools=${schoolCount}, complaints=${complaintCount}, assignments=${assignmentCount}, routes=${routeCount}).`);
  }
  console.log(`Demo dataset ready: ${roadCount} roads, ${schoolCount} schools, ${healthcareCount} healthcare sites, ${waterCount} water facilities, ${complaintCount} complaints, ${assignmentCount} assignments and ${routeCount} multi-stop routes.`);
  console.log('DEVELOPMENT/DEMO ACCOUNTS ONLY: demo_admin / DemoAccess2026!; all demo_pdo_* and demo_member_schools accounts use DemoAccess2026!.');
}
