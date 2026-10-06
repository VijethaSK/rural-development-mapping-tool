export const criticalGapLegendText = '> 2.0x ratio or required distance unavailable';

export function formatDistanceRatio(ratio) {
  if (ratio == null || !Number.isFinite(ratio) || ratio < 0) return 'unavailable';
  const rounded = Number(ratio.toFixed(3));
  for (const boundary of [1, 1.5, 2]) {
    if (ratio < boundary && rounded >= boundary) return `<${boundary.toFixed(1)}x`;
    if (ratio > boundary && rounded <= boundary) return `>${boundary.toFixed(1)}x`;
  }
  return `${rounded}x`;
}

export function formatGapSeverity(severity) {
  return severity === 'Served' ? 'No Gap / Within Acceptable Threshold' : `${severity} Gap`;
}

export function formatSeverityBasis(severityBasis) {
  if (severityBasis === 'MISSING_FACILITY_DISTANCE') {
    return 'Critical no-facility classification: one or more required facility distances are unavailable.';
  }
  if (severityBasis === 'SCHOOL_DISTANCE') return 'Classification uses the larger school distance ratio.';
  if (severityBasis === 'ROAD_DISTANCE') return 'Classification uses the larger road distance ratio.';
  return 'Classification uses the larger of the school and road distance ratios.';
}

export function formatCoverageStatus(status) {
  if (status === 'WITHIN_THRESHOLD') return 'within acceptable threshold';
  if (status === 'AT_THRESHOLD') return 'at threshold (gap begins at 1.0x)';
  if (status === 'BEYOND_THRESHOLD') return 'beyond threshold';
  return 'distance unavailable (no usable facility geometry)';
}
