/** Return grid polygons for the map while preserving the normal gap-only contract. */
export function visibleGapCoverageCells(result, issueFilter = 'All', severityFilter = 'All') {
  if (!result) return [];
  const source = Array.isArray(result.demonstrationGridCells)
    ? result.demonstrationGridCells
    : (Array.isArray(result.underservedAreas) ? result.underservedAreas : [])
      .filter((area) => area.areaType === 'GridCell');

  return source.filter((area) => {
    if (issueFilter !== 'All' && area.primaryIssue !== issueFilter) return false;
    if (severityFilter !== 'All' && area.overallSeverity !== severityFilter) return false;
    return area.areaType === 'GridCell' && Boolean(area.polygonGeometry);
  });
}

export function hasSyntheticGapDemonstration(result) {
  return result?.syntheticDemonstration === true && Array.isArray(result.demonstrationGridCells);
}
