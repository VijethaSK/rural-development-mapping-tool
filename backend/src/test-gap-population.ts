import assert from 'node:assert/strict';
import { Panchayat } from './models/Panchayat.js';
import {
  calculateGapPopulationMetrics,
  calculateOverallGapPopulationMetrics,
  gapAreaPopulation,
  populationCount,
  unavailableGapPopulationMetrics
} from './services/spatial/populationMetrics.js';

assert.equal(populationCount(undefined), null, 'missing population remains unavailable');
assert.equal(populationCount(null), null, 'null population remains unavailable');
assert.equal(populationCount(0), 0, 'explicit zero remains zero');
assert.equal(populationCount(125), 125, 'positive population is preserved');
assert.equal(gapAreaPopulation('Habitation', undefined), null, 'missing habitation population remains unavailable');
assert.equal(gapAreaPopulation('Habitation', 0), 0, 'genuine zero habitation population remains zero');
assert.equal(gapAreaPopulation('Habitation', 125), 125, 'known habitation population is preserved');
assert.equal(gapAreaPopulation('GridCell', 125), null, 'grid cells have no assigned census population');

const unsavedPanchayat = new Panchayat({
  name: 'Schema default check',
  habitations: [
    { name: 'Missing', ward: 'Ward 1', location: { type: 'Point', coordinates: [74.9, 12.8] } },
    { name: 'Zero', ward: 'Ward 1', population: 0, location: { type: 'Point', coordinates: [74.9, 12.8] } }
  ]
});
assert.equal(unsavedPanchayat.habitations?.[0].population, undefined, 'Mongoose does not default missing habitation population to zero');
assert.equal(unsavedPanchayat.habitations?.[1].population, 0, 'Mongoose preserves an explicitly supplied zero');

assert.deepEqual(calculateGapPopulationMetrics([], []), {
  totalPopulation: null,
  populationAffected: null,
  percentagePopulationAffected: null
}, 'an empty habitation list has unavailable population metrics');
assert.deepEqual(calculateGapPopulationMetrics([100, null], [100]), {
  totalPopulation: null,
  populationAffected: null,
  percentagePopulationAffected: null
}, 'partially populated habitation lists do not produce undercounted totals');
assert.deepEqual(calculateGapPopulationMetrics([100, 50], [50]), {
  totalPopulation: 150,
  populationAffected: 50,
  percentagePopulationAffected: 33.3
}, 'complete habitation data produces valid totals and percentage');
assert.deepEqual(calculateGapPopulationMetrics([100], []), {
  totalPopulation: 100,
  populationAffected: 0,
  percentagePopulationAffected: 0
}, 'a known population with no underserved habitations has a genuine zero affected count');
assert.deepEqual(calculateGapPopulationMetrics([0, 0], []), {
  totalPopulation: 0,
  populationAffected: 0,
  percentagePopulationAffected: null
}, 'known zero totals remain zero while division by zero is unavailable');
assert.deepEqual(calculateOverallGapPopulationMetrics([100, 50], [], [null, null]), {
  totalPopulation: 150,
  populationInUnderservedHabitations: 0,
  populationAffected: null,
  percentagePopulationAffected: null
}, 'unknown grid-cell populations make overall affected population unavailable');
assert.deepEqual(calculateOverallGapPopulationMetrics([100], [], []), {
  totalPopulation: 100,
  populationInUnderservedHabitations: 0,
  populationAffected: 0,
  percentagePopulationAffected: 0
}, 'known population with no habitation or grid gaps preserves genuine zero');
assert.deepEqual(calculateOverallGapPopulationMetrics([100, null], [100], []), {
  totalPopulation: null,
  populationInUnderservedHabitations: null,
  populationAffected: null,
  percentagePopulationAffected: null
}, 'missing habitation population keeps population metrics unavailable');
assert.deepEqual(calculateOverallGapPopulationMetrics([100, 50], [50], [null]), {
  totalPopulation: 150,
  populationInUnderservedHabitations: 50,
  populationAffected: null,
  percentagePopulationAffected: null
}, 'known habitation attribution stays separate from unknown overall grid impact');
assert.deepEqual(unavailableGapPopulationMetrics(), {
  affectedPopulation: null,
  totalPopulation: null,
  schoolCoveragePercent: null
}, 'dashboard failure reports unavailable population and coverage metrics');

console.log('Gap population correctness tests passed.');
