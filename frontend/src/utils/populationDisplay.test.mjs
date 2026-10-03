import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatPercentage, formatPopulation } from './populationDisplay.mjs';

test('population display distinguishes unavailable values from explicit zero', () => {
  assert.equal(formatPopulation(null), 'Not available');
  assert.equal(formatPopulation(undefined), 'Not available');
  assert.equal(formatPopulation(0), '0');
  assert.equal(formatPopulation(1234), (1234).toLocaleString());
});

test('population percentage is unavailable when its population denominator is unavailable', () => {
  assert.equal(formatPercentage(null), 'Not available');
  assert.equal(formatPercentage(0), '0%');
  assert.equal(formatPercentage(25.5), '25.5%');
});

test('print and CSV report paths use the same null-preserving population formatter', () => {
  const reportsPage = readFileSync(new URL('../pages/admin/ReportsPage.tsx', import.meta.url), 'utf8');
  const csvStart = reportsPage.indexOf('function makeCsv');
  const sectionStart = reportsPage.indexOf('<Section title="9. Infrastructure gaps">');
  assert.ok(csvStart >= 0 && sectionStart > csvStart);
  const csvPath = reportsPage.slice(csvStart, sectionStart);
  const printablePath = reportsPage.slice(sectionStart);
  assert.match(csvPath, /formatPopulation\(item\.affectedPopulation\)/);
  assert.match(csvPath, /formatPopulation\(report\.gaps\.affectedPopulation\)/);
  assert.match(csvPath, /formatPopulation\(report\.gaps\.totalPopulation\)/);
  assert.match(printablePath, /formatPopulation\(report\.gaps\.affectedPopulation\)/);
  assert.match(printablePath, /formatPopulation\(report\.gaps\.totalPopulation\)/);
  assert.match(printablePath, /formatPopulation\(item\.affectedPopulation\)/);
});

test('gap-analysis cards, popups, tables, and dashboard views use null-aware formatting', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const gapAnalysisPage = read('../pages/GapAnalysisPage.tsx');
  const mapPage = read('../pages/MapPage.tsx');
  const dashboardGaps = read('../components/admin/dashboard/GapAnalysisSection.tsx');
  const dashboardMap = read('../components/admin/dashboard/MapIntelligenceSection.tsx');

  assert.match(gapAnalysisPage, /formatPopulation\(metrics\.populationAffected\)/);
  assert.match(gapAnalysisPage, /formatPercentage\(metrics\.percentagePopulationAffected\)/);
  assert.match(gapAnalysisPage, /formatPopulation\(hab\.populationAffected\)/);
  assert.match(gapAnalysisPage, /formatPopulation\(area\.populationAffected\)/);
  assert.match(mapPage, /formatPopulation\(gap\.populationAffected\)/);
  assert.match(dashboardGaps, /formatPopulation\(metrics\.affectedPopulation\)/);
  assert.match(dashboardGaps, /formatPercentage\(metrics\.schoolCoveragePercent\)/);
  assert.match(dashboardGaps, /formatPopulation\(gap\.affectedPopulation\)/);
  assert.match(dashboardMap, /formatPopulation\(g\.affectedPopulation\)/);
});
