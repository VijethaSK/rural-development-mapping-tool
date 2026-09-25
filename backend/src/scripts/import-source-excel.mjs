import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();
const require = createRequire(import.meta.url);
const yauzl = require('yauzl');
const execFileAsync = promisify(execFile);

export const REQUIRED_SHEETS = ['ALL_Infrastructure', 'Panchayat_Info', 'Row_Summary', 'Sources', 'Data_Dictionary'];
const REQUIRED_INFRA_FIELDS = [
  'Panchayat', 'Village/Area', 'Infrastructure / Facility', 'Category', 'Type', 'Ownership',
  'Reported Quantity', 'Status', 'Latitude', 'Longitude', 'Source', 'Source Vintage', 'Verification / Notes'
];
const COLLECTIONS = ['panchayats', 'infrastructures', 'complaints', 'assignments', 'routes', 'users', 'priorityconfigs'];
export async function getModelIndexPlan() {
  // Read the actual schema indexes so the migration does not drift from Mongoose.
  // The caller runs with ts-node's ESM loader; importing models does not connect to MongoDB.
  const models = await import('../models/index.ts');
  const plan = [];
  const seen = new Set();
  for (const model of Object.values(models)) {
    if (!model?.schema?.indexes || !model?.collection?.name) continue;
    for (const [keys, declaredOptions] of model.schema.indexes()) {
      const options = { ...declaredOptions };
      delete options.background;
      const signature = JSON.stringify([model.collection.name, keys, options]);
      if (seen.has(signature)) continue;
      seen.add(signature);
      plan.push([model.collection.name, keys, options]);
    }
  }
  return plan;
}

function xmlDecode(text = '') {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code) => {
    const key = code.toLowerCase();
    if (key === 'amp') return '&';
    if (key === 'lt') return '<';
    if (key === 'gt') return '>';
    if (key === 'quot') return '"';
    if (key === 'apos') return "'";
    if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
    return String.fromCodePoint(parseInt(key.slice(1), 10));
  });
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:.-]+)="([^"]*)"/g)) result[match[1]] = xmlDecode(match[2]);
  return result;
}

function columnIndex(ref) {
  const letters = String(ref || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase() || '';
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(([, item]) =>
    [...item.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(([, value]) => xmlDecode(value)).join('')
  );
}

function parseWorksheet(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = attributes(rowMatch[1]);
    const rowNumber = Number(rowAttrs.r) || rows.length + 1;
    const values = [];
    const cells = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    for (const cellMatch of rowMatch[2].matchAll(cells)) {
      const cellAttrs = attributes(cellMatch[1]);
      const index = columnIndex(cellAttrs.r);
      if (index < 0) continue;
      const body = cellMatch[2] || '';
      const value = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      let parsed = value == null ? null : xmlDecode(value);
      if (cellAttrs.t === 's' && parsed != null) parsed = sharedStrings[Number(parsed)] ?? parsed;
      else if (cellAttrs.t === 'inlineStr') parsed = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(([, item]) => xmlDecode(item)).join('');
      else if (cellAttrs.t === 'b' && parsed != null) parsed = parsed === '1';
      else if ((!cellAttrs.t || cellAttrs.t === 'n') && parsed != null && parsed.trim() !== '' && Number.isFinite(Number(parsed))) parsed = Number(parsed);
      while (values.length <= index) values.push(null);
      values[index] = parsed;
    }
    rows.push({ rowNumber, values });
  }
  return rows;
}

function readZip(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true }, (openError, zip) => {
      if (openError || !zip) return reject(openError || new Error('Could not open Excel workbook archive'));
      const files = new Map();
      zip.on('error', reject);
      zip.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return reject(streamError || new Error(`Could not read ${entry.fileName}`));
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            files.set(entry.fileName.replace(/^\//, ''), Buffer.concat(chunks).toString('utf8'));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(files));
      zip.readEntry();
    });
  });
}

