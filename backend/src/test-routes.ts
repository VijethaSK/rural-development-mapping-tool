import { RoadGraph } from './services/routing/graph.js';
import { DijkstraShortestPath } from './services/routing/dijkstra.js';
import { DijkstraRoadGraphProvider } from './services/routing/routingProvider.js';
import { MultiStopOptimizer } from './services/routing/multiStopOptimizer.js';
import { Coordinate, StopCandidate } from './services/routing/types.js';

async function runRouteTests() {
  console.log('===========================================================');
  console.log('  RUNNING MAINTENANCE ROUTE OPTIMIZATION ENGINE TESTS');
  console.log('===========================================================');

  try {
    // -------------------------------------------------------------
    // TEST 1: Dijkstra Shortest Path on Graph
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Dijkstra Shortest Path ---');
    const testGraph = new RoadGraph();

    // Create a 4-node diamond graph:
    // A (0,0) -> B (0, 0.01) [weight 500m] -> C (0.01, 0.01) [weight 500m] (Total A->B->C = 1000m)
    // A (0,0) -> D (0.01, 0) [weight 1500m] -> C (0.01, 0.01) [weight 200m] (Total A->D->C = 1700m)
    const nodeA = testGraph.addNode({ lat: 12.9700, lng: 77.5900 }, 'nodeA');
    const nodeB = testGraph.addNode({ lat: 12.9750, lng: 77.5900 }, 'nodeB');
    const nodeC = testGraph.addNode({ lat: 12.9750, lng: 77.5950 }, 'nodeC');
    const nodeD = testGraph.addNode({ lat: 12.9700, lng: 77.5950 }, 'nodeD');

    // Add edges
    testGraph.addEdge('nodeA', 'nodeB', 500, [[77.5900, 12.9700], [77.5900, 12.9750]]);
    testGraph.addEdge('nodeB', 'nodeC', 500, [[77.5900, 12.9750], [77.5950, 12.9750]]);
    testGraph.addEdge('nodeA', 'nodeD', 1500, [[77.5900, 12.9700], [77.5950, 12.9700]]);
    testGraph.addEdge('nodeD', 'nodeC', 200, [[77.5950, 12.9700], [77.5950, 12.9750]]);

    const pathAC = DijkstraShortestPath.findPathBetweenNodes(testGraph, 'nodeA', 'nodeC');
    if (!pathAC.reachable || pathAC.distanceMeters !== 1000) {
      throw new Error(`Dijkstra failed to find shortest path: expected 1000m, got ${pathAC.distanceMeters}m`);
    }
    const pathNames = pathAC.pathNodeIds.join(' -> ');
    if (pathNames !== 'nodeA -> nodeB -> nodeC') {
      throw new Error(`Dijkstra path order incorrect: got ${pathNames}`);
    }
    console.log(`✓ Dijkstra found optimal path nodeA -> nodeB -> nodeC with exact distance ${pathAC.distanceMeters}m`);

    // -------------------------------------------------------------
    // TEST 2: Unreachable Nodes (Disconnected Graph Components)
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Unreachable Nodes ---');
    // Add an isolated island node E
    const nodeE = testGraph.addNode({ lat: 13.5000, lng: 78.5000 }, 'nodeE');
    const unreachableRes = DijkstraShortestPath.findPathBetweenNodes(testGraph, 'nodeA', 'nodeE');

    if (unreachableRes.reachable !== false || unreachableRes.distanceMeters !== Infinity) {
      throw new Error(`Expected disconnected node to be unreachable, got reachable=${unreachableRes.reachable}, dist=${unreachableRes.distanceMeters}`);
    }
    console.log('✓ Unreachable disconnected node correctly returned reachable=false and distance=Infinity');

    // -------------------------------------------------------------
    // TEST 3: Multiple Stops Optimization (Priority + Nearest Neighbor + 2-opt)
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Multiple Stops Optimization ---');
    const startLocation: Coordinate = { lat: 12.9700, lng: 77.5900 }; // Depot / Panchayat office

    const candidates: StopCandidate[] = [
      {
        infrastructureId: 'asset-1',
        infrastructureName: 'Low Priority Culvert (Far)',
        location: { lat: 12.9850, lng: 77.6050 }, // ~2.3 km
        priorityScore: 25,
        priorityLevel: 'Low'
      },
      {
        infrastructureId: 'asset-2',
        infrastructureName: 'Critical Main Road Collapse (Medium distance)',
        location: { lat: 12.9780, lng: 77.5980 }, // ~1.2 km
        priorityScore: 92,
        priorityLevel: 'Critical'
      },
      {
        infrastructureId: 'asset-3',
        infrastructureName: 'High Priority Primary School',
        location: { lat: 12.9790, lng: 77.6010 }, // ~1.4 km
        priorityScore: 78,
        priorityLevel: 'High'
      },
      {
        infrastructureId: 'asset-4',
        infrastructureName: 'Medium Priority Water Tanker',
        location: { lat: 12.9720, lng: 77.5920 }, // ~0.3 km
        priorityScore: 45,
        priorityLevel: 'Medium'
      }
    ];

    const provider = new DijkstraRoadGraphProvider(testGraph);
    const multiStopRes = await MultiStopOptimizer.optimizeRoute(
      startLocation,
      candidates,
      { priorityWeight: 1.5, averageSpeedKmph: 30 },
      provider
    );

    if (multiStopRes.stopsCount !== 4) {
      throw new Error(`Expected 4 stops, got ${multiStopRes.stopsCount}`);
    }

    console.log(`✓ Optimization succeeded:`);
    console.log(`   - Stops Count: ${multiStopRes.stopsCount}`);
    console.log(`   - Total Distance: ${multiStopRes.totalDistanceKm} km`);
    console.log(`   - Estimated Duration: ${multiStopRes.estimatedDurationMinutes} mins`);
    console.log(`   - Algorithm: ${multiStopRes.algorithm.shortestPath} + ${multiStopRes.algorithm.ordering} + ${multiStopRes.algorithm.improvement}`);
    console.log('   - Stop Order:');
    multiStopRes.orderedStops.forEach((s) => {
      console.log(`     #${s.sequence}: ${s.infrastructureName} [${s.priorityLevel}, score: ${s.priorityScore}] (+${s.distanceFromPreviousKm} km, ETA: ${s.estimatedArrivalTime})`);
    });

    // -------------------------------------------------------------
    // TEST 4: Route Distance Calculation & Accumulation
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Route Distance Calculation ---');
    let sumLegs = 0;
    multiStopRes.orderedStops.forEach((s) => {
      sumLegs += s.distanceFromPreviousKm;
      // Cumulative distance should equal running sum
      const diff = Math.abs(s.cumulativeDistanceKm - Number(sumLegs.toFixed(2)));
      if (diff > 0.05) {
        throw new Error(`Cumulative distance mismatch at stop #${s.sequence}: expected ${sumLegs.toFixed(2)}, got ${s.cumulativeDistanceKm}`);
      }
    });

    const totalDiff = Math.abs(multiStopRes.totalDistanceKm - Number(sumLegs.toFixed(2)));
    if (totalDiff > 0.05) {
      throw new Error(`Total distance ${multiStopRes.totalDistanceKm} does not match sum of legs ${sumLegs.toFixed(2)}`);
    }
    console.log(`✓ Distance accumulation verified: Sum of legs (${sumLegs.toFixed(2)} km) equals Total (${multiStopRes.totalDistanceKm} km)`);

    // -------------------------------------------------------------
    // TEST 5: Empty Route (0 stops)
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Empty Route Handling ---');
    const emptyRes = await MultiStopOptimizer.optimizeRoute(startLocation, [], {}, provider);
    if (emptyRes.stopsCount !== 0 || emptyRes.totalDistanceKm !== 0 || emptyRes.orderedStops.length !== 0) {
      throw new Error(`Empty route failed: stopsCount=${emptyRes.stopsCount}, dist=${emptyRes.totalDistanceKm}`);
    }
    console.log('✓ Empty route handled cleanly with 0 stops and 0 km distance');

    // -------------------------------------------------------------
    // TEST 6: Single Destination (1 stop)
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Single Destination ---');
    const singleCandidate: StopCandidate[] = [candidates[1]]; // Critical Road
    const singleRes = await MultiStopOptimizer.optimizeRoute(startLocation, singleCandidate, {}, provider);

    if (singleRes.stopsCount !== 1 || singleRes.orderedStops.length !== 1) {
      throw new Error(`Single stop failed: expected 1 stop, got ${singleRes.stopsCount}`);
    }
    if (singleRes.orderedStops[0].infrastructureId !== 'asset-2') {
      throw new Error(`Single stop returned wrong asset: ${singleRes.orderedStops[0].infrastructureId}`);
    }
    console.log(`✓ Single destination handled correctly: 1 stop (${singleRes.orderedStops[0].infrastructureName})`);

    // -------------------------------------------------------------
    // TEST 7: Duplicate Destinations
    // -------------------------------------------------------------
    console.log('\n--- Test 7: Duplicate Destinations ---');
    const withDuplicates: StopCandidate[] = [
      candidates[0],
      candidates[1],
      candidates[0], // Duplicate ID of candidate 0
      {
        infrastructureId: 'asset-dup-coord',
        infrastructureName: 'Exact Duplicate Location of Asset 1',
        location: { ...candidates[0].location }, // Exact same coords
        priorityScore: 20,
        priorityLevel: 'Low'
      }
    ];

    const deduplicatedRes = await MultiStopOptimizer.optimizeRoute(startLocation, withDuplicates, {}, provider);
    if (deduplicatedRes.stopsCount !== 3) {
      throw new Error(`Duplicate-ID deduplication failed: expected 3 stops including distinct co-located assets, got ${deduplicatedRes.stopsCount}`);
    }
    console.log(`✓ Repeated infrastructure IDs removed; distinct assets at identical coordinates retained.`);

    // -------------------------------------------------------------
    // TEST 8: Invalid Coordinates
    // -------------------------------------------------------------
    console.log('\n--- Test 8: Invalid Coordinates Validation ---');
    let caughtLatError = false;
    try {
      await MultiStopOptimizer.optimizeRoute(
        { lat: 95.0, lng: 77.59 }, // Latitude > 90
        candidates,
        {},
        provider
      );
    } catch (err: any) {
      caughtLatError = true;
      console.log(`✓ Caught invalid latitude (> 90): "${err.message}"`);
    }
    if (!caughtLatError) throw new Error('Failed to catch out-of-bounds latitude!');

    let caughtNaNError = false;
    try {
      await MultiStopOptimizer.optimizeRoute(
        startLocation,
        [
          {
            infrastructureId: 'bad-coord',
            infrastructureName: 'NaN Coordinate Asset',
            location: { lat: NaN, lng: 77.59 },
            priorityScore: 50,
            priorityLevel: 'Medium'
          }
        ],
        {},
        provider
      );
    } catch (err: any) {
      caughtNaNError = true;
      console.log(`✓ Caught NaN coordinate: "${err.message}"`);
    }
    if (!caughtNaNError) throw new Error('Failed to catch NaN coordinate!');

    console.log('\n===========================================================');
    console.log('  ALL ROUTE OPTIMIZATION ENGINE TESTS PASSED WITH 100% SUCCESS');
    console.log('===========================================================');
  } catch (err) {
    console.error('❌ Route optimization test failure:', err);
    process.exit(1);
  }
}

runRouteTests();
