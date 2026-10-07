import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import identityFixture from './fixtures/rdmt-five-panchayat-demo-identities.json' with { type: 'json' };
import { Healthcare, Infrastructure, Road, School, WaterFacility } from '../models/Infrastructure.js';
import { Panchayat } from '../models/Panchayat.js';
import { SpatialUtils } from '../services/spatial/spatialUtils.js';
import { GAP_ANALYSIS_DEMO_SOURCE } from '../services/spatial/gapAnalysisDemoProvenance.js';
import { Coordinate } from '../services/spatial/types.js';

const DATASET_VERSION = '2';
const SOURCE_WORKBOOK = identityFixture.sourceWorkbook;
const LGD_CODES: Record<string, string> = {
  Adyar: '217288',
  Harekala: '217302',
  Neermarga: '217320',
  Pavuru: '217326',
  Pudu: '217231'
};
const SYNTHETIC_CENTERS: Record<string, Coordinate> = {
  Adyar: { lat: 12.835, lng: 74.865 },
  Harekala: { lat: 12.805, lng: 74.875 },
  Neermarga: { lat: 12.875, lng: 74.885 },
  Pavuru: { lat: 12.825, lng: 74.925 },
  Pudu: { lat: 12.865, lng: 74.935 }
};
const DEMO_PROVENANCE = {
  dataOrigin: 'SYNTHETIC_DEMO' as const,
  isSynthetic: true,
  source: GAP_ANALYSIS_DEMO_SOURCE,
  coordinatesVerified: false,
  coordinateSource: 'SYNTHETIC' as const,
  coordinateStatus: 'DEMO_ONLY' as const
};
const MISSING_PRIORITY_FIELDS = [
  'condition', 'complaintsCount', 'populationServed', 'trafficLevel',
  'lastMaintenanceDate', 'alternativeDistanceKm'
];
const ROAD_OFFSETS_KM = [0.25, 1.2, 1.655, 2, 2.25] as const;

type WorkbookRow = { sourceRow: number; sourceKey: string; sourceData: Record<string, unknown> };
type PanchayatInfoRow = { sourceRow: number; sourceData: Record<string, unknown> };
type DemoFixture = { infrastructures: WorkbookRow[]; panchayats: PanchayatInfoRow[] };
const fixture = identityFixture as DemoFixture;

function stableObjectId(key: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(createHash('sha256').update(key).digest('hex').slice(0, 24));
}

