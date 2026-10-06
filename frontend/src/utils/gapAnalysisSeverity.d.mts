export type GapSeverity = 'Critical' | 'High' | 'Moderate' | 'Served';
export type GapSeverityBasis = 'SCHOOL_DISTANCE' | 'ROAD_DISTANCE' | 'SCHOOL_AND_ROAD_DISTANCE' | 'MISSING_FACILITY_DISTANCE';

export const criticalGapLegendText: string;
export function formatDistanceRatio(ratio: number | null | undefined): string;
export function formatGapSeverity(severity: GapSeverity): string;
export function formatSeverityBasis(severityBasis: GapSeverityBasis): string;
export function formatCoverageStatus(status: 'WITHIN_THRESHOLD' | 'AT_THRESHOLD' | 'BEYOND_THRESHOLD' | 'NO_FACILITY'): string;
