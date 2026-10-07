import type { GapAnalysisResult, UnderservedArea } from '../types/gap';

export function visibleGapCoverageCells(
  result: GapAnalysisResult | null | undefined,
  issueFilter?: string,
  severityFilter?: string
): UnderservedArea[];

export function hasSyntheticGapDemonstration(result: GapAnalysisResult | null | undefined): boolean;
