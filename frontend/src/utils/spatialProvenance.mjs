const TRUSTED_COORDINATE_SOURCES = new Set(['FIELD_SURVEY']);

/** Mirrors the backend's fail-closed map display/center trust policy. */
export function hasVerifiedSpatialProvenance(record) {
  return Boolean(record) &&
    record.coordinatesVerified === true &&
    record.coordinateStatus === 'VERIFIED' &&
    TRUSTED_COORDINATE_SOURCES.has(record.coordinateSource) &&
    record.isSynthetic !== true &&
    record.dataOrigin !== 'DEMO' &&
    record.dataOrigin !== 'LEGACY_DEMO' &&
    record.source !== 'RDMT_GAP_ANALYSIS_SYNTHETIC_DEMO_V1';
}