function point(lng: number, lat: number) {
  return { type: 'Point' as const, coordinates: [Number(lng.toFixed(6)), Number(lat.toFixed(6))] as [number, number] };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Stable pseudo-random visual placement; it is not a geocoder or a real location. */
function syntheticCoordinate(key: string, origin: Coordinate, radiusKm: number): Coordinate {
  const digest = createHash('sha256').update(key).digest();
  const angle = (digest.readUInt32BE(0) / 0xffffffff) * Math.PI * 2;
  const radialFraction = 0.2 + (digest.readUInt32BE(4) / 0xffffffff) * 0.8;
  const distanceKm = radiusKm * radialFraction;
  const latitude = origin.lat + Math.sin(angle) * distanceKm / 110.57;
  const longitude = origin.lng + Math.cos(angle) * distanceKm /
    (111.32 * Math.cos(origin.lat * Math.PI / 180));
  return { lat: Number(latitude.toFixed(6)), lng: Number(longitude.toFixed(6)) };
}

function syntheticLine(center: Coordinate, key: string, halfLengthKm = 0.22): [number, number][] {
  const digest = createHash('sha256').update(`line|${key}`).digest();
  const angle = (digest.readUInt16BE(0) / 0xffff) * Math.PI;
  const dx = Math.cos(angle) * halfLengthKm / (111.32 * Math.cos(center.lat * Math.PI / 180));
  const dy = Math.sin(angle) * halfLengthKm / 110.57;
  const bend = (digest.readUInt16BE(2) / 0xffff - 0.5) * 0.0005;
  return [
    [Number((center.lng - dx).toFixed(6)), Number((center.lat - dy).toFixed(6))],
    [Number((center.lng + bend).toFixed(6)), Number((center.lat - bend).toFixed(6))],
    [Number((center.lng + dx).toFixed(6)), Number((center.lat + dy).toFixed(6))]
  ];
}

function normalizedInfrastructureType(category: unknown, sourceType: unknown): 'Road' | 'School' | 'Healthcare' | 'WaterFacility' | 'Other' {
  const categoryName = String(category || '').trim().toLowerCase();
  const typeName = String(sourceType || '').trim().toLowerCase();
  if (categoryName === 'healthcare') return 'Healthcare';
  if (categoryName === 'education') return 'School';
  if (categoryName === 'water') return 'WaterFacility';
  if (categoryName === 'transport' && /(road|bridge|footpath)/.test(typeName)) return 'Road';
  return 'Other';
}

function sourceStatus(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (raw === 'Operational' || /^Operational\s*\//i.test(raw)) return 'Operational';
  if (['Needs_Maintenance', 'Needs_Repair', 'Under_Maintenance', 'Under_Repair', 'Decommissioned'].includes(raw)) return raw;
  return null;
}

function isOneAtomicSourceRecord(row: WorkbookRow, type: string): boolean {
  const data = row.sourceData;
  const quantity = data['Reported Quantity'];
  const name = String(data['Infrastructure / Facility'] || '');
  const sourceType = String(data.Type || '');
  const status = String(data.Status || '');
  return Number(quantity) === 1 &&
    !/multiple|network|service|facilit|centre\(s\)|station\(s\)|outside|nearby/i.test(`${name} ${sourceType}`) &&
    !/outside|not within village|nearby/i.test(status) &&
    type !== 'Other';
}

function panchayatCenter(name: string): Coordinate {
  const center = SYNTHETIC_CENTERS[name];
  if (!center) throw new Error(`The demonstration fixture contains an unsupported Panchayat: ${name}`);
  return center;
}

function provenanceFields() {
  return { ...DEMO_PROVENANCE };
}

async function upsertPanchayat(info: PanchayatInfoRow) {
  const sourceData = info.sourceData;
  const name = String(sourceData.Panchayat || '').trim();
  const center = panchayatCenter(name);
  const sourceKey = `${GAP_ANALYSIS_DEMO_SOURCE}:panchayat:${slug(name)}`;
  const id = stableObjectId(sourceKey);
  const villages = String(sourceData.Villages || '').split(';').map((value) => value.trim()).filter(Boolean);
  const habitations = villages.map((village, index) => {
    const coordinate = syntheticCoordinate(`${sourceKey}:habitation:${index}:${village}`, center, 0.45);
    return {
      name: village,
      ward: `Demo area ${index + 1}`,
      location: point(coordinate.lng, coordinate.lat),
      ...provenanceFields()
    };
  });

  const panchayat = await Panchayat.findOneAndUpdate(
    { sourceKey },
    { $set: {
      _id: id,
      name,
      lgdCode: LGD_CODES[name],
      district: 'Dakshina Kannada',
      state: 'Karnataka',
      taluka: String(sourceData.Taluka || ''),
      wards: [],
      villages,
      numberOfVillages: Number(sourceData['Number of Villages']),
      centerCoord: center,
      location: point(center.lng, center.lat),
      habitations,
      administrativeNote: `${String(sourceData['Administrative Note'] || '')} Synthetic demonstration center and habitation points only; no official Panchayat boundary is represented.`,
      ...provenanceFields(),
      sourceKey,
      sourceWorkbook: SOURCE_WORKBOOK,
      sourceWorksheet: 'Panchayat_Info',
      sourceRow: info.sourceRow,
      sourceData
    } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
  return panchayat;
}

async function upsertWorkbookIdentity(row: WorkbookRow, panchayatId: mongoose.Types.ObjectId, center: Coordinate) {
  const data = row.sourceData;
  const name = String(data['Infrastructure / Facility'] || '');
  const type = normalizedInfrastructureType(data.Category, data.Type);
  const sourceKey = `${GAP_ANALYSIS_DEMO_SOURCE}:workbook:${row.sourceKey}`;
  const id = stableObjectId(sourceKey);
  const location = syntheticCoordinate(sourceKey, center, 1.35);
  const roles: string[] = ['WORKBOOK_IDENTITY'];
  const record = { type, name, quantity: data['Reported Quantity'] };
  const lineGeometry = type === 'Road' ? { type: 'LineString', coordinates: syntheticLine(location, sourceKey) } : undefined;
  if (lineGeometry) roles.push('MAP_ROAD');
  if (isOneAtomicSourceRecord(row, type)) roles.push('ROUTE_STOP');

  const base = {
    _id: id,
    panchayatId,
    name,
    type,
    description: 'Synthetic demonstration map geometry for a source-workbook identity; not a verified facility location.',
    ward: null,
    village: String(data['Village/Area'] || ''),
    location: point(location.lng, location.lat),
    condition: null,
    status: sourceStatus(data.Status),
    normalizedStatus: sourceStatus(data.Status),
    complaintsCount: null,
    populationServed: null,
    lastMaintenanceDate: null,
    priorityScore: null,
    priorityScorable: false,
    estimatedMaintenanceCost: null,
    dataOrigin: 'SYNTHETIC_DEMO' as const,
    isSynthetic: true,
    syntheticDemoRoles: roles,
    sourceKey,
    sourceWorkbook: SOURCE_WORKBOOK,
    sourceWorksheet: 'ALL_Infrastructure',
    sourceRow: row.sourceRow,
    sourceCategory: String(data.Category || ''),
    sourceType: String(data.Type || ''),
    sourceOwnership: String(data.Ownership || ''),
    sourceReportedQuantity: data['Reported Quantity'],
    sourceStatus: String(data.Status || ''),
    source: GAP_ANALYSIS_DEMO_SOURCE,
    sourceVintage: String(data['Source Vintage'] || ''),
    verificationNotes: `${String(data['Verification / Notes'] || '')} Synthetic coordinate generated for local demonstration only; source workbook fields remain in sourceData unchanged.`,
    verificationRequired: true,
    coordinatesVerified: false,
    coordinateSource: 'SYNTHETIC' as const,
    coordinateStatus: 'DEMO_ONLY' as const,
    missingDataFields: [...MISSING_PRIORITY_FIELDS, 'location', 'coordinates'],
    sourceData: data
  };

  if (type === 'Road') {
    const road = { ...base, lineGeometry, geometry: lineGeometry, roadLength: null, lengthKm: null, surfaceType: null, roadType: null, trafficLevel: null, lastRepairDate: undefined, estimatedRepairCost: null, connects: [] };
    await Road.findOneAndUpdate({ sourceKey }, { $set: road }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
  } else if (type === 'School') {
    const school = {
      ...base,
      schoolType: null,
      management: String(data.Ownership || '').toLowerCase().includes('government') ? 'Govt' : null,
      studentCount: null,
      staffCount: null,
      accessibility: null,
      facilities: null
    };
    await School.findOneAndUpdate({ sourceKey }, { $set: school }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
  } else if (type === 'Healthcare') {
    await Healthcare.findOneAndUpdate({ sourceKey }, { $set: base }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
  } else if (type === 'WaterFacility') {
    await WaterFacility.findOneAndUpdate({ sourceKey }, { $set: base }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
  } else {
    await Infrastructure.findOneAndUpdate({ sourceKey }, { $set: base }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
  }
  return { panchayatId: String(panchayatId), type, sourceRow: row.sourceRow, sourceName: name, sourceKey, roles };
}

function coverageRows(name: string, panchayatId: mongoose.Types.ObjectId, center: Coordinate) {
  const extent = 0.035;
  const bounds = {
    minLat: center.lat - extent - 0.008,
    maxLat: center.lat + extent + 0.008,
    // Road-anchor endpoints extend 0.001° beyond the corner School points;
    // match the exact bounds GapDetectionService derives from those LineStrings.
    minLng: center.lng - extent - 0.001 - 0.008,
    maxLng: center.lng + extent + 0.001 + 0.008
  };
  const grid = SpatialUtils.generateSpatialGrid(bounds, 0.8);
  const gridRows = [...new Set(grid.map((cell) => Number(cell.id.match(/cell-r(\d+)-c/)?.[1])))].sort((a, b) => a - b);
  const rowCells = grid.filter((cell) => cell.id.startsWith(`cell-r${gridRows[Math.floor(gridRows.length / 2)]}-c`));
  const columns = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round((rowCells.length - 1) * fraction));
  if (rowCells.length < 10 || new Set(columns).size !== ROAD_OFFSETS_KM.length) {
    throw new Error(`Insufficient grid columns to build deterministic coverage points for ${name}.`);
  }
  const targets = columns.map((column, index) => ({ cell: rowCells[column], roadOffsetKm: ROAD_OFFSETS_KM[index] }));
  const corners: Coordinate[] = [
    { lat: center.lat - extent, lng: center.lng - extent },
    { lat: center.lat - extent, lng: center.lng + extent },
    { lat: center.lat + extent, lng: center.lng - extent },
    { lat: center.lat + extent, lng: center.lng + extent }
  ];
  return { targets, corners, targetSectorIds: targets.map(({ cell }) => cell.id) };
}

async function upsertCoverageGeometry(name: string, panchayatId: mongoose.Types.ObjectId, center: Coordinate) {
  const { targets, corners, targetSectorIds } = coverageRows(name, panchayatId, center);
  const prefix = `${GAP_ANALYSIS_DEMO_SOURCE}:${slug(name)}:coverage:v${DATASET_VERSION}`;
  const schoolRows = [
    ...corners.map((location, index) => ({ key: `school-anchor-${index + 1}`, name: `Synthetic coverage school anchor ${index + 1}`, location })),
    ...targets.map(({ cell }, index) => ({ key: `school-target-${index + 1}`, name: index === 0 && name === 'Pavuru'
      ? 'GHS Pavoor (UDISE 29240606106) — synthetic demo location'
      : `Synthetic coverage school point ${index + 1}`, location: cell.center }))
  ];
  const roadRows = [
    ...corners.map((location, index) => ({
      key: `road-anchor-${index + 1}`,
      name: `Synthetic coverage road anchor ${index + 1}`,
      coordinates: [
        [Number((location.lng - 0.001).toFixed(6)), location.lat],
        [Number((location.lng + 0.001).toFixed(6)), location.lat]
      ] as [number, number][]
    })),
    ...targets.map(({ cell, roadOffsetKm }, index) => {
      const targetLat = cell.center.lat + roadOffsetKm / 110.57;
      const halfLengthDegrees = 0.004 / (111.32 * Math.cos((targetLat * Math.PI) / 180));
      return {
        key: `road-target-${index + 1}`,
        name: `Synthetic coverage road point ${index + 1}`,
        coordinates: [
          [Number((cell.center.lng - halfLengthDegrees).toFixed(6)), Number(targetLat.toFixed(6))],
          [Number((cell.center.lng + halfLengthDegrees).toFixed(6)), Number(targetLat.toFixed(6))]
        ] as [number, number][]
      };
    })
  ];

  for (const school of schoolRows) {
    const sourceKey = `${prefix}:${school.key}`;
    await School.findOneAndUpdate({ sourceKey }, { $set: {
      _id: stableObjectId(sourceKey),
      panchayatId,
      name: school.name,
      type: 'School',
      description: 'Synthetic coverage marker for the local demonstration only; not an identified or verified school location.',
      location: point(school.location.lng, school.location.lat),
      schoolType: null,
      management: null,
      studentCount: null,
      staffCount: null,
      accessibility: null,
      facilities: null,
      ...DEMO_PROVENANCE,
      syntheticDemoRoles: ['GAP_ANALYSIS_FACILITY'],
      sourceKey,
      sourceVintage: `fixture-v${DATASET_VERSION}`,
      verificationRequired: true,
      priorityScorable: false,
      priorityScore: null,
      condition: null,
      complaintsCount: null,
      populationServed: null,
      lastMaintenanceDate: null,
      sourceData: { fixture: GAP_ANALYSIS_DEMO_SOURCE, version: DATASET_VERSION, role: school.key }
    } }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
  }

  for (const road of roadRows) {
    const sourceKey = `${prefix}:${road.key}`;
    const location = road.coordinates[0];
    await Road.findOneAndUpdate({ sourceKey }, { $set: {
      _id: stableObjectId(sourceKey),
      panchayatId,
      name: road.name,
      type: 'Road',
      description: 'Synthetic coverage line for the local demonstration only; not a mapped public road.',
      location: point(location[0], location[1]),
      lineGeometry: { type: 'LineString', coordinates: road.coordinates },
      geometry: { type: 'LineString', coordinates: road.coordinates },
      roadLength: null,
      lengthKm: null,
      surfaceType: null,
      roadType: null,
      trafficLevel: null,
      estimatedRepairCost: null,
      connects: [],
      ...DEMO_PROVENANCE,
      syntheticDemoRoles: road.key.startsWith('road-anchor-') ? ['MAP_ROAD'] : ['GAP_ANALYSIS_ROAD'],
      sourceKey,
      sourceVintage: `fixture-v${DATASET_VERSION}`,
      verificationRequired: true,
      priorityScorable: false,
      priorityScore: null,
      condition: null,
      complaintsCount: null,
      populationServed: null,
      lastMaintenanceDate: null,
      sourceData: { fixture: GAP_ANALYSIS_DEMO_SOURCE, version: DATASET_VERSION, role: road.key }
    } }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
  }
  return { schoolCount: schoolRows.length, roadCount: roadRows.length, targetSectorIds, targetRoadOffsetsKm: targets.map(({ roadOffsetKm }) => roadOffsetKm) };
}

/**
 * Idempotently loads five Panchayat identities, source-row copies, and demo-only
 * coverage geometry. Callers must use a disposable database: the only provided
 * preview entry point connects through MongoMemoryServer and discards it on exit.
 */
export async function seedGapAnalysisDemoDataset() {
  if (fixture.infrastructures.length !== 100 || fixture.panchayats.length !== 5) {
    throw new Error('The checked-in synthetic identity fixture must contain all 100 source rows and five Panchayats.');
  }
  const panchayatDocuments = new Map<string, mongoose.Types.ObjectId>();
  for (const info of fixture.panchayats) {
    const panchayat = await upsertPanchayat(info);
    panchayatDocuments.set(String(panchayat.name), panchayat._id as mongoose.Types.ObjectId);
  }

  const infrastructureSummaries = [];
  for (const row of fixture.infrastructures) {
    const name = String(row.sourceData.Panchayat || '');
    const panchayatId = panchayatDocuments.get(name);
    if (!panchayatId) throw new Error(`No synthetic Panchayat identity exists for workbook row ${row.sourceRow}.`);
    infrastructureSummaries.push(await upsertWorkbookIdentity(row, panchayatId, panchayatCenter(name)));
  }

  const coverageByPanchayat: Record<string, { schools: number; roads: number; targetSectorIds: string[]; targetRoadOffsetsKm: readonly number[] }> = {};
  for (const info of fixture.panchayats) {
    const name = String(info.sourceData.Panchayat || '');
    const panchayatId = panchayatDocuments.get(name)!;
    const coverage = await upsertCoverageGeometry(name, panchayatId, panchayatCenter(name));
    coverageByPanchayat[name] = {
      schools: coverage.schoolCount,
      roads: coverage.roadCount,
      targetSectorIds: coverage.targetSectorIds,
      targetRoadOffsetsKm: coverage.targetRoadOffsetsKm
    };
  }

  const sourceIdentityCounts = Object.fromEntries(fixture.panchayats.map((info) => {
    const name = String(info.sourceData.Panchayat || '');
    return [name, fixture.infrastructures.filter((row) => String(row.sourceData.Panchayat || '') === name).length];
  }));
  return {
    panchayatIds: Object.fromEntries([...panchayatDocuments].map(([name, id]) => [name, String(id)])),
    sourceIdentityCounts,
    coverageByPanchayat,
    sourceIdentityRecordCount: infrastructureSummaries.length,
    syntheticCoverageSchoolCount: Object.values(coverageByPanchayat).reduce((sum, item) => sum + item.schools, 0),
    syntheticCoverageRoadCount: Object.values(coverageByPanchayat).reduce((sum, item) => sum + item.roads, 0),
    datasetSource: GAP_ANALYSIS_DEMO_SOURCE,
    datasetVersion: DATASET_VERSION
  };
}