export async function readWorkbook(filePath) {
  const files = await readZip(filePath);
  const workbookXml = files.get('xl/workbook.xml');
  const relsXml = files.get('xl/_rels/workbook.xml.rels');
  if (!workbookXml || !relsXml) throw new Error('Workbook is missing the OpenXML workbook manifest.');
  const relationships = new Map();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*?)\/?\s*>/g)) {
    const attrs = attributes(match[1]);
    const target = attrs.Target?.replace(/^\//, '').replace(/^xl\//, '') || '';
    relationships.set(attrs.Id, path.posix.normalize(path.posix.join('xl', target)));
  }
  const sharedStrings = parseSharedStrings(files.get('xl/sharedStrings.xml'));
  const sheets = {};
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*?)\/?\s*>/g)) {
    const attrs = attributes(match[1]);
    const sheetPath = relationships.get(attrs['r:id']);
    const xml = sheetPath ? files.get(sheetPath) : undefined;
    if (!attrs.name || !xml) continue;
    const parsedRows = parseWorksheet(xml, sharedStrings);
    const header = parsedRows.find((row) => row.values.some((value) => value != null))?.values || [];
    const headers = header.map((value) => value == null ? '' : String(value).trim());
    const records = parsedRows.filter((row) => row.rowNumber > 1 && row.values.some((value) => value != null && String(value).trim() !== '')).map((row) => {
      const sourceData = {};
      headers.forEach((name, index) => { if (name) sourceData[name] = row.values[index] ?? null; });
      return { rowNumber: row.rowNumber, sourceData };
    });
    sheets[attrs.name] = { headers, records };
  }
  return sheets;
}

