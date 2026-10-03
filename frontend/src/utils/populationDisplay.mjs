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
