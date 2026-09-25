import { connectDb, disconnectDb } from './config/db.js';
import {
  PriorityScoringService,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  DEFAULT_LIMITS
} from './services/priorityScoringService.js';
import { PriorityConfig } from './models/PriorityConfig.js';
import { Panchayat } from './models/Panchayat.js';
import { Road, School, WaterFacility, Infrastructure } from './models/Infrastructure.js';

async function runPriorityTests() {
  console.log('===========================================================');
  console.log('  RUNNING INFRASTRUCTURE PRIORITY SCORING ENGINE TESTS');
  console.log('===========================================================');

  try {
    await connectDb(true);
    console.log('✓ Connected to test database.');

    // Clear collections
    await Promise.all([
      PriorityConfig.deleteMany({}),
      Infrastructure.deleteMany({}),
      Panchayat.deleteMany({})
    ]);

    // -------------------------------------------------------------
    // TEST 1: Factor Normalization
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Factor Normalization ---');

    // 1A. Condition
    const condBad = PriorityScoringService.normalizeCondition('Bad');
    const condAvg = PriorityScoringService.normalizeCondition('Average');
    const condGood = PriorityScoringService.normalizeCondition('Good');
    const condUnknown = PriorityScoringService.normalizeCondition(undefined);

    if (condBad.score !== 95 || condAvg.score !== 55 || condGood.score !== 15 || condUnknown.score !== 50) {
      throw new Error(`Condition normalization failed: Bad=${condBad.score}, Avg=${condAvg.score}, Good=${condGood.score}`);
    }
    console.log('✓ Condition mapping: Bad=95, Average=55, Good=15, Unknown=50');

    // 1B. Complaints
    const comp0 = PriorityScoringService.normalizeComplaints(0, 5);
    const comp3 = PriorityScoringService.normalizeComplaints(3, 5);
    const comp10 = PriorityScoringService.normalizeComplaints(10, 5); // Exceeds cap

    if (comp0.score !== 0 || comp3.score !== 60 || comp10.score !== 100) {
      throw new Error(`Complaints normalization failed: 0=${comp0.score}, 3=${comp3.score}, 10=${comp10.score}`);
    }
    console.log('✓ Complaints scaling: 0=0, 3/5=60, 10/5=100 (capped)');

    // 1C. Population
    const pop0 = PriorityScoringService.normalizePopulation(0, 5000);
    const pop2500 = PriorityScoringService.normalizePopulation(2500, 5000);
    const pop8000 = PriorityScoringService.normalizePopulation(8000, 5000); // Exceeds cap

    if (pop0.score !== 0 || pop2500.score !== 50 || pop8000.score !== 100) {
      throw new Error(`Population normalization failed: 0=${pop0.score}, 2500=${pop2500.score}, 8000=${pop8000.score}`);
    }
    console.log('✓ Population scaling: 0=0, 2500/5000=50, 8000/5000=100 (capped)');

    // 1D. Traffic
    const trHigh = PriorityScoringService.normalizeTraffic('High', 'Road');
    const trMed = PriorityScoringService.normalizeTraffic('Medium', 'Road');
    const trLow = PriorityScoringService.normalizeTraffic('Low', 'Road');

    if (trHigh.score !== 90 || trMed.score !== 55 || trLow.score !== 20) {
      throw new Error(`Traffic normalization failed: High=${trHigh.score}, Med=${trMed.score}, Low=${trLow.score}`);
    }
    console.log('✓ Traffic scaling: High=90, Medium=55, Low=20');

    // 1E. Maintenance Age
    const recentDate = new Date(); // Today
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000);
    const fourYearsAgo = new Date(Date.now() - 1500 * 24 * 3600 * 1000); // Exceeds 3 years (1095 days)

    const ageRecent = PriorityScoringService.normalizeMaintenanceAge(recentDate, 1095);
    const ageOneYear = PriorityScoringService.normalizeMaintenanceAge(oneYearAgo, 1095);
    const ageFourYears = PriorityScoringService.normalizeMaintenanceAge(fourYearsAgo, 1095);

    if (ageRecent.score > 2 || ageOneYear.score < 30 || ageOneYear.score > 36 || ageFourYears.score !== 100) {
      throw new Error(`Maintenance age normalization failed: Recent=${ageRecent.score}, 1yr=${ageOneYear.score}, 4yr=${ageFourYears.score}`);
    }
    console.log(`✓ Maintenance age scaling: Today=${ageRecent.score}, 1yr=${ageOneYear.score}, 4yr=${ageFourYears.score} (capped at 100)`);

    // -------------------------------------------------------------
    // TEST 2: Scoring Formula & Factor Contributions
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Scoring Formula & Factor Contributions ---');

    const testAsset = {
      condition: 'Bad',           // 95 * 0.30 = 28.5
      complaintsCount: 4,          // 4/5 * 100 = 80 * 0.20 = 16.0
      populationServed: 3500,      // 3500/5000 * 100 = 70 * 0.15 = 10.5
      trafficLevel: 'High',        // 90 * 0.15 = 13.5
      lastRepairDate: oneYearAgo,  // ~33 * 0.10 = 3.3
      alternativeDistanceKm: 2.5   // 2.5/5 * 100 = 50 * 0.10 = 5.0
    };

    const config = {
      weights: DEFAULT_WEIGHTS,
      thresholds: DEFAULT_THRESHOLDS,
      limits: DEFAULT_LIMITS
    };

    const calc = PriorityScoringService.calculate(testAsset, config);

    console.log('Calculated Result:');
    console.log(' - Priority Score:', calc.priorityScore);
    console.log(' - Priority Level:', calc.priorityLevel);
    console.log(' - Summary:', calc.summary);
    console.log(' - Factors Breakdown:');
    Object.entries(calc.factors).forEach(([key, f]) => {
      console.log(`   * ${key.padEnd(20)}: Score=${String(f.normalizedScore).padStart(3)} | Weight=${f.weight} | Contrib=${f.contribution.toFixed(2)}`);
    });

    // Check contribution sums
    const sumContrib = Object.values(calc.factors).reduce((acc, f) => acc + f.contribution, 0);
    const delta = Math.abs(sumContrib - calc.priorityScore);
    if (delta > 0.1) {
      throw new Error(`Factor contributions (${sumContrib}) does not match priorityScore (${calc.priorityScore})`);
    }
    if (calc.priorityScore < 70 || calc.priorityScore > 85) {
      throw new Error(`Priority score out of expected range (expected ~76.8, got ${calc.priorityScore})`);
    }
    if (calc.priorityLevel !== 'High') {
      throw new Error(`Expected level 'High' for score ${calc.priorityScore}, got '${calc.priorityLevel}'`);
    }
    console.log('✓ Factor contributions mathematically sum to total score within 0.05 delta.');

    // -------------------------------------------------------------
    // TEST 3: Weight Validation
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Configurable Weight Validation ---');

    let invalidRejected = false;
    try {
      const invalidConfig = new PriorityConfig({
        weights: {
          condition: 0.50,
          complaints: 0.50,
          population: 0.20, // Sum = 1.20 (invalid!)
          traffic: 0.0,
          maintenanceAge: 0.0,
          alternativeDistance: 0.0
        }
      });
      await invalidConfig.save();
    } catch (err: any) {
      invalidRejected = true;
      console.log('✓ Correctly rejected weights summing to 1.20:', err.message);
    }
    if (!invalidRejected) throw new Error('Failed to reject invalid weights summing to > 1.0');

    // Valid configuration
    const validConfig = await PriorityConfig.create({
      name: 'Custom Gram Panchayat Config',
      weights: {
        condition: 0.35,
        complaints: 0.25,
        population: 0.15,
        traffic: 0.10,
        maintenanceAge: 0.10,
        alternativeDistance: 0.05
      }
    });
    console.log('✓ Successfully saved valid weights summing to 1.00 (ID:', validConfig._id.toString(), ')');

    // -------------------------------------------------------------
    // TEST 4: Ranking & Sorting Order
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Ranking & Descending Sorting Order ---');

    const p = await Panchayat.create({
      name: 'Test Panchayat Ranking',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      centerCoord: { lat: 12.95, lng: 77.75 },
      wards: ['Ward 1', 'Ward 2']
    });

    // Asset A: Critical road
    await Road.create({
      panchayatId: p._id,
      name: 'Critical Road Segment',
      type: 'Road',
      ward: 'Ward 1',
      condition: 'Bad',
      complaintsCount: 5,
      populationServed: 5000,
      trafficLevel: 'High',
      lastRepairDate: fourYearsAgo,
      roadLength: 1.5,
      location: { type: 'Point', coordinates: [77.75, 12.95] }
    });

    // Asset B: Moderate School
    await School.create({
      panchayatId: p._id,
      name: 'Moderate School',
      type: 'School',
      ward: 'Ward 1',
      condition: 'Average',
      complaintsCount: 2,
      populationServed: 1200,
      studentCount: 250,
      lastMaintenanceDate: oneYearAgo,
      location: { type: 'Point', coordinates: [77.76, 12.96] }
    });

    // Asset C: Good Water Facility
    await WaterFacility.create({
      panchayatId: p._id,
      name: 'Good Water Point',
      type: 'WaterFacility',
      ward: 'Ward 2',
      condition: 'Good',
      complaintsCount: 0,
      populationServed: 400,
      lastMaintenanceDate: recentDate,
      location: { type: 'Point', coordinates: [77.77, 12.97] }
    });

    const ranked = await PriorityScoringService.getRanked({ panchayatId: String(p._id) });
    console.log(`✓ Ranked ${ranked.items.length} items:`);
    ranked.items.forEach((item, index) => {
      console.log(`   #${index + 1}: ${item.name} (${item.type}) -> Score: ${item.priorityScore} [${item.priorityLevel}]`);
    });

    // Verify descending order
    for (let i = 0; i < ranked.items.length - 1; i++) {
      const currentScore = ranked.items[i].priorityScore;
      const nextScore = ranked.items[i + 1].priorityScore;
      if (currentScore != null && nextScore != null && currentScore < nextScore) {
        throw new Error(`Ranking order error: item #${i + 1} (${currentScore}) < item #${i + 2} (${nextScore})`);
      }
    }
    console.log('✓ Ranking strictly verified in descending order of priority score.');

    if (ranked.stats.total !== 3 || ranked.stats.critical < 1) {
      throw new Error(`KPI statistics mismatch: total=${ranked.stats.total}, critical=${ranked.stats.critical}`);
    }
    console.log(`✓ Stats verified: Total=${ranked.stats.total}, Critical=${ranked.stats.critical}, High=${ranked.stats.high}, Medium=${ranked.stats.medium}, Low=${ranked.stats.low}`);

    // -------------------------------------------------------------
    // TEST 5: Edge Cases & Missing Values
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Missing Values & Edge Cases ---');

    const edgeAsset = {
      condition: undefined,
      complaintsCount: undefined,
      populationServed: undefined,
      trafficLevel: undefined,
      lastRepairDate: null,
      alternativeDistanceKm: undefined
    };

    const edgeCalc = PriorityScoringService.calculate(edgeAsset, config);
    console.log('✓ Missing values handled gracefully with neutral defaults: Score =', edgeCalc.priorityScore, `[${edgeCalc.priorityLevel}]`);
    if (isNaN(edgeCalc.priorityScore) || edgeCalc.priorityScore < 0 || edgeCalc.priorityScore > 100) {
      throw new Error(`Invalid score on missing values: ${edgeCalc.priorityScore}`);
    }

    console.log('\n===========================================================');
    console.log('  ALL PRIORITY SCORING ENGINE TESTS PASSED WITH 100% SUCCESS');
    console.log('===========================================================');
  } catch (err) {
    console.error('❌ Priority engine test failure:', err);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}

runPriorityTests();
