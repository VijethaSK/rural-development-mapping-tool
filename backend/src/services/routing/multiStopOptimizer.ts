import { Coordinate, StopCandidate, OrderedStop, RouteOptimizationOptions, RouteOptimizationResult, IRoutingProvider, RoutingMethod } from './types.js';
import { getRoutingProvider } from './routingProvider.js';

export const MAX_ROUTE_STOPS = 50;

export function buildRoutingAlgorithmDescription(provider: string, methods: readonly RoutingMethod[]): string {
  const methodSummary = methods.length ? methods.join(', ') : 'no route legs';
  return `${provider} routing used ${methodSummary} across matrix and selected-route calculations; priority-weighted nearest-neighbor ordering and 2-opt are sequencing heuristics, not an exact multi-stop shortest-path solution.`;
}

type MatrixPathMeasurement = { distanceMeters: number; methodSignature: string[] };

function measureMatrixPath(matrix: Awaited<ReturnType<IRoutingProvider['getDistanceMatrix']>>, indexes: number[]): MatrixPathMeasurement | null {
  let distanceMeters = 0;
  const methodSignature: string[] = [];
  for (let i = 0; i < indexes.length - 1; i++) {
    const cell = matrix.matrix[indexes[i]]?.[indexes[i + 1]];
    if (!cell?.reachable || cell.distanceMeters == null || !Number.isFinite(cell.distanceMeters) || cell.distanceMeters < 0) return null;
    distanceMeters += cell.distanceMeters;
    methodSignature.push(`${cell.provider}:${cell.method}:${cell.fallbackUsed}`);
  }
  return { distanceMeters, methodSignature };
}

function getComparableMatrixDistances(
  matrix: Awaited<ReturnType<IRoutingProvider['getDistanceMatrix']>>,
  originalIndexes: number[],
  optimizedIndexes: number[]
): { originalDistanceKm: number; optimizedDistanceKm: number; distanceSavingsKm: number; savingsPercent: number } | null {
  const original = measureMatrixPath(matrix, originalIndexes);
  const optimized = measureMatrixPath(matrix, optimizedIndexes);
  if (!original || !optimized || original.methodSignature.length !== optimized.methodSignature.length ||
      original.methodSignature.some((method, index) => method !== optimized.methodSignature[index])) return null;

  const savingsMeters = original.distanceMeters - optimized.distanceMeters;
  return {
    originalDistanceKm: Number((original.distanceMeters / 1000).toFixed(2)),
    optimizedDistanceKm: Number((optimized.distanceMeters / 1000).toFixed(2)),
    distanceSavingsKm: Number((savingsMeters / 1000).toFixed(2)),
    savingsPercent: original.distanceMeters > 0 ? Number((savingsMeters / original.distanceMeters * 100).toFixed(1)) : 0
  };
}

export class MultiStopOptimizer {
  public static validateCoordinate(coord: Coordinate, label = 'Coordinate'): void {
    if (!coord || !Number.isFinite(coord.lat) || !Number.isFinite(coord.lng) || coord.lat < -90 || coord.lat > 90 || coord.lng < -180 || coord.lng > 180) {
      throw new Error(`Invalid ${label}: latitude/longitude must be finite and within geographic bounds.`);
    }
  }

  /** Identical IDs are duplicate requests; distinct assets at the same place remain separate stops. */
  public static deduplicateStops(stops: StopCandidate[]): StopCandidate[] {
    const seen = new Set<string>();
    return stops.filter(stop => {
      if (!stop.infrastructureId || seen.has(stop.infrastructureId)) return false;
      seen.add(stop.infrastructureId);
      return true;
    });
  }

