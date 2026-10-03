export interface GapPopulationMetrics {
  totalPopulation: number | null;
  populationAffected: number | null;
  percentagePopulationAffected: number | null;
}

export interface OverallGapPopulationMetrics extends GapPopulationMetrics {
  populationInUnderservedHabitations: number | null;
}

export interface DashboardGapPopulationMetrics {
  affectedPopulation: number | null;
  totalPopulation: number | null;
  schoolCoveragePercent: number | null;
}

/** Unknown, invalid, or absent values stay unavailable; an explicit zero stays zero. */
export function populationCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function gapAreaPopulation(
  areaType: 'Habitation' | 'GridCell',
  habitationPopulation?: unknown
): number | null {
  return areaType === 'Habitation' ? populationCount(habitationPopulation) : null;
}

/** Totals are available only when every habitation has a known population. */
export function calculateGapPopulationMetrics(
  habitationPopulations: readonly unknown[],
  affectedPopulations: readonly unknown[]
): GapPopulationMetrics {
  const knownHabitations = habitationPopulations.map(populationCount);
  if (knownHabitations.length === 0 || knownHabitations.some((value) => value === null)) {
    return { totalPopulation: null, populationAffected: null, percentagePopulationAffected: null };
  }

  const totalPopulation = knownHabitations.reduce<number>((sum, value) => sum + value!, 0);
  const knownAffected = affectedPopulations.map(populationCount);
  const populationAffected = knownAffected.some((value) => value === null)
    ? null
    : knownAffected.reduce<number>((sum, value) => sum + value!, 0);
  const percentagePopulationAffected =
    totalPopulation > 0 && populationAffected !== null
      ? Number(((populationAffected / totalPopulation) * 100).toFixed(1))
      : null;

  return { totalPopulation, populationAffected, percentagePopulationAffected };
}

/**
 * Keep habitation attribution visible, but do not report it as overall impact when
 * underserved grid cells have no population allocation (or a safe deduplication rule).
 */
export function calculateOverallGapPopulationMetrics(
  habitationPopulations: readonly unknown[],
  affectedHabitationPopulations: readonly unknown[],
  affectedGridCellPopulations: readonly unknown[]
): OverallGapPopulationMetrics {
  const habitationMetrics = calculateGapPopulationMetrics(
    habitationPopulations,
    affectedHabitationPopulations
  );
  const hasGridCellGaps = affectedGridCellPopulations.length > 0;
  const populationAffected = hasGridCellGaps ? null : habitationMetrics.populationAffected;

  return {
    totalPopulation: habitationMetrics.totalPopulation,
    populationInUnderservedHabitations: habitationMetrics.populationAffected,
    populationAffected,
    percentagePopulationAffected:
      populationAffected === null ? null : habitationMetrics.percentagePopulationAffected
  };
}

/** Dashboard analysis failures must not masquerade as zero population or full coverage. */
export function unavailableGapPopulationMetrics(): DashboardGapPopulationMetrics {
  return { affectedPopulation: null, totalPopulation: null, schoolCoveragePercent: null };
}
