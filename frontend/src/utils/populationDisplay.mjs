export function formatPopulation(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString()
    : 'Not available';
}

export function formatPercentage(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value}%`
    : 'Not available';
}

export function formatUnderservedHabitationsSummary(aggregatePopulation, habitationPopulation) {
  if (aggregatePopulation == null) return 'Population data unavailable';

  const formattedPopulation = formatPopulation(habitationPopulation);
  const unit = habitationPopulation == null ? '' : ' citizens';
  return `Population in underserved habitations: ${formattedPopulation}${unit}`;
}