  public static formatArrivalTime(startHour = 9, startMinute = 0, elapsedMinutes = 0): string {
    const total = startHour * 60 + startMinute + Math.round(elapsedMinutes);
    const h24 = Math.floor(total / 60) % 24;
    const mins = total % 60;
    return `${String(h24 % 12 || 12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
  }

  public static async optimizeRoute(start: Coordinate, inputStops: StopCandidate[], options: RouteOptimizationOptions = {}, customProvider?: IRoutingProvider): Promise<RouteOptimizationResult> {
    this.validateCoordinate(start, 'start location');
    if (!Array.isArray(inputStops)) throw new Error('maintenanceLocations must be an array.');
    if (inputStops.length > MAX_ROUTE_STOPS) throw new Error(`A route may contain at most ${MAX_ROUTE_STOPS} stops.`);
    inputStops.forEach((s, i) => this.validateCoordinate(s.location, `maintenance location #${i + 1}`));
    const stops = this.deduplicateStops(inputStops);
    const algorithmBase = { ordering: 'Priority-Weighted Nearest Neighbor' as const, improvement: '2-opt' as const };
    const emptyAlgorithm = { ...algorithmBase, description: 'No routing provider was invoked because no stops were supplied; priority-weighted nearest-neighbor ordering and 2-opt are stop-sequencing heuristics.' };
    if (!stops.length) return { orderedStops: [], routeGeometry: { type: 'LineString', coordinates: [[start.lng, start.lat]] }, totalDistanceKm: 0, totalDistanceMeters: 0, estimatedDurationMinutes: 0, provider: null, methodsUsed: [], matrixFallbackUsed: false, routingMethod: 'NETWORK_ROUTE', fallbackUsed: false, unreachableStops: [], stopsCount: 0, originalDistanceKm: 0, optimizedDistanceKm: 0, distanceSavingsKm: 0, savingsPercent: 0, algorithm: emptyAlgorithm, explanation: { summary: 'No maintenance stops provided.', tradeoffRationale: emptyAlgorithm.description, stopOrderReasons: [] } };

    const speed = options.averageSpeedKmph ?? 30;
    if (!Number.isFinite(speed) || speed <= 0 || speed > 120) throw new Error('averageSpeedKmph must be greater than 0 and no more than 120.');
    const weight = options.priorityWeight ?? 1.4;
    if (!Number.isFinite(weight) || weight < 0 || weight > 3) throw new Error('priorityWeight must be between 0 and 3.');

    const provider = customProvider || await getRoutingProvider(options.panchayatId);
    const points = [start, ...stops.map(s => s.location)];
    const matrix = await provider.getDistanceMatrix(points);
    if (matrix.provider !== provider.provider || matrix.matrix.length !== points.length || matrix.matrix.some(row => row.length !== points.length)) {
      throw new Error('Routing provider returned a distance matrix with invalid provider metadata or dimensions.');
    }
    // Each direction is read independently; OSRM and other providers may be asymmetric.
    // Null/unreachable entries become Infinity only for the existing ordering heuristics.
    const distances = matrix.matrix.map(row => row.map(cell =>
      cell.reachable && cell.distanceMeters !== null && Number.isFinite(cell.distanceMeters) && cell.distanceMeters >= 0
        ? cell.distanceMeters
        : Infinity
    ));

    const unreachableIndices = new Set<number>();
    for (let i = 1; i < points.length; i++) if (!Number.isFinite(distances[0][i])) unreachableIndices.add(i);
    const remaining = new Set<number>(Array.from({ length: stops.length }, (_, i) => i + 1).filter(i => !unreachableIndices.has(i)));
    const order: number[] = [];
    let current = 0;
    while (remaining.size) {
      let best = -1, bestCost = Infinity;
      for (const i of remaining) {
        const priority = Math.max(0, stops[i - 1].priorityScore || 0) / 100;
        const cost = distances[current][i] / (1 + weight * Math.pow(priority, 1.5));
        if (Number.isFinite(cost) && cost < bestCost) { best = i; bestCost = cost; }
      }
      if (best < 0) { for (const i of remaining) unreachableIndices.add(i); break; }
      order.push(best); remaining.delete(best); current = best;
    }

    // 2-opt uses directed costs for every transition and accepts only reachable reversals.
    if ((options.apply2Opt ?? true) && order.length > 2) {
      const cost = (sequence: number[]) => {
        let total = distances[0][sequence[0]];
        for (let i = 0; i < sequence.length - 1; i++) total += distances[sequence[i]][sequence[i + 1]];
        for (let i = 0; i < sequence.length; i++) total += i * Math.max(0, stops[sequence[i] - 1].priorityScore || 0) / 100 * 1200;
        return total;
      };
      let improved = true, rounds = 0;
      while (improved && rounds++ < 80) {
        improved = false;
        for (let i = 0; i < order.length - 1 && !improved; i++) for (let k = i + 1; k < order.length; k++) {
          const candidate = [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
          if (candidate.every((id, j) => Number.isFinite(distances[j === 0 ? 0 : candidate[j - 1]][id])) && cost(candidate) < cost(order) - 10) { order.splice(0, order.length, ...candidate); improved = true; break; }
        }
      }
    }

    // Geometry is requested only for the selected order, not for every matrix pair.
    const orderedPoints = [start, ...order.map(index => stops[index - 1].location)];
    const route = await provider.getRoute(orderedPoints);
    if (!route.reachable || route.distanceMeters === null || route.legs.length !== order.length) {
      throw new Error('Routing provider could not return geometry for the selected reachable stop sequence.');
    }

    const allNetwork = route.legs.every(leg => leg.routingMethod === 'NETWORK_ROUTE');
    const allProviderDurations = route.legs.every(leg => leg.durationSeconds != null);
    const canEstimateDuration = allNetwork;
    let meters = 0, elapsed = 0;
    const orderedStops: OrderedStop[] = [];
    for (let n = 0; n < order.length; n++) {
      const stop = stops[order[n] - 1], leg = route.legs[n];
      if (!leg.reachable || !Number.isFinite(leg.distanceMeters)) throw new Error('Routing provider returned an unreachable leg in the selected route sequence.');
      const legKm = leg.distanceMeters / 1000;
      meters += leg.distanceMeters;
      if (canEstimateDuration) elapsed += allProviderDurations ? (leg.durationSeconds! / 60) : (legKm / speed) * 60;
      const arrival = canEstimateDuration ? elapsed : undefined;
      const distanceDescription = leg.method === 'HAVERSINE_FALLBACK'
        ? 'distance calculated using Straight-line Haversine fallback'
        : `network distance calculated by ${leg.method}`;
      orderedStops.push({
        sequence: orderedStops.length + 1,
        infrastructureId: stop.infrastructureId,
        infrastructureName: stop.infrastructureName || `Asset ${stop.infrastructureId}`,
        type: stop.type,
        location: stop.location,
        priorityScore: stop.priorityScore,
        priorityLevel: stop.priorityLevel,
        distanceFromPreviousKm: Number(legKm.toFixed(2)),
        durationSeconds: leg.durationSeconds ?? null,
        cumulativeDistanceKm: Number((meters / 1000).toFixed(2)),
        ...(arrival == null ? {} : { estimatedArrivalMinutes: Math.round(arrival), estimatedArrivalTime: this.formatArrivalTime(9, 0, arrival) }),
        routingMethod: leg.routingMethod,
        provider: leg.provider,
        method: leg.method,
        reasonForOrder: `Stop #${orderedStops.length + 1}: priority-weighted nearest-neighbor sequencing; ${distanceDescription}.`
      });
      if (canEstimateDuration) elapsed += 15;
    }

    const unreachableStops = [...unreachableIndices].map(i => ({ infrastructureId: stops[i - 1].infrastructureId, infrastructureName: stops[i - 1].infrastructureName || `Asset ${stops[i - 1].infrastructureId}`, reason: 'No reachable transition from the depot or previously selected route segment; stop excluded from route geometry.' }));
    const totalMeters = route.distanceMeters;
    const totalKm = Number((totalMeters / 1000).toFixed(2));
    const comparison = getComparableMatrixDistances(
      matrix,
      [0, ...stops.map((_, index) => index + 1)],
      [0, ...order]
    );
    // Matrix fallback cells also influenced stop ordering, even when a selected leg is network-routed.
    const fallbackUsed = matrix.fallbackUsed || route.fallbackUsed || route.legs.some(leg => leg.fallbackUsed);
    const methodsUsed = [...new Set<RoutingMethod>(matrix.methodsUsed.concat(route.methodsUsed, route.legs.map(leg => leg.method)))];
    const legacyDijkstraLabel = route.provider === 'INTERNAL' && methodsUsed.length === 1 && methodsUsed[0] === 'DIJKSTRA'
      ? { shortestPath: 'Dijkstra' as const }
      : {};
    const algorithm = { ...algorithmBase, ...legacyDijkstraLabel, description: buildRoutingAlgorithmDescription(route.provider, methodsUsed) };
    const summary = `${orderedStops.length} reachable stop(s), ${totalKm} km${fallbackUsed ? ' with explicitly identified straight-line fallback metrics used during optimization or routing' : ' by network routing'}${unreachableStops.length ? `; ${unreachableStops.length} stop(s) unreachable` : ''}.`;

    return {
      orderedStops,
      routeGeometry: route.geometry,
      totalDistanceKm: totalKm,
      totalDistanceMeters: Math.round(totalMeters),
      estimatedDurationMinutes: canEstimateDuration ? Math.round(elapsed) : null,
      provider: route.provider,
      methodsUsed,
      matrixFallbackUsed: matrix.fallbackUsed,
      routingMethod: fallbackUsed ? 'STRAIGHT_LINE_FALLBACK' : 'NETWORK_ROUTE',
      fallbackUsed,
      unreachableStops,
      stopsCount: orderedStops.length,
      ...(comparison ?? {}),
      algorithm,
      explanation: { summary, tradeoffRationale: algorithm.description, stopOrderReasons: orderedStops.map(s => `${s.sequence}. ${s.infrastructureName}: ${s.reasonForOrder}`) }
    };
  }
}
