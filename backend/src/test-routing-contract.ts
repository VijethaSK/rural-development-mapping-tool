import assert from 'node:assert/strict';
import { RoadGraph } from './services/routing/graph.js';
import { DijkstraShortestPath } from './services/routing/dijkstra.js';
import { DijkstraRoadGraphProvider } from './services/routing/routingProvider.js';
import { buildRoutingAlgorithmDescription, MultiStopOptimizer } from './services/routing/multiStopOptimizer.js';
import type { Coordinate, DistanceMatrixResult, IRoutingProvider, ProviderRouteResult, RoutingMethod, ShortestPathResult, StopCandidate } from './services/routing/types.js';

const point = (lng: number, lat = 12.9): Coordinate => ({ lng, lat });
const candidates = (...ids: string[]): StopCandidate[] => ids.map((id, index) => ({
  infrastructureId: id,
  infrastructureName: id,
  location: point(77.6 + (index + 1) / 1000),
  priorityScore: 0,
  priorityLevel: 'Low'
}));

class MatrixFixtureProvider implements IRoutingProvider {
  readonly name = 'Contract test matrix';
  readonly provider = 'INTERNAL' as const;

  constructor(
    private readonly distances: (number | null)[][],
    private readonly longitudes: number[],
    private readonly matrixUsesFallback = false,
    private readonly routeDistanceScale = 1,
    private readonly matrixMethodOverrides: Record<string, RoutingMethod> = {}
  ) {}

  private index(coord: Coordinate): number {
    const result = this.longitudes.indexOf(coord.lng);
    if (result < 0) throw new Error(`Unknown fixture coordinate ${coord.lng}`);
    return result;
  }

  async findShortestPath(start: Coordinate, end: Coordinate): Promise<ShortestPathResult> {
    const from = this.index(start), to = this.index(end), matrixDistance = this.distances[from][to];
    const distanceMeters = matrixDistance == null ? null : matrixDistance * this.routeDistanceScale;
    const reachable = distanceMeters !== null;
    return {
      source: start,
      target: end,
      distanceMeters: distanceMeters ?? Infinity,
      coordinates: reachable ? [[start.lng, start.lat], [end.lng, end.lat]] : [],
      reachable,
      algorithm: 'Dijkstra',
      provider: this.provider,
      method: 'DIJKSTRA',
      routingMethod: 'NETWORK_ROUTE',
      fallbackUsed: false
    };
  }

  async getDistanceMatrix(points: Coordinate[]): Promise<DistanceMatrixResult> {
    assert.equal(points.length, this.distances.length);
    const methodsUsed = new Set<RoutingMethod>();
    const matrix = this.distances.map((row, i) => row.map((distanceMeters, j) => {
      const method = this.matrixMethodOverrides[`${i}-${j}`] ?? (this.matrixUsesFallback && i !== j ? 'HAVERSINE_FALLBACK' : 'DIJKSTRA');
      methodsUsed.add(method);
      return {
        reachable: distanceMeters !== null,
        distanceMeters,
        durationSeconds: null,
        provider: this.provider,
        method,
        fallbackUsed: method === 'HAVERSINE_FALLBACK'
      };
    }));
    return { points, matrix, provider: this.provider, methodsUsed: [...methodsUsed], fallbackUsed: [...methodsUsed].includes('HAVERSINE_FALLBACK') };
  }

  async getRoute(points: Coordinate[]): Promise<ProviderRouteResult> {
    const legs: ShortestPathResult[] = [];
    const geometry: [number, number][] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const leg = await this.findShortestPath(points[i], points[i + 1]);
      legs.push(leg);
      if (leg.coordinates.length) geometry.push(...(geometry.length ? leg.coordinates.slice(1) : leg.coordinates));
    }
    const reachable = legs.every(leg => leg.reachable);
    const distanceMeters = reachable ? legs.reduce((sum, leg) => sum + leg.distanceMeters, 0) : null;
    return { reachable, geometry: { type: 'LineString', coordinates: geometry }, distanceMeters, durationSeconds: null, legs, provider: this.provider, methodsUsed: ['DIJKSTRA'], fallbackUsed: false };
  }
}