function normalizedKeyPart(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

export function stableSourceKey(row) {
  const raw = ['Panchayat', 'Village/Area', 'Infrastructure / Facility', 'Category'].map((field) => normalizedKeyPart(row[field])).join('|');
  return `excel-v1-${crypto.createHash('sha256').update(raw, 'utf8').digest('hex')}`;
}

function verificationRequired(row) {
  return /verify|reported|needs/i.test(String(row.Status || '')) ||
    /verif|field|official|survey|exact|current|should|must|required|obtain/i.test(String(row['Verification / Notes'] || ''));
}

function parseSourceCoordinate(value, bound) {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= bound ? number : null;
}

function normalizedAppType(category, sourceType) {
  const categoryName = String(category || '').trim().toLowerCase();
  const typeName = String(sourceType || '').trim().toLowerCase();
  if (categoryName === 'healthcare') return 'Healthcare';
  if (categoryName === 'education') return 'School';
  if (categoryName === 'water') return 'WaterFacility';
  if (categoryName === 'transport' && /(road|bridge|footpath)/.test(typeName)) return 'Road';
  return 'Other';
}

function normalizedSourceStatus(value) {
  const raw = String(value || '').trim();
  if (raw === 'Operational' || /^Operational\s*\//i.test(raw)) return 'Operational';
  if (['Needs_Maintenance', 'Needs_Repair', 'Under_Maintenance', 'Under_Repair', 'Decommissioned'].includes(raw)) return raw;
  return null;
}

function sourcePanchayatKey(name) {
  const raw = `panchayat-info-v1|${normalizedKeyPart(name)}`;
  return `excel-panchayat-v1-${crypto.createHash('sha256').update(raw, 'utf8').digest('hex')}`;
}

export function validateWorkbook(sheets) {
  const conflicts = [];
  for (const sheet of REQUIRED_SHEETS) if (!sheets[sheet]) conflicts.push(`Missing required worksheet: ${sheet}`);
  const infraSheet = sheets.ALL_Infrastructure;
  if (infraSheet) {
    for (const field of REQUIRED_INFRA_FIELDS) if (!infraSheet.headers.includes(field)) conflicts.push(`ALL_Infrastructure is missing column: ${field}`);
  }
  const records = infraSheet?.records || [];
  const panchayatInfo = sheets.Panchayat_Info?.records || [];
  const infoByName = new Map(panchayatInfo.map(({ sourceData }) => [String(sourceData.Panchayat || '').trim(), sourceData]));
  const identityFields = ['Panchayat', 'Village/Area', 'Infrastructure / Facility', 'Category'];
  const seen = new Map();
  const duplicateRows = [];
  const rowsMissingIdentity = [];
  for (const item of records) {
    const row = item.sourceData;
    const missing = identityFields.filter((field) => row[field] == null || String(row[field]).trim() === '');
    if (missing.length) rowsMissingIdentity.push({ row: item.rowNumber, fields: missing });
    const key = stableSourceKey(row);
    if (seen.has(key)) duplicateRows.push({ key, firstRow: seen.get(key), duplicateRow: item.rowNumber });
    else seen.set(key, item.rowNumber);
    if (!infoByName.has(String(row.Panchayat || '').trim())) conflicts.push(`Infrastructure row ${item.rowNumber} references a Panchayat absent from Panchayat_Info.`);
  }
  const summaryConflicts = [];
  const observed = new Map();
  for (const { sourceData } of records) {
    const key = `${sourceData.Panchayat}\u0000${sourceData.Category}`;
    observed.set(key, (observed.get(key) || 0) + 1);
  }
  for (const { sourceData } of sheets.Row_Summary?.records || []) {
    const key = `${sourceData.Panchayat}\u0000${sourceData.Category}`;
    if (Number(sourceData['Dataset Rows']) !== (observed.get(key) || 0)) summaryConflicts.push({ panchayat: sourceData.Panchayat, category: sourceData.Category, expected: sourceData['Dataset Rows'], actual: observed.get(key) || 0 });
  }
  if (summaryConflicts.length) conflicts.push(`Row_Summary has ${summaryConflicts.length} count mismatch(es).`);
  const panchayatNames = [...new Set(records.map(({ sourceData }) => String(sourceData.Panchayat || '').trim()))];
  const infoNames = [...infoByName.keys()];
  for (const name of infoNames) if (!panchayatNames.includes(name)) conflicts.push(`Panchayat_Info entry has no ALL_Infrastructure records: ${name}`);
  const duplicateKeys = new Map();
  for (const item of records) {
    const rawKey = identityFields.map((field) => normalizedKeyPart(item.sourceData[field])).join('|');
    duplicateKeys.set(rawKey, (duplicateKeys.get(rawKey) || 0) + 1);
  }
  const duplicateCompositeCount = [...duplicateKeys.values()].filter((count) => count > 1).length;
  const missingCoordinates = records.filter(({ sourceData }) => parseSourceCoordinate(sourceData.Latitude, 90) == null || parseSourceCoordinate(sourceData.Longitude, 180) == null);
  const partialCoordinates = records.filter(({ sourceData }) => (sourceData.Latitude != null && String(sourceData.Latitude).trim() !== '') !== (sourceData.Longitude != null && String(sourceData.Longitude).trim() !== ''));
  const invalidCoordinateRows = records.filter(({ sourceData }) => {
    const hasLat = sourceData.Latitude != null && String(sourceData.Latitude).trim() !== '';
    const hasLng = sourceData.Longitude != null && String(sourceData.Longitude).trim() !== '';
    return (hasLat && parseSourceCoordinate(sourceData.Latitude, 90) == null) || (hasLng && parseSourceCoordinate(sourceData.Longitude, 180) == null);
  }).map(({ rowNumber }) => rowNumber);
  const verificationRows = records.filter(({ sourceData }) => verificationRequired(sourceData));
  const sourceCategories = new Set(records.map(({ sourceData }) => sourceData.Category));
  const statusCounts = {};
  const categoryCounts = {};
  const panchayatCounts = {};
  for (const { sourceData } of records) {
    const status = String(sourceData.Status);
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    categoryCounts[sourceData.Category] = (categoryCounts[sourceData.Category] || 0) + 1;
    panchayatCounts[sourceData.Panchayat] = (panchayatCounts[sourceData.Panchayat] || 0) + 1;
  }
  const missingImportantFields = Object.fromEntries(REQUIRED_INFRA_FIELDS.map((field) => [
    field,
    records.filter(({ sourceData }) => sourceData[field] == null || String(sourceData[field]).trim() === '').length
  ]).filter(([, count]) => count > 0));
  return {
    conflicts,
    records,
    panchayatInfo: panchayatInfo.map(({ sourceData }) => sourceData),
    panchayatNames,
    infoNames,
    duplicateRows,
    duplicateCompositeCount,
    rowsMissingIdentity,
    missingCoordinates: missingCoordinates.length,
    partialCoordinates: partialCoordinates.length,
    invalidCoordinateRows,
    verificationRows: verificationRows.length,
    qualitativeQuantities: records.filter(({ sourceData }) => typeof sourceData['Reported Quantity'] === 'string').length,
    sourceCategories: [...sourceCategories].sort(),
    categoryCounts,
    panchayatCounts,
    statusCounts,
    missingImportantFields,
    summaryConflicts
  };
}

export function makeInfrastructureDocument(item, workbookName, panchayatId, now = new Date()) {
  const row = item.sourceData;
  const latitude = parseSourceCoordinate(row.Latitude, 90);
  const longitude = parseSourceCoordinate(row.Longitude, 180);
  const hasBothCoordinates = latitude != null && longitude != null;
  const exactStatus = String(row.Status ?? '');
  const appStatus = normalizedSourceStatus(exactStatus);
  const normalizedType = normalizedAppType(row.Category, row.Type);
  const missingDataFields = ['condition', 'complaintsCount', 'populationServed', 'lastMaintenanceDate', 'estimatedMaintenanceCost'];
  if (normalizedType === 'Road') missingDataFields.push('trafficLevel', 'roadLength', 'lineGeometry');
  if (!hasBothCoordinates) missingDataFields.push('location', 'coordinates');
  return {
    panchayatId,
    name: String(row['Infrastructure / Facility']),
    type: normalizedType,
    description: '',
    ward: null,
    village: String(row['Village/Area']),
    location: hasBothCoordinates ? { type: 'Point', coordinates: [longitude, latitude] } : null,
    condition: null,
    status: appStatus,
    normalizedStatus: appStatus,
    complaintsCount: null,
    populationServed: null,
    lastMaintenanceDate: null,
    priorityScore: null,
    estimatedMaintenanceCost: null,
    isSynthetic: false,
    dataOrigin: 'SOURCE_EXCEL',
    sourceKey: stableSourceKey(row),
    sourceWorkbook: workbookName,
    sourceWorksheet: 'ALL_Infrastructure',
    sourceRow: item.rowNumber,
    sourceCategory: String(row.Category),
    sourceType: String(row.Type),
    sourceOwnership: String(row.Ownership),
    sourceReportedQuantity: row['Reported Quantity'],
    sourceStatus: exactStatus,
    source: String(row.Source),
    sourceVintage: String(row['Source Vintage']),
    verificationNotes: String(row['Verification / Notes']),
    verificationRequired: verificationRequired(row),
    coordinatesVerified: false,
    coordinateSource: hasBothCoordinates ? 'SOURCE_EXCEL' : 'UNAVAILABLE',
    priorityScorable: false,
    missingDataFields,
    sourceData: row,
    createdAt: now,
    updatedAt: now
  };
}

export function makePanchayatDocument(info, workbookName, now = new Date()) {
  const villages = String(info.Villages || '').split(';').map((part) => part.trim()).filter(Boolean);
  return {
    name: String(info.Panchayat),
    taluka: info.Taluka == null ? undefined : String(info.Taluka),
    villages,
    numberOfVillages: Number.isFinite(Number(info['Number of Villages'])) ? Number(info['Number of Villages']) : undefined,
    administrativeNote: info['Administrative Note'] == null ? undefined : String(info['Administrative Note']),
    source: info.Source == null ? undefined : String(info.Source),
    district: undefined,
    state: undefined,
    wards: [],
    centerCoord: null,
    location: null,
    habitations: [],
    dataOrigin: 'SOURCE_EXCEL',
    sourceWorkbook: workbookName,
    sourceWorksheet: 'Panchayat_Info',
    sourceRow: info.sourceRow,
    sourceKey: sourcePanchayatKey(info.Panchayat),
    isSynthetic: false,
    createdAt: now,
    updatedAt: now
  };
}

function sanitizeMongoTarget(uri) {
  const parsed = new URL(uri);
  return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}/${parsed.pathname.replace(/^\//, '').split('/')[0]}`;
}

function assertTarget(uri) {
  const parsed = new URL(uri);
  const dbName = parsed.pathname.replace(/^\//, '').split('/')[0];
  if (parsed.protocol !== 'mongodb:' || !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || parsed.port !== '27017' || dbName !== 'rdmt') {
    throw new Error('This importer is restricted to the approved local mongodb://localhost:27017/rdmt target.');
  }
}

async function collectionExists(db, name) {
  return Boolean(await db.listCollections({ name }, { nameOnly: true }).hasNext());
}

async function getUniqueConflictCounts(db) {
  const duplicateGroups = async (collection, field) => {
    const result = await db.collection(collection).aggregate([
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
      { $match: { _id: { $ne: null }, count: { $gt: 1 } } },
      { $count: 'duplicates' }
    ]).toArray();
    return result[0]?.duplicates || 0;
  };
  const nullDuplicates = async (collection, field) => {
    const result = await db.collection(collection).countDocuments({ [field]: { $type: 'null' } });
    return result > 1 ? 1 : 0;
  };
  const infraKeys = await db.collection('infrastructures').aggregate([
    { $group: { _id: '$sourceKey', count: { $sum: 1 } } }, { $match: { _id: { $ne: null }, count: { $gt: 1 } } }, { $count: 'duplicates' }
  ]).toArray();
  const panchayatKeys = await db.collection('panchayats').aggregate([
    { $group: { _id: '$sourceKey', count: { $sum: 1 } } }, { $match: { _id: { $ne: null }, count: { $gt: 1 } } }, { $count: 'duplicates' }
  ]).toArray();
  return {
    duplicateUserEmails: Math.max(await duplicateGroups('users', 'email'), await nullDuplicates('users', 'email')),
    duplicateUsernames: Math.max(await duplicateGroups('users', 'username'), await nullDuplicates('users', 'username')),
    duplicateAssignmentNumbers: Math.max(await duplicateGroups('assignments', 'assignmentNumber'), await nullDuplicates('assignments', 'assignmentNumber')),
    duplicateInfrastructureSourceKeys: infraKeys[0]?.duplicates || 0,
    duplicatePanchayatSourceKeys: panchayatKeys[0]?.duplicates || 0
  };
}

export async function buildDryRunReport(db, workbookPath, sheets, validation, indexPlan) {
  const workbookName = path.basename(workbookPath);
  const existingPanchayats = await db.collection('panchayats').find({}, { projection: { name: 1, dataOrigin: 1, sourceKey: 1 } }).toArray();
  const panchayatById = new Map(existingPanchayats.map((item) => [String(item._id), item]));
  const existingInfrastructure = await db.collection('infrastructures').find({}, { projection: { panchayatId: 1, name: 1, village: 1, sourceKey: 1, dataOrigin: 1 } }).toArray();
  const sourcePanchayatByName = new Map(validation.panchayatNames.map((name) => [name, existingPanchayats.find((item) => item.name === name)]));
  const panchayatCreates = [];
  const panchayatUpdates = [];
  const existingRecordsAffected = [];
  const conflicts = [...validation.conflicts];
  for (const info of validation.panchayatInfo) {
    const existing = sourcePanchayatByName.get(String(info.Panchayat));
    if (!existing) panchayatCreates.push(String(info.Panchayat));
    else if (existing.dataOrigin === 'SOURCE_EXCEL' && existing.sourceKey === sourcePanchayatKey(info.Panchayat)) {
      panchayatUpdates.push(String(info.Panchayat));
      existingRecordsAffected.push({ collection: 'panchayats', id: String(existing._id), operation: 'update-source-fields' });
    }
    else conflicts.push(`Panchayat name collision with an unowned record: ${info.Panchayat}`);
  }
  const bySourceKey = new Map();
  const byNaturalKey = new Map();
  for (const existing of existingInfrastructure) {
    if (existing.sourceKey) bySourceKey.set(existing.sourceKey, existing);
    const parent = panchayatById.get(String(existing.panchayatId));
    if (parent) byNaturalKey.set(`${normalizedKeyPart(parent.name)}|${normalizedKeyPart(existing.name)}`, existing);
  }
  const infrastructureInserts = [];
  const infrastructureUpdates = [];
  for (const item of validation.records) {
    const key = stableSourceKey(item.sourceData);
    const existing = bySourceKey.get(key);
    if (existing) {
      if (existing.dataOrigin === 'SOURCE_EXCEL') {
        infrastructureUpdates.push({ sourceRow: item.rowNumber, id: String(existing._id), name: item.sourceData['Infrastructure / Facility'] });
        existingRecordsAffected.push({ collection: 'infrastructures', id: String(existing._id), operation: 'update-source-fields' });
      } else conflicts.push(`sourceKey collision with a non-source infrastructure record at workbook row ${item.rowNumber}.`);
      continue;
    }
    const natural = byNaturalKey.get(`${normalizedKeyPart(item.sourceData.Panchayat)}|${normalizedKeyPart(item.sourceData['Infrastructure / Facility'])}`);
    if (natural) {
      conflicts.push(`Possible name collision with existing infrastructure ${String(natural._id)} at workbook row ${item.rowNumber}; no automatic overwrite is planned.`);
      continue;
    }
    infrastructureInserts.push({ sourceRow: item.rowNumber, panchayat: item.sourceData.Panchayat, name: item.sourceData['Infrastructure / Facility'] });
  }
  const counts = {};
  for (const name of COLLECTIONS) counts[name] = await collectionExists(db, name) ? await db.collection(name).countDocuments({}) : 0;
  const indexes = {};
  for (const name of COLLECTIONS) indexes[name] = await collectionExists(db, name) ? (await db.collection(name).indexes()).map(({ name: indexName, key, unique }) => ({ name: indexName, key, unique: unique === true || indexName === '_id_' })) : [];
  const indexConflicts = await getUniqueConflictCounts(db);
  if (indexConflicts.duplicateUserEmails) conflicts.push(`Cannot add unique user email index: ${indexConflicts.duplicateUserEmails} duplicate group(s).`);
  if (indexConflicts.duplicateUsernames) conflicts.push(`Cannot add unique username index: ${indexConflicts.duplicateUsernames} duplicate group(s).`);
  if (indexConflicts.duplicateAssignmentNumbers) conflicts.push(`Cannot add unique assignment number index: ${indexConflicts.duplicateAssignmentNumbers} duplicate group(s).`);
  if (indexConflicts.duplicateInfrastructureSourceKeys) conflicts.push(`Cannot add unique infrastructure source key index: ${indexConflicts.duplicateInfrastructureSourceKeys} duplicate group(s).`);
  if (indexConflicts.duplicatePanchayatSourceKeys) conflicts.push(`Cannot add unique Panchayat source key index: ${indexConflicts.duplicatePanchayatSourceKeys} duplicate group(s).`);
  return {
    mode: 'DRY_RUN_READ_ONLY',
    database: db.databaseName,
    workbook: workbookName,
    worksheetsRead: Object.keys(sheets),
    sourceRecordCount: validation.records.length,
    recordsByPanchayat: validation.panchayatCounts,
    recordsByCategory: validation.categoryCounts,
    recordsBySourceType: Object.fromEntries(Object.entries(validation.records.reduce((countsByType, { sourceData }) => {
      const type = String(sourceData.Type);
      countsByType[type] = (countsByType[type] || 0) + 1;
      return countsByType;
    }, {})).sort(([a], [b]) => a.localeCompare(b))),
    statusValues: validation.statusCounts,
    missingImportantFields: validation.missingImportantFields,
    sourceRowsWithCoordinates: validation.records.length - validation.missingCoordinates,
    sourceRowsWithoutCompleteCoordinates: validation.missingCoordinates,
    partialCoordinateRows: validation.partialCoordinates,
    invalidCoordinateRows: validation.invalidCoordinateRows,
    recordsRequiringVerification: validation.verificationRows,
    verificationRule: 'Status contains verify/reported/needs, or Verification / Notes contains verif, field, official, survey, exact, current, should, must, required, or obtain.',
    qualitativeReportedQuantities: validation.qualitativeQuantities,
    duplicateCompositeRows: validation.duplicateCompositeCount,
    duplicateSourceKeys: validation.duplicateRows,
    rowsMissingStableIdentity: validation.rowsMissingIdentity,
    panchayatsToCreate: panchayatCreates,
    panchayatsToUpdate: panchayatUpdates,
    infrastructureToInsert: infrastructureInserts.length,
    infrastructureToUpdate: infrastructureUpdates.length,
    infrastructureUpdateRows: infrastructureUpdates,
    recordsSkipped: validation.duplicateRows.length + validation.rowsMissingIdentity.length,
    schemaConflicts: [...new Set(conflicts)],
    sourceRecordsWithOutsideOrNearbyStatus: validation.records.filter(({ sourceData }) => /not within village|outside village/i.test(String(sourceData.Status))).map(({ rowNumber, sourceData }) => ({ row: rowNumber, panchayat: sourceData.Panchayat, name: sourceData['Infrastructure / Facility'], sourceStatus: sourceData.Status })),
    currentDatabaseCounts: counts,
    currentIndexes: indexes,
    uniqueIndexConflicts: indexConflicts,
    proposedIndexes: indexPlan.map(([collection, key, options]) => ({ collection, key, ...options })),
    existingRecordsAffected,
    syntheticRecordsPlanned: { complaints: 0, assignments: 0, routes: 0, users: 0 },
    varthurPreservation: 'No Varthur records are selected for update or deletion.',
    kerehalliSeed: 'Not run; server startup seed is now opt-in.'
  };
}

function parseArgs(argv) {
  const args = { apply: argv.includes('--apply'), dryRun: argv.includes('--dry-run') };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--workbook') args.workbook = argv[index + 1];
    if (argv[index] === '--backup-dir') args.backupDir = argv[index + 1];
  }
  return args;
}

async function importSourceRecords(db, workbookPath, sheets, validation) {
  if (validation.conflicts.length || validation.duplicateRows.length || validation.rowsMissingIdentity.length) {
    throw new Error('Import halted: resolve dry-run schema/identity conflicts before applying source rows.');
  }
  const workbookName = path.basename(workbookPath);
  const now = new Date();
  const panchayatCollection = db.collection('panchayats');
  const infrastructureCollection = db.collection('infrastructures');
  const panchayatIds = new Map();
  for (const { sourceData: info, rowNumber } of sheets.Panchayat_Info.records) {
    const name = String(info.Panchayat);
    const sourceKey = sourcePanchayatKey(name);
    const doc = makePanchayatDocument({ ...info, sourceRow: rowNumber }, workbookName, now);
    const existing = await panchayatCollection.findOne({ sourceKey }, { projection: { _id: 1, centerCoord: 1, location: 1, habitations: 1, wards: 1 } });
    const { createdAt: _createdAt, centerCoord: _centerCoord, location: _location, habitations: _habitations, wards: _wards, ...sourceOwnedFields } = doc;
    const { createdAt: newPanchayatCreatedAt, ...newPanchayatFields } = doc;
    await panchayatCollection.updateOne(
      { sourceKey },
      existing
        ? { $set: sourceOwnedFields }
        : { $set: newPanchayatFields, $setOnInsert: { createdAt: newPanchayatCreatedAt } },
      { upsert: true }
    );
    const saved = await panchayatCollection.findOne({ sourceKey }, { projection: { _id: 1 } });
    panchayatIds.set(name, saved._id);
  }
  for (const item of validation.records) {
    const panchayatId = panchayatIds.get(String(item.sourceData.Panchayat));
    const sourceKey = stableSourceKey(item.sourceData);
    const existing = await infrastructureCollection.findOne({ sourceKey }, { projection: { _id: 1, location: 1, coordinateSource: 1, coordinatesVerified: 1 } });
    const doc = makeInfrastructureDocument(item, workbookName, panchayatId, now);
    const { createdAt: _createdAt, ...sourceFields } = doc;
    const hasSourceCoordinates = doc.location?.coordinates?.length === 2;
    if (existing && !hasSourceCoordinates) {
      delete sourceFields.location;
      delete sourceFields.coordinateSource;
      delete sourceFields.coordinatesVerified;
    } else if (existing?.coordinateSource === 'FIELD_SURVEY' && existing.coordinatesVerified) {
      delete sourceFields.location;
      delete sourceFields.coordinateSource;
      delete sourceFields.coordinatesVerified;
    }
    const { createdAt: newInfrastructureCreatedAt, ...newInfrastructureFields } = doc;
    await infrastructureCollection.updateOne(
      { sourceKey },
      existing
        ? { $set: sourceFields }
        : { $set: newInfrastructureFields, $setOnInsert: { createdAt: newInfrastructureCreatedAt } },
      { upsert: true }
    );
  }
  return { matchedCount: validation.records.length };
}

async function createAndVerifyBackup(db, mongoUri, backupDir, currentCounts) {
  const resolvedBackup = path.resolve(backupDir);
  try {
    await fs.access(resolvedBackup);
    throw new Error('Backup destination already exists; refusing to overwrite it. Choose a new, empty path.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(path.dirname(resolvedBackup), { recursive: true });
  await execFileAsync('mongodump', ['--uri', mongoUri, '--out', resolvedBackup], { windowsHide: true });
  const dumpRoot = path.join(resolvedBackup, 'rdmt');
  const listedCollections = await db.listCollections({}, { nameOnly: true }).toArray();
  const missingBackupCollections = [];
  for (const { name } of listedCollections) {
    const count = currentCounts[name] ?? await db.collection(name).countDocuments({});
    if (!count) continue;
    const base = path.join(dumpRoot, name);
    try {
      await Promise.all([fs.access(`${base}.bson`), fs.access(`${base}.metadata.json`)]);
    } catch {
      missingBackupCollections.push(name);
    }
  }
  if (missingBackupCollections.length) throw new Error(`Backup verification failed; missing collection dumps: ${missingBackupCollections.join(', ')}. No database changes were made.`);
  await execFileAsync('mongorestore', ['--dryRun', '--dir', resolvedBackup, '--nsInclude=rdmt.*'], { windowsHide: true });
  return resolvedBackup;
}

export async function runImporter({ workbookPath, uri, apply = false, backupDir } = {}) {
  if (!workbookPath) throw new Error('Provide --workbook <path-to-xlsx>.');
  const absoluteWorkbook = path.resolve(workbookPath);
  await fs.access(absoluteWorkbook);
  const mongoUri = uri || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not configured.');
  assertTarget(mongoUri);
  const sheets = await readWorkbook(absoluteWorkbook);
  const validation = validateWorkbook(sheets);
  if (validation.conflicts.length) throw new Error(`Workbook validation failed: ${validation.conflicts.join(' ')}`);

  mongoose.set('autoIndex', false);
  await mongoose.connect(mongoUri, { autoIndex: false, serverSelectionTimeoutMS: 5000, readPreference: 'secondaryPreferred', readConcern: { level: 'majority' } });
  try {
    const db = mongoose.connection.db;
    if (!db || db.databaseName !== 'rdmt') throw new Error('Connected MongoDB database is not rdmt.');
    const indexPlan = await getModelIndexPlan();
    const report = await buildDryRunReport(db, absoluteWorkbook, sheets, validation, indexPlan);
    if (!apply) return report;
    if (!backupDir) throw new Error('Applying requires --backup-dir with a new, non-existing backup destination.');
    if (report.schemaConflicts.length) throw new Error('Import halted because dry-run found database conflicts.');
    const resolvedBackup = await createAndVerifyBackup(db, mongoUri, backupDir, report.currentDatabaseCounts);
    for (const [collectionName, key, options] of indexPlan) {
      await db.collection(collectionName).createIndex(key, options);
    }
    await importSourceRecords(db, absoluteWorkbook, sheets, validation);
    return { ...report, mode: 'APPLIED', backupDirectory: resolvedBackup, note: 'mongodump completed and mongorestore --dryRun verified the backup before source records were written.' };
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.apply && !args.dryRun) throw new Error('Choose --dry-run or --apply.');
  const report = await runImporter({ workbookPath: args.workbook, apply: args.apply, backupDir: args.backupDir });
  console.log(JSON.stringify({ databaseTarget: sanitizeMongoTarget(process.env.MONGODB_URI || ''), ...report }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(async (error) => {
    await mongoose.disconnect().catch(() => undefined);
    console.error(error.message || 'Source import failed.');
    process.exitCode = 1;
  });
}
