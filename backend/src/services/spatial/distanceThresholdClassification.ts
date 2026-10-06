import type { GapSeverity } from './types.js';

export type GapSeverityBasis =
  | 'SCHOOL_DISTANCE'
  | 'ROAD_DISTANCE'
  | 'SCHOOL_AND_ROAD_DISTANCE'
  | 'MISSING_FACILITY_DISTANCE';

export interface DistanceRatioAssessment {
  ratio: number | null;
  severity: GapSeverity;
}

export interface OverallGapAssessment extends DistanceRatioAssessment {
  schoolRatio: number | null;
  roadRatio: number | null;
  severityBasis: GapSeverityBasis;
}

/** Returns actual distance / configured threshold, or null when the distance is unavailable/invalid. */
export function calculateDistanceRatio(
  distanceKm: number | null | undefined,
  thresholdKm: number
): number | null {
  if (!Number.isFinite(thresholdKm) || thresholdKm <= 0) {
    throw new RangeError('Distance threshold must be a positive finite number.');
  }
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0) return null;
  const ratio = distanceKm / thresholdKm;
  return Number.isFinite(ratio) ? ratio : null;
}

/** Bands: <1 Served; [1,1.5) Moderate; [1.5,2] High; >2 Critical. */
export function severityForDistanceRatio(ratio: number | null): GapSeverity {
  if (ratio == null || !Number.isFinite(ratio) || ratio < 0) return 'Critical';
  if (ratio < 1) return 'Served';
  if (ratio < 1.5) return 'Moderate';
  if (ratio <= 2) return 'High';
  return 'Critical';
}

/** Compact display that never rounds a value across a classification boundary. */
export function formatDistanceRatio(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio) || ratio < 0) return 'unavailable';
  const rounded = Number(ratio.toFixed(3));
  for (const boundary of [1, 1.5, 2]) {
    if (ratio < boundary && rounded >= boundary) return `<${boundary.toFixed(1)}x`;
    if (ratio > boundary && rounded <= boundary) return `>${boundary.toFixed(1)}x`;
  }
  return `${rounded}x`;
}

/**
 * Overall severity reflects the worse of school and road ratios. If either
 * distance cannot be calculated, preserve the existing fail-closed Critical
 * no-facility outcome and expose the overall ratio as unavailable.
 */
export function assessOverallGap(
  schoolDistanceKm: number | null | undefined,
  schoolThresholdKm: number,
  roadDistanceKm: number | null | undefined,
  roadThresholdKm: number
): OverallGapAssessment {
  const schoolRatio = calculateDistanceRatio(schoolDistanceKm, schoolThresholdKm);
  const roadRatio = calculateDistanceRatio(roadDistanceKm, roadThresholdKm);

  if (schoolRatio == null || roadRatio == null) {
    return {
      schoolRatio,
      roadRatio,
      ratio: null,
      severity: 'Critical',
      severityBasis: 'MISSING_FACILITY_DISTANCE'
    };
  }

  const ratio = Math.max(schoolRatio, roadRatio);
  const severityBasis: GapSeverityBasis = schoolRatio === roadRatio
    ? 'SCHOOL_AND_ROAD_DISTANCE'
    : schoolRatio > roadRatio
      ? 'SCHOOL_DISTANCE'
      : 'ROAD_DISTANCE';

  return { schoolRatio, roadRatio, ratio, severity: severityForDistanceRatio(ratio), severityBasis };
}

export function coverageStatusForRatio(ratio: number | null): 'WITHIN_THRESHOLD' | 'AT_THRESHOLD' | 'BEYOND_THRESHOLD' | 'NO_FACILITY' {
  if (ratio == null) return 'NO_FACILITY';
  if (ratio < 1) return 'WITHIN_THRESHOLD';
  if (ratio === 1) return 'AT_THRESHOLD';
  return 'BEYOND_THRESHOLD';
}