const run = async () => {
  const graph = new RoadGraph();
  graph.addRoad({ coordinates: [[77.6, 12.9], [77.602, 12.9]] });
  const internal = new DijkstraRoadGraphProvider(graph);
  const networkPath = await internal.findShortestPath(point(77.6002), point(77.6018));
  assert.equal(networkPath.provider, 'INTERNAL');
  assert.equal(networkPath.method, 'DIJKSTRA');

  const fallbackPath = await new DijkstraRoadGraphProvider(new RoadGraph()).findShortestPath(point(77.6), point(77.601));
  assert.equal(fallbackPath.provider, 'INTERNAL');
  assert.equal(fallbackPath.method, 'HAVERSINE_FALLBACK');
  assert.equal(fallbackPath.routingMethod, 'STRAIGHT_LINE_FALLBACK');

  const longitudes = [77.6, 77.601, 77.602];
  const asymmetric = new MatrixFixtureProvider([
    [0, 4, 20],
    [40, 0, 3],
    [2, 30, 0]
  ], longitudes);
  const asymmetricMatrix = await asymmetric.getDistanceMatrix(longitudes.map(lng => point(lng)));
  assert.equal(asymmetricMatrix.matrix[0][1].distanceMeters, 4);
  assert.equal(asymmetricMatrix.matrix[1][0].distanceMeters, 40, 'the reverse direction retains its independent metric');

  const unreachableProvider = new MatrixFixtureProvider([
    [0, null],
    [null, 0]
  ], [77.6, 77.601]);
  const unreachableMatrix = await unreachableProvider.getDistanceMatrix([point(77.6), point(77.601)]);
  assert.equal(unreachableMatrix.matrix[0][1].reachable, false);
  assert.equal(unreachableMatrix.matrix[0][1].distanceMeters, null);
  const unreachableResult = await MultiStopOptimizer.optimizeRoute(point(77.6), [{ ...candidates('unreachable')[0], location: point(77.601) }], {}, unreachableProvider);
  assert.equal(unreachableResult.stopsCount, 0);
  assert.equal(unreachableResult.unreachableStops[0].infrastructureId, 'unreachable');

  const priorityProvider = new MatrixFixtureProvider([
    [0, 1000, 1500],
    [1000, 0, 500],
    [1500, 500, 0]
  ], [77.6, 77.601, 77.602]);
  const priorityStops = [
    { infrastructureId: 'near-low', location: point(77.601), priorityScore: 0, priorityLevel: 'Low' as const },
    { infrastructureId: 'far-critical', location: point(77.602), priorityScore: 100, priorityLevel: 'Critical' as const }
  ];
  const priorityResult = await MultiStopOptimizer.optimizeRoute(point(77.6), priorityStops, { priorityWeight: 1, apply2Opt: false }, priorityProvider);
  assert.equal(priorityResult.orderedStops[0].infrastructureId, 'far-critical', 'priority weighting still influences nearest-neighbor order');

  const savingsProvider = new MatrixFixtureProvider([
    [0, 1000, 500],
    [null, 0, 2000],
    [null, 500, 0]
  ], longitudes);
  const savingsResult = await MultiStopOptimizer.optimizeRoute(point(77.6), [
    { ...candidates('original-first')[0], location: point(77.601) },
    { ...candidates('original-second')[0], location: point(77.602) }
  ], { priorityWeight: 0, apply2Opt: false }, savingsProvider);
  assert.deepEqual(savingsResult.orderedStops.map(stop => stop.infrastructureId), ['original-second', 'original-first']);
  assert.equal(savingsResult.originalDistanceKm, 3, 'original distance uses the caller-provided stop order');
  assert.equal(savingsResult.optimizedDistanceKm, 1, 'optimized comparison distance uses the same matrix metric');
  assert.equal(savingsResult.distanceSavingsKm, 2);
  assert.equal(savingsResult.totalDistanceKm, 1, 'final displayed route distance remains based on the selected provider route');

  const unreachableOriginalProvider = new MatrixFixtureProvider([
    [0, 100, 50],
    [null, 0, null],
    [null, 50, 0]
  ], longitudes);
  const unreachableOriginalResult = await MultiStopOptimizer.optimizeRoute(point(77.6), [
    { ...candidates('original-unreachable-first')[0], location: point(77.601) },
    { ...candidates('original-unreachable-second')[0], location: point(77.602) }
  ], { priorityWeight: 0, apply2Opt: false }, unreachableOriginalProvider);
  assert.deepEqual(unreachableOriginalResult.orderedStops.map(stop => stop.infrastructureId), ['original-unreachable-second', 'original-unreachable-first']);
  assert.equal(unreachableOriginalResult.originalDistanceKm, undefined, 'unreachable original sequence has no comparison values');
  assert.equal(unreachableOriginalResult.distanceSavingsKm, undefined);
  assert.equal(unreachableOriginalResult.savingsPercent, undefined);

  const mixedMatrixProvider = new MatrixFixtureProvider([
    [0, 1000, 500],
    [null, 0, 2000],
    [null, 500, 0]
  ], longitudes, true, 2);
  const mixedMatrixResult = await MultiStopOptimizer.optimizeRoute(point(77.6), [
    { ...candidates('matrix-fallback-first')[0], location: point(77.601) },
    { ...candidates('matrix-fallback-second')[0], location: point(77.602) }
  ], { priorityWeight: 0, apply2Opt: false }, mixedMatrixProvider);
  assert.equal(mixedMatrixResult.fallbackUsed, true, 'fallback metrics used during ordering remain visible in the final result');
  assert.equal(mixedMatrixResult.routingMethod, 'STRAIGHT_LINE_FALLBACK');
  assert.deepEqual(new Set(mixedMatrixResult.methodsUsed), new Set(['DIJKSTRA', 'HAVERSINE_FALLBACK']));
  assert.ok(mixedMatrixResult.orderedStops.every(stop => stop.method === 'DIJKSTRA'), 'the selected final geometry legs retain their network method');
  assert.equal(mixedMatrixResult.totalDistanceKm, 2, 'displayed distance comes from final network route legs');
  assert.equal(mixedMatrixResult.originalDistanceKm, 3, 'comparison values come from the fallback-influenced provider matrix');
  assert.equal(mixedMatrixResult.optimizedDistanceKm, 1);
  assert.equal(mixedMatrixResult.distanceSavingsKm, 2);
  assert.equal(mixedMatrixResult.algorithm.shortestPath, undefined, 'mixed matrix methods do not claim a pure Dijkstra result');

  const unlikeMatrixProvider = new MatrixFixtureProvider([
    [0, 100, 50],
    [null, 0, 1000],
    [null, 50, 0]
  ], longitudes, false, 1, { '0-2': 'HAVERSINE_FALLBACK' });
  const unlikeMatrixResult = await MultiStopOptimizer.optimizeRoute(point(77.6), [
    { ...candidates('unlike-first')[0], location: point(77.601) },
    { ...candidates('unlike-second')[0], location: point(77.602) }
  ], { priorityWeight: 0, apply2Opt: false }, unlikeMatrixProvider);
  assert.deepEqual(unlikeMatrixResult.orderedStops.map(stop => stop.infrastructureId), ['unlike-second', 'unlike-first']);
  assert.equal(unlikeMatrixResult.originalDistanceKm, undefined, 'different matrix routing-method sequences are not compared');
  assert.equal(unlikeMatrixResult.optimizedDistanceKm, undefined);
  assert.equal(unlikeMatrixResult.distanceSavingsKm, undefined);
  assert.equal(unlikeMatrixResult.savingsPercent, undefined);

  const twoOptProvider = new MatrixFixtureProvider([
    [0, 100, 200, 300],
    [100, 0, 100, 150],
    [200, 1000, 0, 1000],
    [300, 1000, 1, 0]
  ], [77.6, 77.601, 77.602, 77.603]);
  const twoOptStops = [
    { infrastructureId: 'a', location: point(77.601), priorityScore: 0, priorityLevel: 'Low' as const },
    { infrastructureId: 'b', location: point(77.602), priorityScore: 0, priorityLevel: 'Low' as const },
    { infrastructureId: 'c', location: point(77.603), priorityScore: 0, priorityLevel: 'Low' as const }
  ];
  const twoOptResult = await MultiStopOptimizer.optimizeRoute(point(77.6), twoOptStops, { priorityWeight: 0 }, twoOptProvider);
  assert.deepEqual(twoOptResult.orderedStops.map(stop => stop.infrastructureId), ['a', 'c', 'b'], '2-opt evaluates directed reverse transitions');

  const dijkstraRoute = await MultiStopOptimizer.optimizeRoute(point(77.6002), [{ ...candidates('geojson-stop')[0], location: point(77.6018) }], {}, internal);
  assert.deepEqual(dijkstraRoute.routeGeometry.coordinates[0], [77.6002, 12.9], 'GeoJSON coordinates remain [longitude, latitude]');
  assert.equal(dijkstraRoute.provider, 'INTERNAL');
  assert.ok(dijkstraRoute.methodsUsed.includes('DIJKSTRA'));
  assert.equal(dijkstraRoute.algorithm.shortestPath, 'Dijkstra', 'legacy Dijkstra label remains for pure Dijkstra results');

  const futureProviderDescription = buildRoutingAlgorithmDescription('OSRM', ['OSRM_TABLE', 'OSRM_ROUTE']);
  assert.match(futureProviderDescription, /OSRM/);
  assert.doesNotMatch(futureProviderDescription, /Dijkstra/i, 'provider-neutral metadata must not label a non-Dijkstra provider as Dijkstra');

  console.log('Routing provider contract tests passed.');
};

await run();
